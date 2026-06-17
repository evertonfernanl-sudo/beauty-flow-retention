import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Cake, Crown,
  Download, Gauge, Heart, Lightbulb, RefreshCw, Repeat, Sparkles, Target,
  TrendingDown, TrendingUp, Trophy, Users,
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from "recharts";

export const Route = createFileRoute("/_authenticated/app/reports")({
  head: () => ({ meta: [{ title: "Relatórios · BeautyFlow" }] }),
  component: ReportsPage,
});

const PIE = ["#7C3AED", "#EC4899", "#10B981", "#F59E0B", "#3B82F6", "#EF4444", "#14B8A6", "#A855F7", "#6B7280"];
type Period = "today" | "7d" | "30d" | "90d" | "365d";
const PERIOD_DAYS: Record<Period, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90, "365d": 365 };

function startOf(period: Period): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - PERIOD_DAYS[period] + 1);
  return d;
}

function ReportsPage() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;
  const [period, setPeriod] = useState<Period>("30d");
  const periodStart = useMemo(() => startOf(period), [period]);
  const prevStart = useMemo(() => {
    const d = new Date(periodStart);
    d.setDate(d.getDate() - PERIOD_DAYS[period]);
    return d;
  }, [periodStart, period]);

  // ===== Queries =====
  const recovery = useQuery({
    enabled: !!companyId,
    queryKey: ["recovery-dash", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("recovery_dashboard").select("*").eq("company_id", companyId!).maybeSingle();
      return data ?? null;
    },
  });

  const clients = useQuery({
    enabled: !!companyId,
    queryKey: ["clients-all", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("clients")
        .select("id, name, status, total_spent, appointments_count, last_visit, next_return, birthday, created_at")
        .eq("company_id", companyId!);
      return data ?? [];
    },
  });

  const tx = useQuery({
    enabled: !!companyId,
    queryKey: ["tx-all", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("financial_transactions")
        .select("type, amount, category, transaction_date").eq("company_id", companyId!);
      return data ?? [];
    },
  });

  const appts = useQuery({
    enabled: !!companyId,
    queryKey: ["appts-all", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("appointments")
        .select("id, price, status, start_datetime, client_id, service_id").eq("company_id", companyId!);
      return data ?? [];
    },
  });

  const opps = useQuery({
    enabled: !!companyId,
    queryKey: ["opps-all", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("recovery_opportunities")
        .select("status, potential_value, recovered_value, converted_at, created_at, client_id").eq("company_id", companyId!);
      return data ?? [];
    },
  });

  const contacts = useQuery({
    enabled: !!companyId,
    queryKey: ["contacts-all", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("client_contacts")
        .select("client_id, created_at, outcome").eq("company_id", companyId!);
      return data ?? [];
    },
  });

  const services = useQuery({
    enabled: !!companyId,
    queryKey: ["service_metrics", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("service_metrics").select("*").eq("company_id", companyId!);
      return data ?? [];
    },
  });

  const topClients = useQuery({
    enabled: !!companyId,
    queryKey: ["top_clients", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("top_clients").select("*").eq("company_id", companyId!)
        .order("total_spent", { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  // ===== Derived =====
  const txInPeriod = (tx.data ?? []).filter((t: any) => new Date(t.transaction_date) >= periodStart);
  const txPrev     = (tx.data ?? []).filter((t: any) => {
    const d = new Date(t.transaction_date);
    return d >= prevStart && d < periodStart;
  });
  const sum = (arr: any[], type: string) => arr.filter(t => t.type === type).reduce((s, t) => s + Number(t.amount), 0);
  const revenue = sum(txInPeriod, "INCOME");
  const expense = sum(txInPeriod, "EXPENSE");
  const profit  = revenue - expense;
  const prevRev = sum(txPrev, "INCOME");
  const prevPro = prevRev - sum(txPrev, "EXPENSE");

  const apptsCompleted = (appts.data ?? []).filter((a: any) => a.status === "COMPLETED");
  const apptsInPeriod  = apptsCompleted.filter((a: any) => new Date(a.start_datetime) >= periodStart);
  const apptsPrev      = apptsCompleted.filter((a: any) => {
    const d = new Date(a.start_datetime);
    return d >= prevStart && d < periodStart;
  });
  const ticket = apptsInPeriod.length ? apptsInPeriod.reduce((s, a) => s + Number(a.price ?? 0), 0) / apptsInPeriod.length : 0;

  const cAll    = clients.data ?? [];
  const cActive = cAll.filter(c => c.status === "ACTIVE").length;
  const cLost   = cAll.filter(c => c.status === "LOST").length;
  const cInact  = cAll.filter(c => c.status === "INACTIVE").length;
  const cNew    = cAll.filter(c => c.created_at && new Date(c.created_at) >= periodStart).length;
  const returnRate = cAll.length ? Math.round(100 * cActive / cAll.length) : 0;
  const prevReturnRate = Math.max(0, returnRate - 3); // light heuristic for delta

  const oppsAll = opps.data ?? [];
  const recoveredInPeriod = oppsAll.filter((o: any) => o.status === "CONVERTED" && o.converted_at && new Date(o.converted_at) >= periodStart);
  const recoveredPrev     = oppsAll.filter((o: any) => o.status === "CONVERTED" && o.converted_at && new Date(o.converted_at) >= prevStart && new Date(o.converted_at) < periodStart);
  const recoveredValue    = recoveredInPeriod.reduce((s, o: any) => s + Number(o.recovered_value ?? 0), 0);
  const recoveredPrevVal  = recoveredPrev.reduce((s, o: any) => s + Number(o.recovered_value ?? 0), 0);
  const potential         = oppsAll.filter((o: any) => o.status === "OPEN" || o.status === "IN_CONTACT")
                                   .reduce((s, o: any) => s + Number(o.potential_value ?? 0), 0);

  // Funnel
  const contactsArr = contacts.data ?? [];
  const eligible    = oppsAll.length;
  const contacted   = new Set(contactsArr.map((c: any) => c.client_id)).size;
  const responded   = contactsArr.filter((c: any) => c.outcome && c.outcome !== "NO_REPLY").length;
  const scheduled   = oppsAll.filter((o: any) => o.status === "IN_CONTACT" || o.status === "CONVERTED").length;
  const returned    = oppsAll.filter((o: any) => o.status === "CONVERTED").length;
  const recoveryRate = contacted ? Math.round(100 * returned / contacted) : 0;

  // Monthly series (6 months)
  const months = useMemo(() => {
    const arr: { key: string; label: string; receita: number; lucro: number; recuperada: number; atendimentos: number }[] = [];
    const start = new Date(); start.setMonth(start.getMonth() - 5); start.setDate(1);
    for (let i = 0; i < 6; i++) {
      const d = new Date(start); d.setMonth(start.getMonth() + i);
      arr.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("pt-BR", { month: "short" }),
        receita: 0, lucro: 0, recuperada: 0, atendimentos: 0,
      });
    }
    const idx = (k: string) => arr.findIndex(m => m.key === k);
    for (const t of tx.data ?? []) {
      const i = idx((t as any).transaction_date.slice(0, 7)); if (i < 0) continue;
      if ((t as any).type === "INCOME") { arr[i].receita += Number((t as any).amount); arr[i].lucro += Number((t as any).amount); }
      else arr[i].lucro -= Number((t as any).amount);
    }
    for (const o of oppsAll) {
      if (o.status !== "CONVERTED" || !o.converted_at) continue;
      const i = idx(o.converted_at.slice(0, 7)); if (i < 0) continue;
      arr[i].recuperada += Number(o.recovered_value ?? 0);
    }
    for (const a of apptsCompleted) {
      const i = idx(a.start_datetime.slice(0, 7)); if (i < 0) continue;
      arr[i].atendimentos += 1;
    }
    return arr;
  }, [tx.data, oppsAll, apptsCompleted]);

  // Expenses by category
  const expByCat = txInPeriod.filter((t: any) => t.type === "EXPENSE").reduce<Record<string, number>>((acc, t: any) => {
    acc[t.category] = (acc[t.category] ?? 0) + Number(t.amount);
    return acc;
  }, {});
  const expensesPie = Object.entries(expByCat).map(([name, value]) => ({ name, value }));
  const expTotal = expensesPie.reduce((s, e) => s + e.value, 0);

  // Top services rankings
  const svc = (services.data ?? []) as any[];
  const sortedBySold = [...svc].sort((a, b) => Number(b.total_completed ?? 0) - Number(a.total_completed ?? 0)).slice(0, 5);
  const sortedByRev  = [...svc].sort((a, b) => Number(b.total_revenue ?? 0) - Number(a.total_revenue ?? 0)).slice(0, 5);
  const sortedByRec  = [...svc].sort((a, b) => Number(b.recurrence_ratio ?? 0) - Number(a.recurrence_ratio ?? 0)).slice(0, 5);

  // Clients at risk / lost / birthday
  const today = new Date(); const thisMonth = today.getMonth() + 1;
  const atRisk = cAll
    .filter(c => c.next_return && new Date(c.next_return) < today && c.status !== "LOST")
    .map(c => ({ ...c, daysLate: Math.floor((today.getTime() - new Date(c.next_return as string).getTime()) / 86400000) }))
    .sort((a, b) => b.daysLate - a.daysLate).slice(0, 10);
  const lostList = cAll.filter(c => c.status === "LOST")
    .sort((a, b) => Number(b.total_spent) - Number(a.total_spent)).slice(0, 10);
  const birthdays = cAll.filter(c => c.birthday && new Date(c.birthday + "T00:00:00").getMonth() + 1 === thisMonth)
    .sort((a, b) => new Date(a.birthday!).getDate() - new Date(b.birthday!).getDate());

  // Forecast (next 30 days based on agenda + avg ticket of recent completed)
  const upcoming = (appts.data ?? []).filter((a: any) => a.status === "SCHEDULED" && new Date(a.start_datetime) >= today);
  const forecastRevenue = upcoming.reduce((s, a: any) => s + Number(a.price ?? 0), 0) + (potential * 0.3);
  const forecastReturns = oppsAll.filter((o: any) => o.status === "OPEN" || o.status === "IN_CONTACT").length;

  // Health score
  const retScore = Math.min(40, returnRate * 0.4);
  const revScore = Math.min(30, (revenue / Math.max(1, prevRev || revenue)) * 15);
  const freqScore = Math.min(20, (apptsInPeriod.length / Math.max(1, cActive)) * 10);
  const lossScore = Math.max(0, 10 - (cLost / Math.max(1, cAll.length)) * 50);
  const health = Math.round(retScore + revScore + freqScore + lossScore);
  const healthLabel = health >= 80 ? "Excelente" : health >= 60 ? "Saudável" : health >= 40 ? "Atenção" : "Crítico";
  const healthTone  = health >= 80 ? "text-success" : health >= 60 ? "text-primary" : health >= 40 ? "text-warning" : "text-destructive";

  // Client score distribution
  const dist = {
    VIP:      cAll.filter(c => Number(c.total_spent) >= 1000).length,
    EXC:      cAll.filter(c => Number(c.total_spent) >= 500 && Number(c.total_spent) < 1000).length,
    REG:      cAll.filter(c => c.status === "ACTIVE" && Number(c.total_spent) < 500).length,
    RISK:     cAll.filter(c => c.status === "INACTIVE").length,
    LOST:     cLost,
  };

  // Insights & alerts
  const revDelta = prevRev ? Math.round(100 * (revenue - prevRev) / prevRev) : 0;
  const recDelta = recoveredPrevVal ? Math.round(100 * (recoveredValue - recoveredPrevVal) / recoveredPrevVal) : 0;
  const insights: { tone: "good" | "warn" | "bad"; text: string }[] = [];
  if (recoveredInPeriod.length > 0) insights.push({ tone: "good", text: `Você recuperou ${recoveredInPeriod.length} cliente(s) neste período.` });
  if (revDelta > 0) insights.push({ tone: "good", text: `Sua receita cresceu ${revDelta}% vs. período anterior.` });
  if (revDelta < 0) insights.push({ tone: "bad",  text: `Sua receita caiu ${Math.abs(revDelta)}% vs. período anterior.` });
  if (potential > 0) insights.push({ tone: "warn", text: `Você possui ${formatBRL(potential)} em oportunidades de recuperação.` });
  if (atRisk.length > 0) insights.push({ tone: "warn", text: `${atRisk.length} cliente(s) estão atrasados para retorno.` });
  if (recDelta < 0 && recoveredPrevVal > 0) insights.push({ tone: "bad", text: `A receita recuperada caiu ${Math.abs(recDelta)}% neste período.` });
  if (returnRate >= 60) insights.push({ tone: "good", text: `Sua taxa de retorno (${returnRate}%) está acima da média.` });

  // CSV export
  const exportCsv = () => {
    const rows = [
      ["Indicador", "Valor"],
      ["Período", period],
      ["Receita", revenue.toFixed(2)],
      ["Despesas", expense.toFixed(2)],
      ["Lucro", profit.toFixed(2)],
      ["Receita Recuperada", recoveredValue.toFixed(2)],
      ["Receita Potencial", potential.toFixed(2)],
      ["Clientes Ativos", String(cActive)],
      ["Clientes Perdidos", String(cLost)],
      ["Clientes Novos", String(cNew)],
      ["Taxa de Retorno (%)", String(returnRate)],
      ["Taxa de Recuperação (%)", String(recoveryRate)],
      ["Health Score", String(health)],
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `beautyflow-relatorio-${period}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (!companyId || clients.isLoading || tx.isLoading) {
    return <div className="space-y-3"><Skeleton className="h-10 w-48" /><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Inteligência de negócio em menos de 60 segundos.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="365d">Último ano</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" /> CSV</Button>
        </div>
      </header>

      {/* Insights bar */}
      {insights.length > 0 && (
        <Card className="p-4 shadow-soft border-primary/20 bg-gradient-to-br from-card to-accent/20">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg gradient-primary text-primary-foreground shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm mb-2">Insights do BeautyFlow</h3>
              <ul className="space-y-1.5">
                {insights.slice(0, 5).map((i, idx) => (
                  <li key={idx} className="text-sm flex items-start gap-2">
                    <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${
                      i.tone === "good" ? "bg-success" : i.tone === "warn" ? "bg-warning" : "bg-destructive"}`} />
                    <span>{i.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="w-full overflow-x-auto justify-start no-scrollbar">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="clients">Clientes</TabsTrigger>
          <TabsTrigger value="retention">Retenção</TabsTrigger>
          <TabsTrigger value="financial">Financeiro</TabsTrigger>
          <TabsTrigger value="services">Serviços</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        {/* ========== OVERVIEW ========== */}
        <TabsContent value="overview" className="space-y-5">
          <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi icon={TrendingUp} label="Receita"            value={formatBRL(revenue)} delta={revDelta} />
            <Kpi icon={Target}     label="Lucro"              value={formatBRL(profit)} highlight />
            <Kpi icon={RefreshCw}  label="Receita Recuperada" value={formatBRL(recoveredValue)} delta={recDelta} />
            <Kpi icon={Sparkles}   label="Receita Potencial"  value={formatBRL(potential)} tone="warning" />
            <Kpi icon={Users}      label="Clientes Ativos"    value={String(cActive)} />
            <Kpi icon={Heart}      label="Clientes Perdidos"  value={String(cLost)} tone="destructive" />
            <Kpi icon={ArrowUpRight} label="Recuperados (período)" value={String(recoveredInPeriod.length)} />
            <Kpi icon={Repeat}     label="Taxa de Retorno"    value={`${returnRate}%`} />
          </section>

          <HealthCard health={health} label={healthLabel} tone={healthTone}
            ret={Math.round(retScore)} rev={Math.round(revScore)} freq={Math.round(freqScore)} loss={Math.round(lossScore)} />

          <Card className="p-5 shadow-soft">
            <h2 className="font-semibold text-[15px] mb-3">Receita, Lucro e Recuperação · 6 meses</h2>
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={months}>
                  <defs>
                    <linearGradient id="g-rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g-rec" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.4} /><stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} width={55} />
                  <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
                  <Legend />
                  <Area dataKey="receita"    name="Receita"    stroke="hsl(var(--primary))" fill="url(#g-rev)" />
                  <Area dataKey="lucro"      name="Lucro"      stroke="hsl(var(--foreground))" fillOpacity={0} />
                  <Area dataKey="recuperada" name="Recuperada" stroke="hsl(var(--success))" fill="url(#g-rec)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </TabsContent>

        {/* ========== CLIENTS ========== */}
        <TabsContent value="clients" className="space-y-5">
          <section className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <Kpi icon={Users} label="Ativos"      value={String(cActive)} />
            <Kpi icon={Activity} label="Inativos" value={String(cInact)} />
            <Kpi icon={Heart} label="Perdidos"    value={String(cLost)} tone="destructive" />
            <Kpi icon={Sparkles} label="Novos"    value={String(cNew)} highlight />
            <Kpi icon={RefreshCw} label="Recuperados" value={String(recoveredInPeriod.length)} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5 shadow-soft">
              <h2 className="font-semibold text-[15px] mb-3 flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" /> Top Clientes</h2>
              {!topClients.data?.length ? <Empty text="Ainda sem dados." /> : (
                <ul className="divide-y">
                  {topClients.data.slice(0, 10).map((c: any, i: number) => (
                    <li key={c.id} className="py-2 flex items-center gap-3">
                      <span className="text-xs font-semibold w-5 text-muted-foreground tabular-nums">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.appointments_count} atend. · {c.last_visit ? new Date(c.last_visit).toLocaleDateString("pt-BR") : "—"}</p>
                      </div>
                      <p className="text-sm font-semibold text-primary tabular-nums">{formatBRL(Number(c.total_spent))}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5 shadow-soft">
              <h2 className="font-semibold text-[15px] mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Clientes em Risco</h2>
              {atRisk.length === 0 ? <Empty text="Nenhum cliente em risco." /> : (
                <ul className="divide-y">
                  {atRisk.map((c: any) => (
                    <li key={c.id} className="py-2 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.daysLate} dias atrasado</p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">{formatBRL(Number(c.total_spent))}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5 shadow-soft">
              <h2 className="font-semibold text-[15px] mb-3 flex items-center gap-2"><TrendingDown className="h-4 w-4 text-destructive" /> Clientes Perdidos</h2>
              {lostList.length === 0 ? <Empty text="Nenhum cliente perdido." /> : (
                <ul className="divide-y">
                  {lostList.map((c: any) => (
                    <li key={c.id} className="py-2 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">Última visita: {c.last_visit ? new Date(c.last_visit).toLocaleDateString("pt-BR") : "—"}</p>
                      </div>
                      <p className="text-sm font-semibold text-destructive tabular-nums">{formatBRL(Number(c.total_spent))}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5 shadow-soft">
              <h2 className="font-semibold text-[15px] mb-3 flex items-center gap-2"><Cake className="h-4 w-4 text-pink-500" /> Aniversariantes do mês</h2>
              {birthdays.length === 0 ? <Empty text="Nenhum aniversariante este mês." /> : (
                <ul className="divide-y">
                  {birthdays.map((c: any) => (
                    <li key={c.id} className="py-2 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                      </div>
                      <Badge variant="secondary">{new Date(c.birthday + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="p-5 shadow-soft">
            <h2 className="font-semibold text-[15px] mb-3">Distribuição de Clientes</h2>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
              <DistCard label="VIP"       value={dist.VIP}  tone="primary" />
              <DistCard label="Excelente" value={dist.EXC}  tone="success" />
              <DistCard label="Regular"   value={dist.REG}  tone="muted" />
              <DistCard label="Em Risco"  value={dist.RISK} tone="warning" />
              <DistCard label="Perdido"   value={dist.LOST} tone="destructive" />
            </div>
          </Card>
        </TabsContent>

        {/* ========== RETENTION ========== */}
        <TabsContent value="retention" className="space-y-5">
          <section className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <Kpi icon={Repeat}     label="Taxa de Retorno"     value={`${returnRate}%`} />
            <Kpi icon={RefreshCw}  label="Recuperados"         value={String(recoveredInPeriod.length)} />
            <Kpi icon={TrendingUp} label="Receita Recuperada"  value={formatBRL(recoveredValue)} highlight />
            <Kpi icon={Heart}      label="Perdidos"            value={String(cLost)} tone="destructive" />
            <Kpi icon={Activity}   label="Tempo Médio Retorno" value={`${Math.round(Number(recovery.data?.avg_days_to_recover ?? 0))}d`} />
          </section>

          <Card className="p-5 shadow-soft">
            <h2 className="font-semibold text-[15px] mb-4">Funil de Retenção</h2>
            <div className="space-y-3">
              <FunnelStep label="Clientes Elegíveis"  value={eligible}  max={eligible} tone="muted" />
              <FunnelStep label="Clientes Contatados" value={contacted} max={eligible} tone="primary" />
              <FunnelStep label="Clientes Responderam"value={responded} max={eligible} tone="primary" />
              <FunnelStep label="Clientes Agendaram"  value={scheduled} max={eligible} tone="success" />
              <FunnelStep label="Clientes Retornaram" value={returned}  max={eligible} tone="success" />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              <Mini label="Taxa de Recuperação"      value={`${recoveryRate}%`} />
              <Mini label="Ticket Médio Recuperado"  value={formatBRL(Number(recovery.data?.avg_recovered_ticket ?? 0))} />
              <Mini label="Clientes Recuperados"     value={String(returned)} />
            </div>
          </Card>
        </TabsContent>

        {/* ========== FINANCIAL ========== */}
        <TabsContent value="financial" className="space-y-5">
          <section className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <Kpi icon={TrendingUp} label="Receita"            value={formatBRL(revenue)} delta={revDelta} />
            <Kpi icon={TrendingDown} label="Despesas"         value={formatBRL(expense)} tone="destructive" />
            <Kpi icon={Target}     label="Lucro"              value={formatBRL(profit)} highlight />
            <Kpi icon={Sparkles}   label="Receita Potencial"  value={formatBRL(potential)} />
            <Kpi icon={RefreshCw}  label="Receita Recuperada" value={formatBRL(recoveredValue)} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5 shadow-soft">
              <h2 className="font-semibold text-[15px] mb-3">Evolução · 6 meses</h2>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={months}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} width={55} />
                    <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
                    <Legend />
                    <Bar dataKey="receita" name="Receita" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                    <Bar dataKey="lucro"   name="Lucro"   fill="hsl(var(--success))" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-5 shadow-soft">
              <h2 className="font-semibold text-[15px] mb-3">Despesas por Categoria</h2>
              {expensesPie.length === 0 ? <Empty text="Sem despesas no período." /> : (
                <>
                  <div className="h-56">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={expensesPie} dataKey="value" nameKey="name" outerRadius={80}>
                          {expensesPie.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {expensesPie.map((e, i) => (
                      <li key={e.name} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: PIE[i % PIE.length] }} />
                          {e.name}
                        </span>
                        <span className="tabular-nums">{formatBRL(e.value)} <span className="text-muted-foreground text-xs">({Math.round(100 * e.value / expTotal)}%)</span></span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* ========== SERVICES ========== */}
        <TabsContent value="services" className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <RankCard icon={Trophy}     title="Mais vendidos"     rows={sortedBySold} valueKey="total_completed" suffix="atend." />
            <RankCard icon={TrendingUp} title="Mais lucrativos"   rows={sortedByRev}  valueKey="total_revenue" money />
            <RankCard icon={Repeat}     title="Maior recorrência" rows={sortedByRec}  valueKey="recurrence_ratio" suffix="×" />
          </div>

          <Card className="p-5 shadow-soft">
            <h2 className="font-semibold text-[15px] mb-3">Ranking completo</h2>
            {svc.length === 0 ? <Empty text="Sem serviços." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground uppercase tracking-wider">
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">Serviço</th>
                      <th className="text-right py-2 px-2">Quantidade</th>
                      <th className="text-right py-2 px-2">Receita</th>
                      <th className="text-right py-2 px-2">Retorno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {svc.map((s: any) => (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="py-2 px-2 font-medium flex items-center gap-2">
                          {s.color && <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />}
                          {s.name}
                        </td>
                        <td className="text-right tabular-nums">{s.total_completed ?? 0}</td>
                        <td className="text-right tabular-nums">{formatBRL(Number(s.total_revenue ?? 0))}</td>
                        <td className="text-right tabular-nums">{Number(s.recurrence_ratio ?? 0).toFixed(1)}×</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ========== PERFORMANCE ========== */}
        <TabsContent value="performance" className="space-y-5">
          <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Compare label="Atendimentos" curr={apptsInPeriod.length} prev={apptsPrev.length} />
            <Compare label="Clientes Novos" curr={cNew} prev={0} />
            <Compare label="Receita" curr={revenue} prev={prevRev} money />
            <Compare label="Lucro" curr={profit} prev={prevPro} money />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5 shadow-soft">
              <h2 className="font-semibold text-[15px] mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Previsão de Receita · 30 dias</h2>
              <p className="text-3xl font-bold text-primary tabular-nums">{formatBRL(forecastRevenue)}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Baseado em {upcoming.length} agendamento(s) + 30% do potencial de recuperação ({formatBRL(potential)}).
              </p>
            </Card>

            <Card className="p-5 shadow-soft">
              <h2 className="font-semibold text-[15px] mb-3 flex items-center gap-2"><RefreshCw className="h-4 w-4 text-success" /> Previsão de Retornos</h2>
              <p className="text-3xl font-bold text-success tabular-nums">{forecastReturns}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Clientes com retorno previsto. Receita estimada: {formatBRL(potential)}.
              </p>
            </Card>
          </div>

          <Card className="p-5 shadow-soft">
            <h2 className="font-semibold text-[15px] mb-3">Atendimentos · 6 meses</h2>
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={months}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={40} />
                  <Tooltip />
                  <Bar dataKey="atendimentos" name="Atendimentos" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ===== Components =====
function Kpi({ icon: Icon, label, value, tone, highlight, delta }:
  { icon: any; label: string; value: string; tone?: "destructive" | "warning"; highlight?: boolean; delta?: number }) {
  const color = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : highlight ? "text-primary" : "";
  return (
    <Card className={`p-4 shadow-soft ${highlight ? "border-primary/30 bg-gradient-to-br from-card to-accent/30" : ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${highlight ? "gradient-primary text-primary-foreground" : "bg-secondary text-primary"}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={`mt-2 text-xl sm:text-2xl font-semibold ${color}`}>{value}</p>
      {typeof delta === "number" && delta !== 0 && (
        <p className={`text-[11px] mt-1 flex items-center gap-0.5 ${delta > 0 ? "text-success" : "text-destructive"}`}>
          {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(delta)}% vs. anterior
        </p>
      )}
    </Card>
  );
}

function HealthCard({ health, label, tone, ret, rev, freq, loss }:
  { health: number; label: string; tone: string; ret: number; rev: number; freq: number; loss: number }) {
  return (
    <Card className="p-5 shadow-soft">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-primary/20 to-success/20">
            <Gauge className="h-8 w-8 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Health Score do Negócio</p>
            <p className={`text-3xl font-bold ${tone}`}>{health} <span className="text-sm font-medium">/ 100</span></p>
            <p className={`text-sm font-medium ${tone}`}>{label}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 min-w-[260px]">
          <ScoreBar label="Retenção" value={ret} max={40} />
          <ScoreBar label="Receita" value={rev} max={30} />
          <ScoreBar label="Frequência" value={freq} max={20} />
          <ScoreBar label="Perdas" value={loss} max={10} />
        </div>
      </div>
    </Card>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1"><span>{label}</span><span className="tabular-nums">{value}/{max}</span></div>
      <Progress value={(value / max) * 100} className="h-1.5" />
    </div>
  );
}

function FunnelStep({ label, value, max, tone }: { label: string; value: number; max: number; tone: "muted" | "primary" | "success" }) {
  const bg = tone === "primary" ? "bg-primary" : tone === "success" ? "bg-success" : "bg-muted-foreground/40";
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1"><span className="font-medium">{label}</span><span className="tabular-nums text-muted-foreground">{value}</span></div>
      <div className="h-3 rounded-full bg-muted overflow-hidden"><div className={`h-full ${bg} transition-all`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}

function DistCard({ label, value, tone }: { label: string; value: number; tone: "primary" | "success" | "muted" | "warning" | "destructive" }) {
  const color = {
    primary: "border-primary/40 text-primary",
    success: "border-success/40 text-success",
    muted: "border-muted-foreground/30",
    warning: "border-warning/40 text-warning",
    destructive: "border-destructive/40 text-destructive",
  }[tone];
  return (
    <div className={`rounded-lg border-2 p-3 text-center ${color}`}>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs font-medium mt-0.5">{label}</p>
    </div>
  );
}

function RankCard({ icon: Icon, title, rows, valueKey, money, suffix }:
  { icon: any; title: string; rows: any[]; valueKey: string; money?: boolean; suffix?: string }) {
  return (
    <Card className="p-5 shadow-soft">
      <h2 className="font-semibold text-[15px] mb-3 flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /> {title}</h2>
      {rows.length === 0 ? <Empty text="Sem dados." /> : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.id ?? i} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
                {r.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: r.color }} />}
                <span className="truncate">{r.name}</span>
              </span>
              <span className="font-semibold tabular-nums">
                {money ? formatBRL(Number(r[valueKey])) : `${Number(r[valueKey]).toFixed(valueKey === "recurrence_ratio" ? 1 : 0)}${suffix ? " " + suffix : ""}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function Compare({ label, curr, prev, money }: { label: string; curr: number; prev: number; money?: boolean }) {
  const delta = prev ? Math.round(100 * (curr - prev) / prev) : 0;
  return (
    <Card className="p-4 shadow-soft">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold mt-2 tabular-nums">{money ? formatBRL(curr) : curr}</p>
      <div className="flex items-center gap-2 text-xs mt-1 text-muted-foreground">
        <span>Anterior: {money ? formatBRL(prev) : prev}</span>
        {delta !== 0 && (
          <span className={`flex items-center font-medium ${delta > 0 ? "text-success" : "text-destructive"}`}>
            {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-6 text-center">{text}</p>;
}
