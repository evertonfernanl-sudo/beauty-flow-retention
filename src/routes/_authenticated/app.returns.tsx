import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Heart, MessageCircle, RefreshCw, TrendingUp, Search, Sparkles,
  Phone, Calendar, ClipboardList, Cake, Trophy, Crown,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/returns")({
  head: () => ({
    meta: [
      { title: "Clientes para Retorno · BeautyFlow" },
      { name: "description", content: "Veja quem está pronta para voltar — e quanto faturamento você pode recuperar hoje." },
    ],
  }),
  component: RecoveryPage,
});

type Filter = "all" | "today" | "week" | "at_risk" | "lost" | "vip";

function RecoveryPage() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  // Refresh on entry
  useEffect(() => {
    if (!companyId) return;
    supabase.rpc("refresh_return_opportunities").then(() =>
      supabase.rpc("refresh_recovery_opportunities", { _company: companyId }).then(() => {
        qc.invalidateQueries({ queryKey: ["recovery"] });
      })
    );
  }, [companyId, qc]);

  const dash = useQuery({
    enabled: !!companyId,
    queryKey: ["recovery", "dashboard", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("recovery_dashboard")
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      return data ?? {
        pending_count: 0, at_risk_count: 0, lost_count: 0,
        potential_revenue: 0, recovered_count_month: 0, recovered_value_month: 0,
        recovery_rate: 0, avg_days_to_recover: 0, avg_recovered_ticket: 0,
      };
    },
  });

  const vipSet = useQuery({
    enabled: !!companyId,
    queryKey: ["recovery", "vip", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("vip_clients").select("id").eq("company_id", companyId!);
      return new Set((data ?? []).map((r: any) => r.id));
    },
  });

  const list = useQuery({
    enabled: !!companyId,
    queryKey: ["recovery", "list", companyId, filter],
    queryFn: async () => {
      let q = supabase
        .from("recovery_opportunities")
        .select("id, status, classification, score, days_late, potential_value, expected_return_date, last_contact_at, clients(id, name, phone, last_visit), services(name)")
        .eq("company_id", companyId!)
        .in("status", ["OPEN", "IN_CONTACT"])
        .order("potential_value", { ascending: false })
        .limit(200);

      if (filter === "today") q = q.eq("expected_return_date", new Date().toISOString().slice(0, 10));
      if (filter === "week") {
        const in7 = new Date(); in7.setDate(in7.getDate() + 7);
        q = q.lte("expected_return_date", in7.toISOString().slice(0, 10));
      }
      if (filter === "at_risk") q = q.eq("classification", "AT_RISK");
      if (filter === "lost") q = q.eq("classification", "LOST");

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    let rows = list.data ?? [];
    if (filter === "vip" && vipSet.data) rows = rows.filter((r: any) => vipSet.data!.has(r.clients?.id));
    if (search.trim()) {
      const s = search.toLowerCase();
      rows = rows.filter((r: any) =>
        r.clients?.name?.toLowerCase().includes(s) ||
        r.clients?.phone?.toLowerCase().includes(s) ||
        r.services?.name?.toLowerCase().includes(s)
      );
    }
    // priority sort
    return [...rows].sort((a: any, b: any) =>
      (Number(b.potential_value) * b.score / 100 + b.days_late * 10) -
      (Number(a.potential_value) * a.score / 100 + a.days_late * 10)
    );
  }, [list.data, filter, search, vipSet.data]);

  async function refresh() {
    if (!companyId) return;
    await supabase.rpc("refresh_return_opportunities");
    await supabase.rpc("refresh_recovery_opportunities", { _company: companyId });
    qc.invalidateQueries({ queryKey: ["recovery"] });
    toast.success("Lista atualizada");
  }

  const d = dash.data!;

  return (
    <div className="space-y-6 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-medium text-primary">
            <Heart className="h-3 w-3" /> Coração do BeautyFlow
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Clientes para Retorno</h1>
          <p className="text-sm text-muted-foreground">Sua central de recuperação de faturamento.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-1" /> Recalcular
        </Button>
      </header>

      {/* KPI row */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi loading={dash.isLoading} icon={ClipboardList} label="Clientes para Retorno" value={String(d?.pending_count ?? 0)} />
        <Kpi loading={dash.isLoading} icon={TrendingUp} label="Receita Potencial" value={formatBRL(Number(d?.potential_revenue ?? 0))} highlight />
        <Kpi loading={dash.isLoading} icon={Sparkles} label="Em Risco" value={String(d?.at_risk_count ?? 0)} tone="warning" />
        <Kpi loading={dash.isLoading} icon={Heart} label="Perdidos" value={String(d?.lost_count ?? 0)} tone="destructive" />
        <Kpi loading={dash.isLoading} icon={Trophy} label="Taxa de Recuperação" value={`${Number(d?.recovery_rate ?? 0).toFixed(0)}%`} />
      </section>

      {/* Recovered banner */}
      <Card className="p-5 border-primary/30 bg-gradient-to-br from-secondary/40 to-card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Receita Recuperada · Este Mês</p>
          <p className="mt-1 text-3xl font-semibold">{formatBRL(Number(d?.recovered_value_month ?? 0))}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Você recuperou {d?.recovered_count_month ?? 0} cliente{(d?.recovered_count_month ?? 0) === 1 ? "" : "s"} este mês 🎉
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>Ticket médio recuperado: <span className="font-semibold text-foreground">{formatBRL(Number(d?.avg_recovered_ticket ?? 0))}</span></p>
          <p>Tempo médio para retorno: <span className="font-semibold text-foreground">{Math.round(Number(d?.avg_days_to_recover ?? 0))}d</span></p>
        </div>
      </Card>

      {/* Filters & search */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="flex-1 min-w-[280px]">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="today">Hoje</TabsTrigger>
            <TabsTrigger value="week">Esta Semana</TabsTrigger>
            <TabsTrigger value="at_risk">Em Risco</TabsTrigger>
            <TabsTrigger value="lost">Perdidos</TabsTrigger>
            <TabsTrigger value="vip"><Crown className="h-3 w-3 mr-1" />VIP</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, telefone, serviço…" className="pl-9" />
        </div>
      </div>

      {/* List */}
      <Card className="p-2 sm:p-4">
        {list.isLoading ? (
          <div className="space-y-2 py-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y">
            {filtered.map((r: any) => (
              <RecoveryRow
                key={r.id}
                row={r}
                isVip={vipSet.data?.has(r.clients?.id) ?? false}
                onOpen={() => setSelected(r.id)}
              />
            ))}
          </ul>
        )}
      </Card>

      {selected && (
        <RecoverySheet
          opportunityId={selected}
          onClose={() => setSelected(null)}
          companyId={companyId!}
          whatsappTemplate={(profile?.company as any)?.whatsapp_template as string | undefined}
        />
      )}
    </div>
  );
}

function Kpi({
  loading, icon: Icon, label, value, highlight, tone,
}: { loading?: boolean; icon: any; label: string; value: string; highlight?: boolean; tone?: "warning" | "destructive" }) {
  const valColor = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-[color:var(--color-warning)]" : highlight ? "text-primary" : "";
  return (
    <Card className={`p-4 shadow-soft ${highlight ? "border-primary/30 bg-gradient-to-br from-card to-accent/30" : ""}`}>
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${highlight ? "gradient-primary text-primary-foreground" : "bg-secondary text-primary"}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className={`mt-2 text-2xl font-semibold ${valColor}`}>
        {loading ? <Skeleton className="h-7 w-20" /> : value}
      </p>
    </Card>
  );
}

function RecoveryRow({ row, isVip, onOpen }: { row: any; isVip: boolean; onOpen: () => void }) {
  const cls = row.classification as string;
  return (
    <li className="py-3 px-1 sm:px-2 flex flex-wrap items-center justify-between gap-3 hover:bg-muted/30 rounded-lg transition cursor-pointer" onClick={onOpen}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium truncate">{row.clients?.name}</p>
          {isVip && <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-amber-200 gap-1"><Crown className="h-3 w-3" />VIP</Badge>}
          <ClassBadge cls={cls} daysLate={row.days_late} />
          {row.status === "IN_CONTACT" && <Badge variant="secondary">em contato</Badge>}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {row.services?.name ?? "—"} · esperado em {new Date(row.expected_return_date).toLocaleDateString("pt-BR")}
          {row.clients?.last_visit && ` · última: ${new Date(row.clients.last_visit).toLocaleDateString("pt-BR")}`}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <ScoreRing score={row.score} />
        <div className="text-right">
          <p className="text-sm font-semibold text-primary tabular-nums">{formatBRL(Number(row.potential_value))}</p>
          <p className="text-[11px] text-muted-foreground">potencial</p>
        </div>
      </div>
    </li>
  );
}

function ScoreRing({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, score));
  const color = s >= 70 ? "text-success" : s >= 40 ? "text-[color:var(--color-warning)]" : "text-destructive";
  return (
    <div className={`relative h-10 w-10 ${color}`} aria-label={`Score ${s}`}>
      <svg viewBox="0 0 36 36" className="h-10 w-10 -rotate-90">
        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3" />
        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${(s / 100) * 94.25} 94.25`} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[10px] font-semibold tabular-nums">{s}</span>
    </div>
  );
}

function ClassBadge({ cls, daysLate }: { cls: string; daysLate: number }) {
  const map: Record<string, { label: string; cn: string }> = {
    ON_TIME:   { label: "em dia",   cn: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    ATTENTION: { label: "atenção",  cn: "bg-yellow-100 text-yellow-900 border-yellow-200" },
    LATE:      { label: `${daysLate}d atrasada`, cn: "bg-orange-100 text-orange-900 border-orange-200" },
    AT_RISK:   { label: "em risco", cn: "bg-red-100 text-red-800 border-red-200" },
    LOST:      { label: "perdida",  cn: "bg-zinc-200 text-zinc-700 border-zinc-300" },
  };
  const v = map[cls] ?? map.ON_TIME;
  return <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 border ${v.cn}`}>{v.label}</span>;
}

function EmptyState() {
  return (
    <div className="py-16 text-center">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
        <TrendingUp className="h-5 w-5" />
      </div>
      <p className="mt-3 font-medium">Tudo em dia por aqui 👏</p>
      <p className="text-sm text-muted-foreground">Volte amanhã para novas oportunidades.</p>
    </div>
  );
}

// =========================================
// Sheet: client detail + actions
// =========================================
function RecoverySheet({
  opportunityId, onClose, companyId, whatsappTemplate,
}: { opportunityId: string; onClose: () => void; companyId: string; whatsappTemplate?: string }) {
  const qc = useQueryClient();
  const [showContact, setShowContact] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  const opp = useQuery({
    queryKey: ["recovery", "detail", opportunityId],
    queryFn: async () => {
      const { data } = await supabase
        .from("recovery_opportunities")
        .select("*, clients(*), services(name, price, return_days)")
        .eq("id", opportunityId)
        .maybeSingle();
      return data;
    },
  });

  const contacts = useQuery({
    enabled: !!opp.data?.client_id,
    queryKey: ["client_contacts", opp.data?.client_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_contacts")
        .select("*")
        .eq("client_id", opp.data!.client_id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const recent = useQuery({
    enabled: !!opp.data?.client_id,
    queryKey: ["client_apts", opp.data?.client_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("id, start_datetime, price, status, services(name)")
        .eq("client_id", opp.data!.client_id)
        .order("start_datetime", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const c = opp.data?.clients as any;
  const daysSince = c?.last_visit ? Math.floor((Date.now() - new Date(c.last_visit).getTime()) / 86400000) : null;

  function sendWhatsApp() {
    if (!c?.phone) { toast.error("Cliente sem telefone"); return; }
    const tpl = whatsappTemplate ?? "Olá {{nome}}! Saudades de você por aqui 💕 Vamos agendar seu retorno?";
    const msg = tpl.replace(/\{\{nome\}\}/g, (c.name ?? "").split(" ")[0]);
    const clean = c.phone.replace(/\D/g, "");
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");

    // mark as in_contact
    supabase.from("recovery_opportunities")
      .update({ status: "IN_CONTACT", last_contact_at: new Date().toISOString() })
      .eq("id", opportunityId).then(() => qc.invalidateQueries({ queryKey: ["recovery"] }));
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {c?.name ?? "Cliente"}
          </SheetTitle>
          <SheetDescription>
            {c?.phone ? <a href={`tel:${c.phone}`} className="underline">{c.phone}</a> : "Sem telefone"}
            {c?.email && ` · ${c.email}`}
          </SheetDescription>
        </SheetHeader>

        {!opp.data ? (
          <div className="py-8"><Skeleton className="h-32" /></div>
        ) : (
          <div className="mt-4 space-y-5">
            {/* Score + class */}
            <div className="flex items-center gap-4">
              <ScoreRing score={opp.data.score} />
              <div className="flex-1">
                <ClassBadge cls={opp.data.classification as string} daysLate={opp.data.days_late} />
                <p className="text-xs text-muted-foreground mt-1">
                  {daysSince !== null ? `${daysSince} dias sem retornar` : "Nunca retornou"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Receita potencial</p>
                <p className="text-lg font-semibold text-primary">{formatBRL(Number(opp.data.potential_value))}</p>
              </div>
            </div>

            {/* Financial KPIs */}
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Receita histórica" value={formatBRL(Number(c?.total_spent ?? 0))} />
              <Stat label="Atendimentos" value={String(c?.appointments_count ?? 0)} />
              <Stat label="Ticket médio" value={formatBRL(c?.appointments_count ? Number(c.total_spent) / c.appointments_count : 0)} />
            </div>

            {/* Actions */}
            <div className="grid grid-cols-3 gap-2">
              <Button onClick={sendWhatsApp} className="gap-1"><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
              <Button variant="outline" onClick={() => setShowSchedule(true)} className="gap-1"><Calendar className="h-4 w-4" /> Agendar</Button>
              <Button variant="outline" onClick={() => setShowContact(true)} className="gap-1"><Phone className="h-4 w-4" /> Registrar</Button>
            </div>

            {/* Timeline */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Últimos atendimentos</h3>
              {recent.data?.length ? (
                <ul className="space-y-1.5 text-sm">
                  {recent.data.map((a: any) => (
                    <li key={a.id} className="flex justify-between border-b last:border-0 py-1.5">
                      <span>
                        <span className="text-muted-foreground">{new Date(a.start_datetime).toLocaleDateString("pt-BR")}</span>
                        {" · "}{a.services?.name ?? "—"}
                      </span>
                      <span className="text-muted-foreground">{formatBRL(Number(a.price))} · {a.status}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Sem histórico.</p>}
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Histórico de contatos</h3>
              {contacts.data?.length ? (
                <ul className="space-y-1.5 text-sm">
                  {contacts.data.map((ct: any) => (
                    <li key={ct.id} className="border-b last:border-0 py-1.5">
                      <div className="flex justify-between">
                        <span className="font-medium">{ct.channel}</span>
                        <span className="text-muted-foreground text-xs">{new Date(ct.created_at).toLocaleDateString("pt-BR")}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{ct.result}{ct.notes ? ` — ${ct.notes}` : ""}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Nenhum contato registrado ainda.</p>}
            </div>

            <div className="flex justify-between gap-2 border-t pt-4">
              <Button variant="ghost" size="sm" onClick={async () => {
                await supabase.from("recovery_opportunities").update({ status: "LOST" }).eq("id", opportunityId);
                qc.invalidateQueries({ queryKey: ["recovery"] });
                toast.success("Marcada como perdida");
                onClose();
              }}>Marcar como perdida</Button>
            </div>
          </div>
        )}

        {showContact && opp.data && (
          <ContactDialog
            companyId={companyId}
            clientId={opp.data.client_id}
            opportunityId={opportunityId}
            onClose={() => setShowContact(false)}
            onSaved={() => qc.invalidateQueries({ queryKey: ["client_contacts", opp.data!.client_id] })}
          />
        )}

        {showSchedule && opp.data && (
          <ScheduleDialog
            companyId={companyId}
            clientId={opp.data.client_id}
            defaultServiceId={opp.data.service_id ?? undefined}
            onClose={() => setShowSchedule(false)}
            onSaved={() => { qc.invalidateQueries({ queryKey: ["recovery"] }); onClose(); }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}

function ContactDialog({
  companyId, clientId, opportunityId, onClose, onSaved,
}: { companyId: string; clientId: string; opportunityId: string; onClose: () => void; onSaved: () => void }) {
  const [channel, setChannel] = useState<"WHATSAPP" | "PHONE" | "INSTAGRAM" | "IN_PERSON" | "EMAIL">("WHATSAPP");
  const [result, setResult] = useState<"ANSWERED" | "NO_ANSWER" | "SCHEDULED" | "REFUSED">("NO_ANSWER");
  const [notes, setNotes] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      const { error: e1 } = await supabase.from("client_contacts").insert({
        company_id: companyId, client_id: clientId, channel, result, notes: notes || null,
      });
      if (e1) throw e1;
      const newStatus = result === "SCHEDULED" ? "CONVERTED" : "IN_CONTACT";
      await supabase.from("recovery_opportunities")
        .update({ status: newStatus, last_contact_at: new Date().toISOString() })
        .eq("id", opportunityId);
    },
    onSuccess: () => { toast.success("Contato registrado"); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar contato</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Canal</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                <SelectItem value="PHONE">Telefone</SelectItem>
                <SelectItem value="INSTAGRAM">Instagram</SelectItem>
                <SelectItem value="IN_PERSON">Presencial</SelectItem>
                <SelectItem value="EMAIL">E-mail</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Resultado</Label>
            <Select value={result} onValueChange={(v) => setResult(v as typeof result)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NO_ANSWER">Sem resposta</SelectItem>
                <SelectItem value="ANSWERED">Respondeu</SelectItem>
                <SelectItem value="SCHEDULED">Agendou</SelectItem>
                <SelectItem value="REFUSED">Não tem interesse</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observação</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({
  companyId, clientId, defaultServiceId, onClose, onSaved,
}: { companyId: string; clientId: string; defaultServiceId?: string; onClose: () => void; onSaved: () => void }) {
  const [serviceId, setServiceId] = useState<string>(defaultServiceId ?? "");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState<string>("09:00");

  const services = useQuery({
    queryKey: ["services", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("services").select("id, name, price, duration_minutes").eq("company_id", companyId).eq("active", true);
      return data ?? [];
    },
  });

  const m = useMutation({
    mutationFn: async () => {
      const svc = services.data?.find((s: any) => s.id === serviceId);
      if (!svc) throw new Error("Selecione um serviço");
      const start = new Date(`${date}T${time}:00`);
      const end = new Date(start.getTime() + (svc.duration_minutes ?? 60) * 60000);
      const { error } = await supabase.from("appointments").insert({
        company_id: companyId, client_id: clientId, service_id: serviceId,
        start_datetime: start.toISOString(), end_datetime: end.toISOString(),
        price: svc.price, status: "SCHEDULED",
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Agendamento criado"); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Agendar retorno</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Serviço</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {services.data?.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} · {formatBRL(Number(s.price))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label>Hora</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !serviceId}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
