import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageCircle,
  Sparkles,
  RefreshCw,
  Send,
  TrendingUp,
  Eye,
  Edit3,
  Plus,
  BarChart3,
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import { whatsappLink } from "@/lib/phone";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/mensageria")({
  beforeLoad: () => {
    throw redirect({ to: "/app/recorrencia", search: { tab: "mensageria" } as any });
  },
  component: () => null,
});

type TabKey = "fila" | "templates" | "dashboard";

const TYPE_LABEL: Record<string, string> = {
  RETURN: "Retorno",
  REPURCHASE: "Recompra",
  RENEWAL: "Renovação",
  REACTIVATION: "Reativação",
  COLLECTION: "Cobrança",
  BIRTHDAY: "Aniversário",
  FOLLOW_UP: "Pós-atendimento",
  CUSTOM: "Personalizada",
};

const PLAN_LIMIT: Record<string, number> = {
  starter: 500,
  basic: 500,
  professional: 5000,
  pro: 5000,
  premium: 20000,
  growth: 20000,
};

export function MensageriaPage() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;
  const isAdmin = profile?.role === "owner" || profile?.role === "admin";
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("fila");

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
            <Sparkles className="h-3 w-3" /> Messaging Intelligence Engine
          </div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight mt-1">Mensageria</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A mensagem certa, para a pessoa certa, no momento certo.
          </p>
        </div>
        {companyId && (
          <EnqueueButton
            companyId={companyId}
            onDone={() => qc.invalidateQueries({ queryKey: ["mie"] })}
          />
        )}
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="fila">
            <Send className="h-3.5 w-3.5 mr-1.5" /> Fila
          </TabsTrigger>
          <TabsTrigger value="templates">
            <Edit3 className="h-3.5 w-3.5 mr-1.5" /> Templates
          </TabsTrigger>
          <TabsTrigger value="dashboard">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" /> Dashboard
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "fila" && companyId && <Fila companyId={companyId} />}
      {tab === "templates" && companyId && <Templates companyId={companyId} canEdit={isAdmin} />}
      {tab === "dashboard" && companyId && (
        <Dashboard companyId={companyId} plan={profile?.company?.plan ?? "starter"} />
      )}
    </div>
  );
}

/* ---------------- Enqueue ---------------- */

