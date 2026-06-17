import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, Crown, Heart, RefreshCw, Repeat, Target, TrendingUp, Trophy, Users,
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/app/reports")({
  head: () => ({ meta: [{ title: "Indicadores · BeautyFlow" }] }),
  component: ReportsPage,
});

const PIE = ["#7C3AED", "#EC4899", "#10B981", "#F59E0B", "#3B82F6", "#EF4444", "#14B8A6", "#A855F7", "#6B7280"];

function ReportsPage() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;

  const recovery = useQuery({
    enabled: !!companyId,
    queryKey: ["recovery", "dashboard", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("recovery_dashboard").select("*").eq("company_id", companyId!).maybeSingle();
      return data ?? { pending_count: 0, at_risk_count: 0, lost_count: 0, potential_revenue: 0,
        recovered_count_month: 0, recovered_value_month: 0, recovery_rate: 0, avg_days_to_recover: 0, avg_recovered_ticket: 0 };
    },
  });

  const clientsAgg = useQuery({
    enabled: !!companyId,
    queryKey: ["clients-agg", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("status, total_spent, appointments_count").eq("company_id", companyId!);
      const rows = data ?? [];
      return {
        active: rows.filter((r) => r.status === "ACTIVE").length,
        lost: rows.filter((r) => r.status === "LOST").length,
        total: rows.length,
      };
    },
  });

  const incomeAll = useQuery({
    enabled: !!companyId,
    queryKey: ["tx-all", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("financial_transactions")
        .select("type, amount, category, transaction_date").eq("company_id", companyId!);
      return data ?? [];
    },
  });

  const apptsAgg = useQuery({
    enabled: !!companyId,
    queryKey: ["appts-agg", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("appointments")
        .select("price, status").eq("company_id", companyId!).eq("status", "COMPLETED");
      const rows = data ?? [];
      const total = rows.reduce((s, r) => s + Number(r.price ?? 0), 0);
      return { total, count: rows.length, ticket: rows.length ? total / rows.length : 0 };
    },
  });

  const topClients = useQuery({
    enabled: !!companyId,
    queryKey: ["top-clients", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("top_clients").select("*").eq("company_id", companyId!)
        .order("total_spent", { ascending: false }).limit(10);
      return data ?? [];
    },
  });

  const topServices = useQuery({
    enabled: !!companyId,
    queryKey: ["service_metrics", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("service_metrics").select("*").eq("company_id", companyId!);
      return data ?? [];
    },
  });

  // 6-month revenue + recovered series
  const monthly = useQuery({
    enabled: !!companyId,
    queryKey: ["monthly-series", companyId],
    queryFn: async () => {
      const start = new Date(); start.setMonth(start.getMonth() - 5); start.setDate(1);
      const { data: tx } = await supabase.from("financial_transactions")
        .select("type, amount, transaction_date").eq("company_id", companyId!)
        .gte("transaction_date", start.toISOString().slice(0, 10));
      const { data: rec } = await supabase.from("recovery_opportunities")
        .select("recovered_value, converted_at").eq("company_id", companyId!).eq("status", "CONVERTED")
        .gte("converted_at", start.toISOString());

      const months: { key: string; label: string; receita: number; lucro: number; recuperada: number }[] = [];
      for (let i = 0; i < 6; i++) {
        const d = new Date(start); d.setMonth(start.getMonth() + i);
        months.push({
          key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
          label: d.toLocaleDateString("pt-BR", { month: "short" }),
          receita: 0, lucro: 0, recuperada: 0,
        });
      }
      const idx = (k: string) => months.findIndex((m) => m.key === k);
      for (const t of tx ?? []) {
        const k = t.transaction_date.slice(0, 7);
        const i = idx(k); if (i < 0) continue;
        if (t.type === "INCOME") { months[i].receita += Number(t.amount); months[i].lucro += Number(t.amount); }
        else months[i].lucro -= Number(t.amount);
      }
      for (const r of rec ?? []) {
        if (!r.converted_at) continue;
        const k = r.converted_at.slice(0, 7);
        const i = idx(k); if (i < 0) continue;
        months[i].recuperada += Number(r.recovered_value ?? 0);
      }
      return months;
    },
  });

  const expensesByCat = (incomeAll.data ?? [])
    .filter((t: any) => t.type === "EXPENSE")
    .reduce<Record<string, number>>((acc, t: any) => {
      acc[t.category] = (acc[t.category] ?? 0) + Number(t.amount);
      return acc;
    }, {});
  const expensesPie = Object.entries(expensesByCat).map(([name, value]) => ({ name, value }));

  const recoveredClients = (incomeAll.data ?? []); // placeholder shape; we already have recovery counts above

  const totalRevenue = (incomeAll.data ?? []).filter((t: any) => t.type === "INCOME").reduce((s, t: any) => s + Number(t.amount), 0);
  const totalExpense = (incomeAll.data ?? []).filter((t: any) => t.type === "EXPENSE").reduce((s, t: any) => s + Number(t.amount), 0);
  const totalProfit  = totalRevenue - totalExpense;

  const returnRate = clientsAgg.data?.total
    ? Math.round(100 * (clientsAgg.data.active) / (clientsAgg.data.total))
    : 0;

  void recoveredClients;

  const sortedBySold = [...((topServices.data ?? []) as any[])].sort((a, b) => Number(b.total_completed ?? 0) - Number(a.total_completed ?? 0)).slice(0, 5);
  const sortedByRev  = [...((topServices.data ?? []) as any[])].sort((a, b) => Number(b.total_revenue ?? 0) - Number(a.total_revenue ?? 0)).slice(0, 5);
  const sortedByRec  = [...((topServices.data ?? []) as any[])].sort((a, b) => Number(b.recurrence_ratio ?? 0) - Number(a.recurrence_ratio ?? 0)).slice(0, 5);

  return (
    <div className="space-y-6 pb-24">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Indicadores</h1>
        <p className="text-sm text-muted-foreground">Visão consolidada do seu negócio.</p>
      </header>

      {/* KPI grid */}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi icon={TrendingUp} label="Receita total"        value={formatBRL(totalRevenue)} />
        <Kpi icon={Target}     label="Lucro acumulado"      value={formatBRL(totalProfit)} highlight />
        <Kpi icon={Users}      label="Clientes ativos"      value={String(clientsAgg.data?.active ?? 0)} />
        <Kpi icon={Heart}      label="Clientes perdidos"    value={String(clientsAgg.data?.lost ?? 0)} tone="destructive" />
        <Kpi icon={RefreshCw}  label="Clientes recuperados (mês)" value={String(recovery.data?.recovered_count_month ?? 0)} />
        <Kpi icon={TrendingUp} label="Receita recuperada (mês)"   value={formatBRL(Number(recovery.data?.recovered_value_month ?? 0))} highlight />
        <Kpi icon={BarChart3}  label="Ticket médio"         value={formatBRL(apptsAgg.data?.ticket ?? 0)} />
        <Kpi icon={Repeat}     label="Taxa de retorno"      value={`${returnRate}%`} />
      </section>

      {/* Monthly charts */}
      <Card className="p-5 shadow-soft">
        <h2 className="font-semibold text-[15px] mb-3">Receita, Lucro e Receita Recuperada · 6 meses</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <AreaChart data={monthly.data ?? []}>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 shadow-soft">
          <h2 className="font-semibold text-[15px] mb-3">Despesas por categoria</h2>
          {expensesPie.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem despesas registradas.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={expensesPie} dataKey="value" nameKey="name" outerRadius={80} label={(e) => `${e.name}`}>
                    {expensesPie.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-5 shadow-soft">
          <h2 className="font-semibold text-[15px] mb-3 flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" /> Top 10 clientes</h2>
          {topClients.isLoading ? <Skeleton className="h-32" /> :
            !topClients.data?.length ? <p className="text-sm text-muted-foreground py-6">Ainda sem dados.</p> : (
            <ul className="divide-y">
              {topClients.data.map((c: any, i: number) => (
                <li key={c.id} className="py-2 flex items-center gap-3">
                  <span className="text-xs font-semibold w-5 text-muted-foreground tabular-nums">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.appointments_count} atendimentos · {c.last_visit ? new Date(c.last_visit).toLocaleDateString("pt-BR") : "sem visitas"}</p>
                  </div>
                  <p className="text-sm font-semibold text-primary tabular-nums">{formatBRL(Number(c.total_spent))}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Service rankings */}
      <div className="grid gap-4 lg:grid-cols-3">
        <RankCard icon={Trophy}     title="Mais vendidos"     rows={sortedBySold} valueKey="total_completed" suffix="atend." />
        <RankCard icon={TrendingUp} title="Mais lucrativos"   rows={sortedByRev}  valueKey="total_revenue" money />
        <RankCard icon={Repeat}     title="Maior recorrência" rows={sortedByRec}  valueKey="recurrence_ratio" suffix="×" />
      </div>

      {/* Funnel */}
      <Card className="p-5 shadow-soft">
        <h2 className="font-semibold text-[15px] mb-3">Funil de recuperação</h2>
        <div className="space-y-3">
          <FunnelRow label="Pendentes"   value={recovery.data?.pending_count ?? 0}        tone="warning" />
          <FunnelRow label="Recuperados (mês)" value={recovery.data?.recovered_count_month ?? 0} tone="success" />
          <FunnelRow label="Em risco"    value={recovery.data?.at_risk_count ?? 0}        tone="destructive" />
          <FunnelRow label="Perdidos"    value={recovery.data?.lost_count ?? 0}           tone="destructive" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <Mini label="Taxa de recuperação" value={`${Number(recovery.data?.recovery_rate ?? 0).toFixed(0)}%`} />
          <Mini label="Ticket médio recuperado" value={formatBRL(Number(recovery.data?.avg_recovered_ticket ?? 0))} />
          <Mini label="Tempo médio" value={`${Math.round(Number(recovery.data?.avg_days_to_recover ?? 0))}d`} />
        </div>
      </Card>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, tone, highlight,
}: { icon: any; label: string; value: string; tone?: "destructive"; highlight?: boolean }) {
  const color = tone === "destructive" ? "text-destructive" : highlight ? "text-primary" : "";
  return (
    <Card className={`p-4 shadow-soft ${highlight ? "border-primary/30 bg-gradient-to-br from-card to-accent/30" : ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${highlight ? "gradient-primary text-primary-foreground" : "bg-secondary text-primary"}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={`mt-2 text-xl sm:text-2xl font-semibold ${color}`}>{value}</p>
    </Card>
  );
}

function RankCard({
  icon: Icon, title, rows, valueKey, money, suffix,
}: { icon: any; title: string; rows: any[]; valueKey: string; money?: boolean; suffix?: string }) {
  return (
    <Card className="p-5 shadow-soft">
      <h2 className="font-semibold text-[15px] mb-3 flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /> {title}</h2>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground py-4">Sem dados.</p> : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.id ?? i} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
                {r.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: r.color }} />}
                <span className="truncate">{r.name}</span>
                {r.category && <Badge variant="secondary" className="text-[10px]">{r.category}</Badge>}
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

function FunnelRow({ label, value, tone }: { label: string; value: number; tone: "warning" | "success" | "destructive" }) {
  const bg = tone === "warning" ? "bg-warning" : tone === "success" ? "bg-success" : "bg-destructive";
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${bg}`} style={{ width: `${Math.min(100, value * 5)}%` }} />
      </div>
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
