import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { useFeature } from "@/lib/hooks/use-feature";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send, Plus, Trash2, Edit2, Lock } from "lucide-react";
import { toStoragePhone } from "@/lib/phone";
import { enqueueCampaignRecord } from "@/lib/api/campaigns.functions";

export const Route = createFileRoute("/_authenticated/app/comunicacao")({
  head: () => ({ meta: [{ title: "Comunicação — BeautyFlow" }] }),
  component: ComunicacaoPage,
});

type Template = {
  id: string;
  name: string;
  category: string;
  body: string;
  is_default: boolean;
};

type Segment = "ALL" | "ACTIVE" | "AT_RISK" | "LOST" | "RETURN_DUE";

const SEGMENT_LABEL: Record<Segment, string> = {
  ALL: "Todos os clientes",
  ACTIVE: "Clientes ativos",
  AT_RISK: "Em risco",
  LOST: "Perdidos",
  RETURN_DUE: "Para retornar (oportunidades abertas)",
};

function ComunicacaoPage() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Comunicação</h1>
        <p className="text-sm text-muted-foreground">
          Templates de mensagem e campanhas em massa via WhatsApp.
        </p>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
        </TabsList>
        <TabsContent value="templates" className="mt-4">
          <TemplatesPanel />
        </TabsContent>
        <TabsContent value="campaigns" className="mt-4">
          <CampaignsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ----------------------------- TEMPLATES ----------------------------- */