function EnqueueButton({ companyId, onDone }: { companyId: string; onDone: () => void }) {
  const mut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("mie_enqueue_from_opportunities", {
        _company_id: companyId,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(`${n ?? 0} mensagem(ns) adicionada(s) à fila`);
      onDone();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao gerar fila"),
  });
  return (
    <Button onClick={() => mut.mutate()} disabled={mut.isPending} className="shadow-glow">
      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${mut.isPending ? "animate-spin" : ""}`} />
      Gerar fila do RIE
    </Button>
  );
}

/* ---------------- Fila ---------------- */

type QueueRow = {
  id: string;
  client_id: string;
  type: string;
  priority: number;
  offset_days: number;
  scheduled_at: string;
  rendered_body: string;
  status: string;
  clients: { id: string; name: string; phone: string | null } | null;
  template_id: string | null;
};

function Fila({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<QueueRow | null>(null);

  const { data: profile } = useCurrentProfile();
  const shouldRestrictRecurrence = profile?.role === "employee" && !profile?.permissions?.view_all_recurrence;

  const { data: myProfessional } = useQuery({
    enabled: !!companyId && shouldRestrictRecurrence && !!profile,
    queryKey: ["my-professional-mensageria-fila", profile?.userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("professionals")
        .select("id, name")
        .eq("user_id", profile!.userId)
        .maybeSingle();
      return data;
    },
  });

  const { data: restrictedClientIds } = useQuery({
    enabled: !!companyId && shouldRestrictRecurrence && !!myProfessional?.id,
    queryKey: ["my-served-clients-mensageria-fila", myProfessional?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("client_id")
        .eq("professional_id", myProfessional!.id);
      if (error) throw error;
      return Array.from(new Set(data.map((d) => d.client_id).filter(Boolean)));
    },
  });

  const list = useQuery({
    queryKey: ["mie", "queue", companyId, shouldRestrictRecurrence, restrictedClientIds],
    enabled: !!companyId && (!shouldRestrictRecurrence || restrictedClientIds !== undefined),
    queryFn: async () => {
      let q = supabase
        .from("message_queue")
        .select(
          "id, client_id, type, priority, offset_days, scheduled_at, rendered_body, status, template_id, clients(id,name,phone)",
        )
        .eq("company_id", companyId)
        .in("status", ["READY", "PENDING", "SENT"])
        .order("priority", { ascending: false })
        .order("scheduled_at", { ascending: true });

      if (shouldRestrictRecurrence) {
        if (!restrictedClientIds || restrictedClientIds.length === 0) {
          return [];
        }
        q = q.in("client_id", restrictedClientIds);
      }

      const { data, error } = await q.limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as QueueRow[];
    },
  });

  const ready = useMemo(() => (list.data ?? []).filter((r) => r.status === "READY"), [list.data]);
  const allSelected = ready.length > 0 && ready.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(ready.map((r) => r.id)));
  }

  const markSent = useMutation({
    mutationFn: async (ids: string[]) => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("message_queue")
        .update({ status: "SENT", sent_at: now })
        .in("id", ids);
      if (error) throw error;
      const rows = (list.data ?? []).filter((r) => ids.includes(r.id));
      const logs = rows.map((r) => ({
        company_id: companyId,
        queue_id: r.id,
        client_id: r.client_id,
        template_id: r.template_id,
        event: "SENT" as const,
        channel: "WHATSAPP" as const,
        metadata: { type: r.type, offset: r.offset_days },
      }));
      if (logs.length) await supabase.from("message_logs").insert(logs);
    },
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["mie"] });
    },
  });

  function sendBulk() {
    const rows = ready.filter((r) => selected.has(r.id) && r.clients?.phone);
    if (rows.length === 0) {
      toast.error("Selecione clientes com WhatsApp.");
      return;
    }
    let opened = 0;
    for (const r of rows) {
      const url = whatsappLink(r.clients!.phone, r.rendered_body);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        opened++;
      }
    }
    markSent.mutate(rows.map((r) => r.id));
    toast.success(`${opened} conversa(s) aberta(s)`);
  }

  function skip(id: string) {
    supabase
      .from("message_queue")
      .update({ status: "SKIPPED" })
      .eq("id", id)
      .then(() => qc.invalidateQueries({ queryKey: ["mie"] }));
  }

  return (
    <Card className="overflow-hidden shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 bg-muted/30">
        <label className="flex items-center gap-2 text-xs font-medium">
          <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
          Selecionar prontos ({ready.length})
        </label>
        <Button size="sm" onClick={sendBulk} disabled={selected.size === 0}>
          <Send className="h-3.5 w-3.5 mr-1.5" />
          Enviar {selected.size}
        </Button>
      </div>

      {list.isLoading ? (
        <div className="p-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (list.data ?? []).length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Fila vazia. Clique em "Gerar fila do RIE" para criar mensagens a partir das oportunidades.
        </div>
      ) : (
        <ul className="divide-y">
          {(list.data ?? []).map((r) => {
            const isSel = selected.has(r.id);
            const due = r.status === "READY";
            const sent = r.status === "SENT";
            return (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20">
                {due && (
                  <Checkbox checked={isSel} onCheckedChange={() => toggle(r.id)} className="mt-1" />
                )}
                {!due && <span className="w-4" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{r.clients?.name ?? "—"}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {TYPE_LABEL[r.type] ?? r.type}
                    </Badge>
                    <Badge
                      variant={due ? "default" : sent ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {sent
                        ? "Enviado"
                        : due
                          ? "Pronto"
                          : `Em ${Math.max(0, Math.ceil((new Date(r.scheduled_at).getTime() - Date.now()) / 86400000))}d`}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      offset {r.offset_days >= 0 ? "+" : ""}
                      {r.offset_days}d
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {r.rendered_body}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                  {due && (
                    <Button size="sm" variant="ghost" onClick={() => skip(r.id)}>
                      Pular
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <EditMessageDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["mie"] });
          }}
        />
      )}
    </Card>
  );
}

function EditMessageDialog({
  row,
  onClose,
  onSaved,
}: {
  row: QueueRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [body, setBody] = useState(row.rendered_body);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("message_queue")
      .update({ rendered_body: body })
      .eq("id", row.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Mensagem atualizada");
    onSaved();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar mensagem · {row.clients?.name}</DialogTitle>
        </DialogHeader>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Templates ---------------- */

type Tpl = {
  id: string;
  name: string;
  type: string;
  channel: string;
  body: string;
  active: boolean;
  cadence_offsets: number[];
  is_default: boolean | null;
};

function Templates({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Tpl | "new" | null>(null);

  const list = useQuery({
    queryKey: ["mie", "templates", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_templates")
        .select("id, name, type, channel, body, active, cadence_offsets, is_default")
        .eq("company_id", companyId)
        .order("type", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Tpl[];
    },
  });

  return (
    <Card className="overflow-hidden shadow-soft">
      <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/30">
        <p className="text-xs font-medium">Templates ({list.data?.length ?? 0})</p>
        {canEdit && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Novo template
          </Button>
        )}
      </div>
      {list.isLoading ? (
        <div className="p-4 space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (list.data ?? []).length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Nenhum template ainda.
        </div>
      ) : (
        <ul className="divide-y">
          {(list.data ?? []).map((t) => (
            <li key={t.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{t.name}</p>
                  <Badge variant="outline" className="text-[10px]">
                    {TYPE_LABEL[t.type] ?? t.type}
                  </Badge>
                  {t.is_default && (
                    <Badge variant="secondary" className="text-[10px]">
                      padrão
                    </Badge>
                  )}
                  {!t.active && (
                    <Badge variant="destructive" className="text-[10px]">
                      inativo
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    cadência:{" "}
                    {(t.cadence_offsets ?? []).map((o) => (o >= 0 ? `+${o}` : `${o}`)).join(", ")}d
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.body}</p>
              </div>
              {canEdit && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                  <Edit3 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <TemplateDialog
          companyId={companyId}
          tpl={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["mie", "templates"] });
          }}
        />
      )}
    </Card>
  );
}

function TemplateDialog({
  companyId,
  tpl,
  onClose,
  onSaved,
}: {
  companyId: string;
  tpl: Tpl | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(tpl?.name ?? "");
  const [type, setType] = useState(tpl?.type ?? "RETURN");
  const [body, setBody] = useState(tpl?.body ?? "Olá {{primeiro_nome}}! ");
  const [active, setActive] = useState(tpl?.active ?? true);
  const [cadence, setCadence] = useState((tpl?.cadence_offsets ?? [-7, -3, 0, 7]).join(","));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !body.trim()) {
      toast.error("Nome e mensagem são obrigatórios");
      return;
    }
    const offsets = cadence
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    setSaving(true);
    const payload = {
      company_id: companyId,
      name,
      type: type as any,
      body,
      active,
      cadence_offsets: offsets,
      channel: "WHATSAPP" as const,
      category: type.toLowerCase(),
    };
    const res = tpl
      ? await supabase.from("message_templates").update(payload).eq("id", tpl.id)
      : await supabase.from("message_templates").insert(payload);
    setSaving(false);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    toast.success("Salvo");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tpl ? "Editar template" : "Novo template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mensagem</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
            <p className="text-[10px] text-muted-foreground mt-1">
              Variáveis: {"{{primeiro_nome}}, {{cliente}}, {{empresa}}, {{link_agendamento}}"}
            </p>
          </div>
          <div>
            <Label>Cadência (dias, ex: -7,-3,0,7)</Label>
            <Input value={cadence} onChange={(e) => setCadence(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={active} onCheckedChange={(c) => setActive(!!c)} /> Ativo
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Dashboard ---------------- */

function Dashboard({ companyId, plan }: { companyId: string; plan: string }) {
  const limit = PLAN_LIMIT[plan] ?? 500;

  const { data: profile } = useCurrentProfile();
  const shouldRestrictRecurrence = profile?.role === "employee" && !profile?.permissions?.view_all_recurrence;

  const { data: myProfessional } = useQuery({
    enabled: !!companyId && shouldRestrictRecurrence && !!profile,
    queryKey: ["my-professional-mensageria-dash", profile?.userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("professionals")
        .select("id, name")
        .eq("user_id", profile!.userId)
        .maybeSingle();
      return data;
    },
  });

  const { data: restrictedClientIds } = useQuery({
    enabled: !!companyId && shouldRestrictRecurrence && !!myProfessional?.id,
    queryKey: ["my-served-clients-mensageria-dash", myProfessional?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("client_id")
        .eq("professional_id", myProfessional!.id);
      if (error) throw error;
      return Array.from(new Set(data.map((d) => d.client_id).filter(Boolean)));
    },
  });

  const stats = useQuery({
    queryKey: ["mie", "dashboard", companyId, shouldRestrictRecurrence, restrictedClientIds],
    enabled: !!companyId && (!shouldRestrictRecurrence || restrictedClientIds !== undefined),
    queryFn: async () => {
      const startMonth = new Date();
      startMonth.setDate(1);
      startMonth.setHours(0, 0, 0, 0);

      let logsQuery = supabase
        .from("message_logs")
        .select("event, template_id, created_at, client_id")
        .eq("company_id", companyId)
        .gte("created_at", startMonth.toISOString());

      let queueQuery = supabase
        .from("message_queue")
        .select("status, recovered_value, template_id, client_id")
        .eq("company_id", companyId);

      if (shouldRestrictRecurrence) {
        if (!restrictedClientIds || restrictedClientIds.length === 0) {
          return { logs: [], queue: [] };
        }
        logsQuery = logsQuery.in("client_id", restrictedClientIds);
        queueQuery = queueQuery.in("client_id", restrictedClientIds);
      }

      const { data: logs } = await logsQuery;
      const { data: queue } = await queueQuery;

      return { logs: logs ?? [], queue: queue ?? [] };
    },
  });

  const sent = (stats.data?.logs ?? []).filter((l: any) => l.event === "SENT").length;
  const converted = (stats.data?.logs ?? []).filter((l: any) => l.event === "CONVERTED").length;
  const recovered = (stats.data?.queue ?? [])
    .filter((q: any) => q.status === "CONVERTED")
    .reduce((a: number, b: any) => a + Number(b.recovered_value ?? 0), 0);
  const convRate = sent > 0 ? (converted / sent) * 100 : 0;

  const templates = useQuery({
    queryKey: ["mie", "tpl-names", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("message_templates")
        .select("id,name")
        .eq("company_id", companyId);
      const m: Record<string, string> = {};
      (data ?? []).forEach((t: any) => {
        m[t.id] = t.name;
      });
      return m;
    },
  });

  // Template score
  const byTpl: Record<string, { sent: number; conv: number }> = {};
  (stats.data?.logs ?? []).forEach((l: any) => {
    if (!l.template_id) return;
    byTpl[l.template_id] ??= { sent: 0, conv: 0 };
    if (l.event === "SENT") byTpl[l.template_id].sent++;
    if (l.event === "CONVERTED") byTpl[l.template_id].conv++;
  });
  const ranking = Object.entries(byTpl)
    .map(([id, v]) => ({
      id,
      name: templates.data?.[id] ?? id,
      ...v,
      rate: v.sent ? (v.conv / v.sent) * 100 : 0,
    }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Enviadas (mês)" value={String(sent)} sub={`limite ${limit}`} icon={Send} />
        <Stat label="Convertidas" value={String(converted)} icon={TrendingUp} />
        <Stat label="Taxa de conversão" value={`${convRate.toFixed(1)}%`} icon={Eye} highlight />
        <Stat
          label="Receita recuperada"
          value={formatBRL(recovered)}
          icon={MessageCircle}
          highlight
        />
      </section>

      <Card className="shadow-soft">
        <div className="border-b px-4 py-3 bg-muted/30">
          <p className="text-xs font-medium">Ranking de templates (Template Score)</p>
        </div>
        {ranking.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Sem dados suficientes ainda.
          </div>
        ) : (
          <ul className="divide-y">
            {ranking.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.sent} enviadas · {r.conv} convertidas
                  </p>
                </div>
                <span className="text-lg font-semibold text-primary tabular-nums">
                  {r.rate.toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: any;
  highlight?: boolean;
}) {
  return (
    <Card
      className={`p-4 shadow-soft ${highlight ? "border-primary/30 bg-gradient-to-br from-card to-accent/30" : ""}`}
    >
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <span
          className={`grid h-7 w-7 place-items-center rounded-lg ${highlight ? "gradient-primary text-primary-foreground" : "bg-secondary text-primary"}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  );
}
