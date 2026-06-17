import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { MessageCircle, Sparkles, Search, AlertCircle, Clock, TrendingDown, XCircle, RefreshCw } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { whatsappLink } from "@/lib/phone";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/recorrencia")({
  head: () => ({ meta: [{ title: "Recorrência · BeautyFlow" }] }),
  component: RecorrenciaPage,
});

type TabKey = "retorno" | "recompra" | "renovacao" | "risco" | "perdidos";

type Row = {
  id: string;
  client_id: string;
  expected_return_date: string;
  potential_value: number;
  classification: string;
  days_late: number;
  status: string;
  clients: { id: string; name: string; phone: string | null } | null;
  services: { name: string | null } | null;
};

type ReturnClass = "ATTENTION" | "AT_RISK" | "LATE" | "LOST" | "ON_TIME";
const TAB_DEFS: { key: TabKey; label: string; icon: typeof Clock; classes: ReturnClass[]; verticals: ("BEAUTY"|"SALES"|"GYM")[] }[] = [
  { key: "retorno",   label: "Retorno",    icon: Clock,        classes: ["ATTENTION", "LATE"], verticals: ["BEAUTY"] },
  { key: "recompra",  label: "Recompra",   icon: RefreshCw,    classes: ["ATTENTION", "LATE"], verticals: ["SALES"] },
  { key: "renovacao", label: "Renovações", icon: Sparkles,     classes: ["ATTENTION", "LATE"], verticals: ["GYM"] },
  { key: "risco",     label: "Em Risco",   icon: AlertCircle,  classes: ["AT_RISK"],            verticals: ["BEAUTY","SALES","GYM"] },
  { key: "perdidos",  label: "Perdidos",   icon: XCircle,      classes: ["LOST"],               verticals: ["BEAUTY","SALES","GYM"] },
];

function RecorrenciaPage() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;
  const vertical = (profile?.company?.vertical as "BEAUTY"|"SALES"|"GYM") ?? "BEAUTY";
  const waTemplate = profile?.company?.whatsapp_template ?? "Olá {{nome}}! Vamos marcar seu próximo horário?";
  const qc = useQueryClient();

  const tabs = useMemo(
    () => TAB_DEFS.filter((t) => t.verticals.includes(vertical)),
    [vertical],
  );
  const primaryKey: TabKey = vertical === "SALES" ? "recompra" : vertical === "GYM" ? "renovacao" : "retorno";
  const [tab, setTab] = useState<TabKey>(primaryKey);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => { setSelected(new Set()); }, [tab]);

  useEffect(() => {
    if (!companyId) return;
    supabase.rpc("refresh_return_opportunities").then(() =>
      supabase.rpc("refresh_recovery_opportunities", { _company: companyId }).then(() => {
        qc.invalidateQueries({ queryKey: ["recorrencia"] });
      }),
    );
  }, [companyId, qc]);

  const activeTab = tabs.find((t) => t.key === tab) ?? tabs[0];
  const classes = activeTab?.classes ?? ["ATTENTION", "LATE"];

  const list = useQuery({
    enabled: !!companyId,
    queryKey: ["recorrencia", companyId, tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recovery_opportunities")
        .select("id, client_id, expected_return_date, potential_value, classification, days_late, status, clients(id, name, phone), services(name)")
        .eq("company_id", companyId!)
        .in("classification", classes)
        .in("status", ["OPEN", "IN_CONTACT"])
        .order("days_late", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const rows = list.data ?? [];
    if (!s) return rows;
    return rows.filter((r) => r.clients?.name?.toLowerCase().includes(s));
  }, [list.data, search]);

  const totalValue = filtered.reduce((acc, r) => acc + Number(r.potential_value ?? 0), 0);
  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  }

  function bulkOpen() {
    const rows = filtered.filter((r) => selected.has(r.id) && r.clients?.phone);
    if (rows.length === 0) {
      toast.error("Selecione clientes com WhatsApp.");
      return;
    }
    let opened = 0;
    for (const r of rows) {
      const msg = waTemplate.replace(/\{\{\s*nome\s*\}\}/gi, r.clients!.name.split(" ")[0]);
      const url = whatsappLink(r.clients!.phone, msg);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        opened++;
      }
    }
    toast.success(`${opened} conversa(s) aberta(s) no WhatsApp`);
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
          <Sparkles className="h-3 w-3" /> Motor de Recorrência
        </div>
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight mt-1">Ações de hoje</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {vertical === "SALES" ? "Clientes prontos para recomprar" :
           vertical === "GYM"   ? "Alunos prontos para renovar" :
                                  "Clientes prontos para voltar"}.
        </p>
      </header>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar cliente…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Oportunidades" value={list.isLoading ? "—" : String(filtered.length)} icon={TrendingDown} />
        <Stat label="Receita recuperável" value={list.isLoading ? "—" : formatBRL(totalValue)} icon={Sparkles} highlight />
        <Stat label="Selecionados" value={String(selected.size)} icon={MessageCircle} />
        <Stat label="Ticket médio" value={filtered.length ? formatBRL(totalValue / filtered.length) : "R$ 0,00"} icon={RefreshCw} />
      </section>

      <Card className="overflow-hidden shadow-soft">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3 bg-muted/30">
          <label className="flex items-center gap-2 text-xs font-medium">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
            Selecionar todos ({filtered.length})
          </label>
          <Button size="sm" onClick={bulkOpen} disabled={selected.size === 0}>
            <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
            Abrir {selected.size} conversa{selected.size === 1 ? "" : "s"}
          </Button>
        </div>

        {list.isLoading ? (
          <div className="p-4 space-y-3">
            {[0,1,2,3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Nenhuma oportunidade nesta lista. 👏
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((r) => {
              const isSel = selected.has(r.id);
              const wa = whatsappLink(r.clients?.phone ?? null, waTemplate.replace(/\{\{\s*nome\s*\}\}/gi, r.clients?.name?.split(" ")[0] ?? ""));
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
                  <Checkbox checked={isSel} onCheckedChange={() => toggle(r.id)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{r.clients?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.services?.name ?? "—"} · esperado {new Date(r.expected_return_date).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <Badge variant={r.classification === "LOST" ? "destructive" : r.classification === "AT_RISK" ? "secondary" : "default"} className="hidden sm:inline-flex">
                    {r.classification === "LATE" ? `${r.days_late}d atraso` :
                     r.classification === "AT_RISK" ? "em risco" :
                     r.classification === "LOST" ? "perdida" : "atenção"}
                  </Badge>
                  <span className="text-sm font-semibold text-primary tabular-nums w-24 text-right">
                    {formatBRL(Number(r.potential_value ?? 0))}
                  </span>
                  {wa ? (
                    <a href={wa} target="_blank" rel="noopener noreferrer"
                       className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90">
                      <MessageCircle className="h-3 w-3" /> WhatsApp
                    </a>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">sem telefone</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, icon: Icon, highlight }: { label: string; value: string; icon: typeof Clock; highlight?: boolean }) {
  return (
    <Card className={`p-4 shadow-soft ${highlight ? "border-primary/30 bg-gradient-to-br from-card to-accent/30" : ""}`}>
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${highlight ? "gradient-primary text-primary-foreground" : "bg-secondary text-primary"}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}