function TemplatesPanel() {
  const profile = useCurrentProfile().data;
  const companyId = profile?.company?.id;
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Template | null>(null);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["msg-templates", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_templates")
        .select("id,name,category,body,is_default")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("message_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["msg-templates"] });
      toast.success("Template removido");
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Seus templates</CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Novo template
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {q.data && q.data.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum template ainda. Crie modelos com variáveis{" "}
            <code className="rounded bg-muted px-1">{"{{nome}}"}</code> e{" "}
            <code className="rounded bg-muted px-1">{"{{servico}}"}</code>.
          </p>
        )}
        {q.data?.map((t) => (
          <div
            key={t.id}
            className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{t.name}</p>
                <Badge variant="secondary" className="text-xs">
                  {t.category}
                </Badge>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {t.body}
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setEditing(t);
                  setOpen(true);
                }}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => del.mutate(t.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <TemplateDialog
        open={open}
        onOpenChange={setOpen}
        template={editing}
        companyId={companyId}
      />
    </Card>
  );
}

function TemplateDialog({
  open,
  onOpenChange,
  template,
  companyId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: Template | null;
  companyId?: string;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(template?.name ?? "");
  const [category, setCategory] = useState(template?.category ?? "GENERAL");
  const [body, setBody] = useState(template?.body ?? "");

  // reset when opening
  useMemoEffect(() => {
    if (open) {
      setName(template?.name ?? "");
      setCategory(template?.category ?? "GENERAL");
      setBody(template?.body ?? "");
    }
  }, [open, template]);

  const save = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Sem empresa");
      const payload = {
        company_id: companyId,
        name: name.trim(),
        category,
        body: body.trim(),
      };
      if (template) {
        const { error } = await supabase
          .from("message_templates")
          .update(payload)
          .eq("id", template.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("message_templates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["msg-templates"] });
      toast.success(template ? "Template atualizado" : "Template criado");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{template ? "Editar template" : "Novo template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GENERAL">Geral</SelectItem>
                <SelectItem value="RETURN">Retorno</SelectItem>
                <SelectItem value="BIRTHDAY">Aniversário</SelectItem>
                <SelectItem value="PROMO">Promoção</SelectItem>
                <SelectItem value="REMINDER">Lembrete</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mensagem</Label>
            <Textarea
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Oi {{nome}}, está na hora do seu retorno!"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Variáveis disponíveis:{" "}
              <code className="rounded bg-muted px-1">{"{{nome}}"}</code>
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!name.trim() || !body.trim() || save.isPending}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- CAMPAIGNS ----------------------------- */

function CampaignsPanel() {
  const profile = useCurrentProfile().data;
  const companyId = profile?.company?.id;
  const feature = useFeature(companyId, "campaigns_bulk");
  const qc = useQueryClient();
  const enqueueCampaign = useServerFn(enqueueCampaignRecord);

  const [name, setName] = useState("");
  const [segment, setSegment] = useState<Segment>("AT_RISK");
  const [templateId, setTemplateId] = useState<string>("");
  const [body, setBody] = useState("");

  const templatesQ = useQuery({
    queryKey: ["msg-templates", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("message_templates")
        .select("id,name,body")
        .eq("company_id", companyId!);
      return data ?? [];
    },
  });

  const clientsQ = useQuery({
    queryKey: ["campaign-clients", companyId, segment],
    enabled: !!companyId,
    queryFn: async () => {
      let query = supabase
        .from("clients")
        .select("id,name,phone,status")
        .eq("company_id", companyId!)
        .not("phone", "is", null);

      if (segment === "ACTIVE") query = query.eq("status", "ACTIVE");
      else if (segment === "LOST") query = query.eq("status", "LOST");

      const { data, error } = await query.limit(500);
      if (error) throw error;
      let rows = (data ?? []) as { id: string; name: string; phone: string | null }[];

      if (segment === "AT_RISK" || segment === "RETURN_DUE") {
        const classes: ("ATTENTION" | "AT_RISK" | "LATE" | "LOST" | "ON_TIME")[] =
          segment === "AT_RISK" ? ["AT_RISK", "LATE"] : ["ON_TIME", "ATTENTION", "LATE"];
        const { data: ops } = await supabase
          .from("recovery_opportunities")
          .select("client_id")
          .eq("company_id", companyId!)
          .in("status", ["OPEN", "IN_CONTACT"])
          .in("classification", classes);
        const ids = new Set((ops ?? []).map((o) => o.client_id));
        rows = rows.filter((r) => ids.has(r.id));
      }
      return rows;
    },
  });

  const clients = clientsQ.data ?? [];

  const record = useMutation({
    mutationFn: async (sent: number) => {
      await enqueueCampaign({
        data: {
          name: name.trim() || `Campanha ${new Date().toLocaleDateString("pt-BR")}`,
          segment,
          template_id: templateId || null,
          message_body: body,
          sent_count: sent,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns-list"] });
      toast.success("Campanha enfileirada — registro processado em segundo plano.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templatesQ.data?.find((x) => x.id === id);
    if (t) setBody(t.body);
  }

  function openAll() {
    if (!body.trim()) {
      toast.error("Escreva ou selecione uma mensagem");
      return;
    }
    let opened = 0;
    for (const c of clients) {
      const phone = toStoragePhone(c.phone ?? "");
      if (!phone) continue;
      const msg = body.replaceAll("{{nome}}", c.name || "");
      const url = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
      window.open(url, "_blank", "noopener");
      opened++;
    }
    if (opened > 0) record.mutate(opened);
    toast.success(`${opened} conversas abertas`);
  }

  if (!feature.loading && !feature.enabled) {
    return (
      <Card className="p-8 text-center space-y-2">
        <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="font-medium">Campanhas em massa desativadas</p>
        <p className="text-sm text-muted-foreground">
          Ative em Admin → Feature Flags (campaigns_bulk).
        </p>
      </Card>
    );
  }


  const preview = useMemo(() => {
    if (!clients[0]) return body;
    return body.replaceAll("{{nome}}", clients[0].name || "Cliente");
  }, [body, clients]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova campanha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nome (opcional)</Label>
            <Input
              placeholder="Ex.: Reativação de inverno"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <Label>Segmento</Label>
            <Select value={segment} onValueChange={(v) => setSegment(v as Segment)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SEGMENT_LABEL) as Segment[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SEGMENT_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {clients.length} cliente(s) com WhatsApp neste segmento
            </p>
          </div>

          <div>
            <Label>Template</Label>
            <Select value={templateId} onValueChange={applyTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha um template (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {templatesQ.data?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Mensagem</Label>
            <Textarea
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Oi {{nome}}, sentimos sua falta!"
            />
          </div>

          <Button
            className="w-full"
            onClick={openAll}
            disabled={clients.length === 0 || !body.trim()}
          >
            <Send className="mr-2 h-4 w-4" />
            Abrir {clients.length} conversas no WhatsApp
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-muted/40 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <MessageSquare className="h-3 w-3" />
              {clients[0] ? `Para ${clients[0].name}` : "Sem destinatários"}
            </div>
            <p className="whitespace-pre-wrap text-sm">
              {preview || "Escreva uma mensagem para ver o preview…"}
            </p>
          </div>
          <CampaignsHistory companyId={companyId} />
        </CardContent>
      </Card>
    </div>
  );
}

function CampaignsHistory({ companyId }: { companyId?: string }) {
  const q = useQuery({
    queryKey: ["campaigns-list", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("id,name,segment,sent_count,last_sent_at")
        .eq("company_id", companyId!)
        .order("last_sent_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  if (!q.data || q.data.length === 0) return null;
  return (
    <div className="mt-6">
      <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
        Últimas campanhas
      </p>
      <div className="space-y-2">
        {q.data.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-md border p-2 text-sm"
          >
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">
                {SEGMENT_LABEL[c.segment as Segment] ?? c.segment}
              </p>
            </div>
            <div className="text-right">
              <p>{c.sent_count} envios</p>
              <p className="text-xs text-muted-foreground">
                {c.last_sent_at
                  ? new Date(c.last_sent_at).toLocaleDateString("pt-BR")
                  : "—"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// tiny helper to reset state when modal opens
import { useEffect } from "react";
function useMemoEffect(fn: () => void, deps: unknown[]) {
  useEffect(fn, deps);
}
