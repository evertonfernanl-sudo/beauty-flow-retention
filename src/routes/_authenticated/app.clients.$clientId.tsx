import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Cake, Calendar, DollarSign, Edit3, MessageCircle, Phone,
  Plus, Sparkles, TrendingDown, Clock, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/app/clients/$clientId")({
  head: () => ({ meta: [{ title: "Cliente · BeautyFlow" }] }),
  component: ClientProfilePage,
});

function ClientProfilePage() {
  const { clientId } = Route.useParams();
  const navigate = useNavigate();
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;
  const canEdit = profile?.role === "owner" || profile?.role === "admin";
  const queryClient = useQueryClient();

  const clientQ = useQuery({
    enabled: !!companyId,
    queryKey: ["client", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const appointmentsQ = useQuery({
    enabled: !!companyId,
    queryKey: ["client-appointments", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, start_datetime, status, price, notes, cancellation_reason, services(name)")
        .eq("client_id", clientId)
        .eq("company_id", companyId!)
        .order("start_datetime", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const contactsQ = useQuery({
    enabled: !!companyId,
    queryKey: ["client-contacts", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_contacts")
        .select("*")
        .eq("client_id", clientId)
        .order("contacted_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const returnQ = useQuery({
    enabled: !!companyId,
    queryKey: ["client-return", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("return_opportunities")
        .select("*, services(name)")
        .eq("client_id", clientId)
        .eq("converted", false)
        .order("expected_return_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const c = clientQ.data;
  const isLost = c?.status === "LOST";
  const isBirthdayMonth = c?.birthday && new Date(c.birthday).getMonth() === new Date().getMonth();
  const ticketAvg = c && c.appointments_count > 0 ? Number(c.total_spent) / c.appointments_count : 0;
  const daysSince = c?.last_visit
    ? Math.floor((Date.now() - new Date(c.last_visit).getTime()) / 86400000)
    : null;

  const waLink = useMemo(() => {
    if (!c?.phone) return null;
    const phone = String(c.phone).replace(/\D/g, "");
    if (!phone) return null;
    const firstName = c.name.split(" ")[0];
    const msg = isLost
      ? `Olá ${firstName}, sentimos sua falta! Que tal agendarmos seu próximo atendimento?`
      : `Olá ${firstName}, tudo bem? 💜`;
    return `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`;
  }, [c, isLost]);

  if (clientQ.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!c) return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/clients" })}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </Button>
      <p>Cliente não encontrada.</p>
    </div>
  );

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/app/clients"><ArrowLeft className="h-4 w-4 mr-1" /> Clientes</Link>
      </Button>

      {/* Header */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
              <StatusBadge status={c.status} />
              {isBirthdayMonth && (
                <Badge variant="outline" className="gap-1"><Cake className="h-3 w-3" /> Aniversariante do mês</Badge>
              )}
              {isLost && (
                <Badge variant="destructive" className="gap-1"><TrendingDown className="h-3 w-3" /> Cliente perdida</Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {c.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
              {c.email && <span>{c.email}</span>}
              {c.instagram && <span>{c.instagram}</span>}
              {c.profession && <span>{c.profession}</span>}
              <span>Cadastro: {new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            {waLink && (
              <Button asChild variant="secondary">
                <a href={waLink} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                </a>
              </Button>
            )}
            <Button asChild>
              <Link to="/app/agenda"><Plus className="h-4 w-4 mr-1" /> Novo agendamento</Link>
            </Button>
            {canEdit && <EditClientButton client={c} onSaved={() => queryClient.invalidateQueries({ queryKey: ["client", clientId] })} />}
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<DollarSign className="h-4 w-4" />} label="Total gasto" value={formatBRL(Number(c.total_spent))} />
        <Kpi icon={<Sparkles className="h-4 w-4" />} label="Atendimentos" value={String(c.appointments_count)} />
        <Kpi icon={<TrendingDown className="h-4 w-4" />} label="Ticket médio" value={formatBRL(ticketAvg)} />
        <Kpi
          icon={<Clock className="h-4 w-4" />}
          label="Dias sem retornar"
          value={daysSince === null ? "—" : String(daysSince)}
          highlight={daysSince !== null && daysSince > 90}
        />
      </div>

      {/* Return card */}
      {returnQ.data && (
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary">Próximo retorno</p>
              <p className="mt-1 font-medium">
                {new Date(returnQ.data.expected_return_date).toLocaleDateString("pt-BR")} ·{" "}
                {(returnQ.data as any).services?.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {returnQ.data.days_late > 0
                  ? `${returnQ.data.days_late} dia(s) em atraso`
                  : `em ${Math.max(0, Math.ceil((new Date(returnQ.data.expected_return_date).getTime() - Date.now()) / 86400000))} dia(s)`}
                {" · "} Receita potencial: {formatBRL(Number(returnQ.data.estimated_value))}
              </p>
            </div>
            {waLink && (
              <Button asChild size="sm" variant="secondary">
                <a href={waLink} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4 mr-1" /> Convidar
                </a>
              </Button>
            )}
          </div>
        </Card>
      )}

      <Tabs defaultValue="history">
        <TabsList className="grid grid-cols-4 max-w-xl">
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="contacts">Contatos</TabsTrigger>
          <TabsTrigger value="notes">Observações</TabsTrigger>
          <TabsTrigger value="financial">Financeiro</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-4">
          <Card className="p-4">
            {appointmentsQ.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : !appointmentsQ.data?.length ? (
              <EmptyState text="Nenhum atendimento registrado." />
            ) : (
              <ul className="divide-y">
                {appointmentsQ.data.map((a: any) => (
                  <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-center w-14 shrink-0">
                        <p className="text-xs font-semibold">
                          {new Date(a.start_datetime).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(a.start_datetime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{a.services?.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {a.cancellation_reason ? `Cancelado: ${a.cancellation_reason}` : (a.notes ?? formatBRL(Number(a.price)))}
                        </p>
                      </div>
                    </div>
                    <AppointmentStatusPill status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="contacts" className="mt-4 space-y-3">
          <RegisterContact clientId={clientId} companyId={companyId} userId={profile?.userId}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["client-contacts", clientId] })} />
          <Card className="p-4">
            {contactsQ.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : !contactsQ.data?.length ? (
              <EmptyState text="Nenhum contato registrado ainda." />
            ) : (
              <ul className="divide-y">
                {contactsQ.data.map((ct: any) => (
                  <li key={ct.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {channelLabel(ct.channel)} {ct.result && <span className="text-muted-foreground">· {resultLabel(ct.result)}</span>}
                      </p>
                      {ct.notes && <p className="text-xs text-muted-foreground truncate">{ct.notes}</p>}
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0">
                      {new Date(ct.contacted_at).toLocaleDateString("pt-BR")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <NotesEditor clientId={clientId} initial={c.notes ?? ""}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["client", clientId] })} />
        </TabsContent>

        <TabsContent value="financial" className="mt-4">
          <Card className="p-6 text-center">
            <DollarSign className="h-6 w-6 mx-auto text-primary" />
            <p className="mt-2 text-2xl font-semibold">{formatBRL(Number(c.total_spent))}</p>
            <p className="text-sm text-muted-foreground">Receita acumulada gerada por esta cliente</p>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Mobile sticky actions */}
      <div className="md:hidden fixed bottom-16 inset-x-0 z-30 border-t bg-background/95 backdrop-blur px-3 py-2 flex gap-2">
        {waLink && (
          <Button asChild variant="secondary" className="flex-1">
            <a href={waLink} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4 mr-1" />WhatsApp</a>
          </Button>
        )}
        <Button asChild className="flex-1">
          <Link to="/app/agenda"><Plus className="h-4 w-4 mr-1" />Agendar</Link>
        </Button>
        {canEdit && <EditClientButton client={c} onSaved={() => queryClient.invalidateQueries({ queryKey: ["client", clientId] })} compact />}
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={`p-4 ${highlight ? "border-destructive/40 bg-destructive/5" : ""}`}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs">{icon}<span>{label}</span></div>
      <p className={`mt-1 text-xl font-semibold ${highlight ? "text-destructive" : ""}`}>{value}</p>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground">
      <AlertCircle className="h-5 w-5 mx-auto mb-2 opacity-60" />
      {text}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ACTIVE: { label: "Ativa", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
    INACTIVE: { label: "Inativa", cls: "bg-muted text-muted-foreground" },
    LOST: { label: "Perdida", cls: "bg-destructive/15 text-destructive" },
  };
  const m = map[status] ?? map.ACTIVE;
  return <span className={`text-[10px] rounded-full px-2 py-0.5 ${m.cls}`}>{m.label}</span>;
}

function AppointmentStatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    SCHEDULED: { label: "Agendado", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
    CONFIRMED: { label: "Confirmado", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
    COMPLETED: { label: "Concluído", cls: "bg-primary/15 text-primary" },
    CANCELLED: { label: "Cancelado", cls: "bg-destructive/15 text-destructive" },
    NO_SHOW: { label: "Faltou", cls: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  };
  const m = map[status] ?? map.SCHEDULED;
  return <span className={`text-[10px] rounded-full px-2 py-0.5 ${m.cls}`}>{m.label}</span>;
}

function channelLabel(c: string) {
  return ({ WHATSAPP: "WhatsApp", PHONE: "Telefone", INSTAGRAM: "Instagram", IN_PERSON: "Presencial", EMAIL: "E-mail" } as Record<string, string>)[c] ?? c;
}
function resultLabel(r: string) {
  return ({ ANSWERED: "Respondeu", NO_ANSWER: "Não respondeu", SCHEDULED: "Agendou", REFUSED: "Recusou" } as Record<string, string>)[r] ?? r;
}

// --- Subcomponents ---

const editSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("E-mail inválido").max(255).optional().or(z.literal("")),
  birthday: z.string().optional().or(z.literal("")),
  instagram: z.string().trim().max(60).optional().or(z.literal("")),
  profession: z.string().trim().max(80).optional().or(z.literal("")),
});

function EditClientButton({ client, onSaved, compact }: { client: any; onSaved: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: client.name,
      phone: client.phone ?? "",
      email: client.email ?? "",
      birthday: client.birthday ?? "",
      instagram: client.instagram ?? "",
      profession: client.profession ?? "",
    },
  });
  async function onSave(v: z.infer<typeof editSchema>) {
    const { error } = await supabase.from("clients").update({
      name: v.name,
      phone: v.phone || null,
      email: v.email || null,
      birthday: v.birthday || null,
      instagram: v.instagram || null,
      profession: v.profession || null,
    }).eq("id", client.id);
    if (error) {
      if (error.code === "23505") toast.error("Telefone já cadastrado em outra cliente.");
      else toast.error(error.message);
      return;
    }
    toast.success("Cliente atualizada");
    setOpen(false);
    onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size={compact ? "icon" : "default"}>
          <Edit3 className="h-4 w-4" />{!compact && <span className="ml-1">Editar</span>}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar cliente</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-3">
          <div className="space-y-2"><Label>Nome</Label><Input {...form.register("name")} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>WhatsApp</Label><Input {...form.register("phone")} /></div>
            <div className="space-y-2"><Label>Aniversário</Label><Input type="date" {...form.register("birthday")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Instagram</Label><Input {...form.register("instagram")} /></div>
            <div className="space-y-2"><Label>Profissão</Label><Input {...form.register("profession")} /></div>
          </div>
          <div className="space-y-2"><Label>E-mail</Label><Input type="email" {...form.register("email")} /></div>
          <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NotesEditor({ clientId, initial, onSaved }: { clientId: string; initial: string; onSaved: () => void }) {
  const [val, setVal] = useState(initial);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const { error } = await supabase.from("clients").update({ notes: val }).eq("id", clientId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Observações salvas");
    onSaved();
  }
  return (
    <Card className="p-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        Anote preferências, alergias e informações importantes desta cliente.
      </p>
      <Textarea rows={6} value={val} onChange={(e) => setVal(e.target.value)} placeholder="Ex.: alergia a henna, prefere atendimento às quintas..." />
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>Salvar observações</Button>
      </div>
    </Card>
  );
}

function RegisterContact({ clientId, companyId, userId, onSaved }: { clientId: string; companyId?: string; userId?: string; onSaved: () => void }) {
  const [channel, setChannel] = useState<string>("WHATSAPP");
  const [result, setResult] = useState<string>("ANSWERED");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!companyId) return;
    setSaving(true);
    const { error } = await supabase.from("client_contacts").insert({
      company_id: companyId, client_id: clientId, user_id: userId ?? null,
      channel: channel as any, result: result as any, notes: notes || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Contato registrado");
    setNotes("");
    onSaved();
  }

  return (
    <Card className="p-4 space-y-3">
      <p className="text-sm font-medium">Registrar contato</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Canal</Label>
          <Select value={channel} onValueChange={setChannel}>
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
        <div className="space-y-2">
          <Label>Resultado</Label>
          <Select value={result} onValueChange={setResult}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ANSWERED">Respondeu</SelectItem>
              <SelectItem value="NO_ANSWER">Não respondeu</SelectItem>
              <SelectItem value="SCHEDULED">Agendou</SelectItem>
              <SelectItem value="REFUSED">Recusou</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Textarea rows={2} placeholder="Observações (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}><Plus className="h-4 w-4 mr-1" />Registrar</Button>
      </div>
    </Card>
  );
}
