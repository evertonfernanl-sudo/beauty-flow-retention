import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Heart, MessageCircle, RefreshCw, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/returns")({
  head: () => ({
    meta: [
      { title: "Retornos · BeautyFlow" },
      { name: "description", content: "Veja quem está atrasado para voltar e quanta receita pode recuperar agora." },
    ],
  }),
  component: ReturnsPage,
});

type Filter = "all" | "DUE" | "LATE" | "ON_TIME";

function ReturnsPage() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");

  // Refresh statuses on entering the screen
  useEffect(() => {
    if (!companyId) return;
    supabase.rpc("refresh_return_opportunities").then(() => {
      queryClient.invalidateQueries({ queryKey: ["returns", companyId] });
      queryClient.invalidateQueries({ queryKey: ["returns-summary", companyId] });
    });
  }, [companyId, queryClient]);

  const summary = useQuery({
    enabled: !!companyId,
    queryKey: ["returns-summary", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("return_opportunities")
        .select("status, estimated_value, converted")
        .eq("company_id", companyId!)
        .eq("converted", false);
      const rows = data ?? [];
      const total = rows.reduce((s, r) => s + Number(r.estimated_value ?? 0), 0);
      const late = rows.filter((r) => r.status === "LATE").reduce((s, r) => s + Number(r.estimated_value ?? 0), 0);
      const due = rows.filter((r) => r.status === "DUE").reduce((s, r) => s + Number(r.estimated_value ?? 0), 0);
      return { count: rows.length, total, late, due };
    },
  });

  const list = useQuery({
    enabled: !!companyId,
    queryKey: ["returns", companyId, filter],
    queryFn: async () => {
      let q = supabase
        .from("return_opportunities")
        .select("id, status, expected_return_date, estimated_value, days_late, contacted, clients(id, name, phone), services(name)")
        .eq("company_id", companyId!)
        .eq("converted", false)
        .order("expected_return_date");
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  async function markContacted(id: string) {
    const { error } = await supabase
      .from("return_opportunities")
      .update({ contacted: true, contacted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Cliente marcada como contatada");
    queryClient.invalidateQueries({ queryKey: ["returns", companyId] });
  }

  function openWhatsApp(phone: string | null | undefined, name: string) {
    if (!phone) { toast.error("Cliente sem telefone cadastrado"); return; }
    const clean = phone.replace(/\D/g, "");
    const msg = encodeURIComponent(`Oi ${name.split(" ")[0]}! Saudades de você por aqui 💕 Que tal agendar seu retorno?`);
    window.open(`https://wa.me/${clean}?text=${msg}`, "_blank", "noopener,noreferrer");
  }

  async function refresh() {
    if (!companyId) return;
    await supabase.rpc("refresh_return_opportunities");
    queryClient.invalidateQueries({ queryKey: ["returns", companyId] });
    queryClient.invalidateQueries({ queryKey: ["returns-summary", companyId] });
    toast.success("Atualizado");
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-medium text-primary">
            <Heart className="h-3 w-3" /> Coração do BeautyFlow
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Retornos</h1>
          <p className="text-sm text-muted-foreground">Quem está pronta para voltar — e quanto isso vale.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-1" /> Recalcular
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5 border-primary/30 bg-gradient-to-br from-secondary/40 to-card">
          <p className="text-xs text-muted-foreground">Receita potencial</p>
          <p className="mt-1 text-2xl font-semibold text-primary">{formatBRL(summary.data?.total ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">{summary.data?.count ?? 0} clientes pendentes</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Atrasadas</p>
          <p className="mt-1 text-2xl font-semibold">{formatBRL(summary.data?.late ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">em risco real</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">No prazo de hoje</p>
          <p className="mt-1 text-2xl font-semibold">{formatBRL(summary.data?.due ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">contate antes que esfrie</p>
        </Card>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="LATE">Atrasadas</TabsTrigger>
          <TabsTrigger value="DUE">Hoje</TabsTrigger>
          <TabsTrigger value="ON_TIME">No prazo</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="p-4">
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>
        ) : !list.data?.length ? (
          <div className="py-16 text-center">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
              <TrendingUp className="h-5 w-5" />
            </div>
            <p className="mt-3 font-medium">Tudo em dia por aqui 👏</p>
            <p className="text-sm text-muted-foreground">Volte amanhã para novas oportunidades.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {list.data.map((r: any) => (
              <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{r.clients?.name}</p>
                    <span className={`text-[11px] rounded-full px-2 py-0.5 ${badge(r.status)}`}>
                      {labelStatus(r.status, r.days_late)}
                    </span>
                    {r.contacted && (
                      <span className="text-[11px] rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">contatada</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.services?.name ?? "—"} · esperada em {new Date(r.expected_return_date).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-primary">{formatBRL(Number(r.estimated_value))}</p>
                  <Button size="sm" variant="outline" onClick={() => openWhatsApp(r.clients?.phone, r.clients?.name ?? "")}>
                    <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                  </Button>
                  {!r.contacted && (
                    <Button size="sm" variant="ghost" onClick={() => markContacted(r.id)}>
                      Marcar contato
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function labelStatus(s: string, days: number) {
  if (s === "LATE") return `${days}d atrasada`;
  if (s === "DUE") return "hoje";
  if (s === "LOST") return "perdida";
  return "no prazo";
}
function badge(s: string) {
  return ({
    LATE: "bg-destructive/15 text-destructive",
    DUE: "bg-[color:var(--color-warning)]/20 text-[color:var(--color-warning-foreground)]",
    LOST: "bg-muted text-muted-foreground",
    ON_TIME: "bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]",
  } as Record<string, string>)[s] ?? "bg-muted text-muted-foreground";
}
