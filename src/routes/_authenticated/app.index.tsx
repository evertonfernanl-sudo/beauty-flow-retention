import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  DollarSign,
  RefreshCw,
  Receipt,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Visão Geral · BeautyFlow" }] }),
  component: VisaoGeral,
});

type Period = "today" | "week" | "month" | "year";
const PERIOD_LABEL: Record<Period, string> = {
  today: "Hoje",
  week: "Últimos 7 dias",
  month: "Este mês",
  year: "Este ano",
};
const PIE = [
  "var(--color-primary)",
  "color-mix(in oklab, var(--color-primary) 70%, var(--color-accent))",
  "color-mix(in oklab, var(--color-primary) 45%, var(--color-secondary))",
  "color-mix(in oklab, var(--color-primary) 30%, var(--color-muted))",
  "var(--color-muted-foreground)",
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function VisaoGeral() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;
  const firstName = profile?.profile?.name?.split(" ")[0];
  
  const [period, setPeriodState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("beautyflow-selected-period") || "month";
    }
    return "month";
  });

  const setPeriod = (v: string) => {
    setPeriodState(v);
    if (typeof window !== "undefined") {
      localStorage.setItem("beautyflow-selected-period", v);
    }
  };

  // Query distinct months with transactions
  const monthsWithTransactions = useQuery({
    enabled: !!companyId,
    queryKey: ["months-with-transactions", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
          .from("financial_transactions")
          .select("transaction_date")
          .eq("company_id", companyId!)
          .order("transaction_date", { ascending: false });

      if (error) throw error;

      const uniqueMonths = new Set<string>();
      for (const row of data || []) {
        if (row.transaction_date) {
          uniqueMonths.add(row.transaction_date.slice(0, 7)); // e.g. "2026-03"
        }
      }

      return Array.from(uniqueMonths).map((ym) => {
        const [year, month] = ym.split("-").map(Number);
        const date = new Date(year, month - 1, 1);
        const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        return {
          value: ym,
          label: label.charAt(0).toUpperCase() + label.slice(1),
        };
      });
    },
  });

  const range = useMemo(() => {
    const end = new Date();
    if (period.includes("-")) {
      // Specific month, e.g. "2026-03"
      const [year, month] = period.split("-").map(Number);
      const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const endMonth = new Date(year, month, 0, 23, 59, 59, 999);
      const prevStart = new Date(year, month - 2, 1, 0, 0, 0, 0);
      const prevEnd = new Date(year, month - 1, 0, 23, 59, 59, 999);
      return { start, end: endMonth, prevStart, prevEnd };
    } else {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      
      if (period === "today") {
        const prevStart = new Date(start);
        prevStart.setDate(prevStart.getDate() - 1);
        const prevEnd = new Date(end);
        prevEnd.setDate(prevEnd.getDate() - 1);
        return { start, end, prevStart, prevEnd };
      } else if (period === "week") {
        start.setDate(start.getDate() - 6);
        const prevStart = new Date(start);
        prevStart.setDate(prevStart.getDate() - 7);
        const prevEnd = new Date(start);
        prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1);
        return { start, end, prevStart, prevEnd };
      } else if (period === "year") {
        start.setMonth(0, 1);
        const prevStart = new Date(start);
        prevStart.setFullYear(prevStart.getFullYear() - 1);
        const prevEnd = new Date(start);
        prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1);
        return { start, end, prevStart, prevEnd };
      } else {
        // "month" (default fallback)
        start.setDate(1);
        const prevStart = new Date(start);
        prevStart.setMonth(prevStart.getMonth() - 1);
        const prevEnd = new Date(start);
        prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1);
        return { start, end, prevStart, prevEnd };
      }
    }
  }, [period]);

  const periodText = useMemo(() => {
    if (period.includes("-")) {
      const [year, month] = period.split("-").map(Number);
      const date = new Date(year, month - 1, 1);
      const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
    return PERIOD_LABEL[period as Period] || period;
  }, [period]);

  const stats = useQuery({
    enabled: !!companyId,
    queryKey: ["visao-geral", companyId, period],
    queryFn: async () => {
      const now = new Date();
      const start6mo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const minDate = range.prevStart < start6mo ? range.prevStart : start6mo;
      const minDateKey = minDate.toISOString().slice(0, 10);

      const [tx, appts, clientsAll, returnsLate, services] = await Promise.all([
        supabase
          .from("financial_transactions")
          .select("type, amount, transaction_date")
          .eq("company_id", companyId!)
          .gte("transaction_date", minDateKey),
        supabase
          .from("appointments")
          .select("id, price, status, start_datetime, service_id")
          .eq("company_id", companyId!)
          .gte("start_datetime", range.prevStart.toISOString())
          .lte("start_datetime", range.end.toISOString()),
        supabase.from("clients").select("id, status").eq("company_id", companyId!),
        supabase
          .from("return_opportunities")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .eq("converted", false)
          .in("status", ["DUE", "LATE"]),
        supabase
          .from("service_metrics")
          .select("name, total_completed, total_revenue")
          .eq("company_id", companyId!)
          .order("total_revenue", { ascending: false })
          .limit(5),
      ]);

      // Financial — period vs prev
      const startKey = range.start.toISOString().slice(0, 10);
      const endKey = range.end.toISOString().slice(0, 10);
      const prevStartKey = range.prevStart.toISOString().slice(0, 10);
      const prevEndKey = range.prevEnd.toISOString().slice(0, 10);

      let revenue = 0,
        expense = 0,
        revenuePrev = 0,
        expensePrev = 0;
      for (const r of tx.data ?? []) {
        const d = r.transaction_date;
        const amt = Number(r.amount);
        if (d >= startKey && d <= endKey) {
          if (r.type === "INCOME") revenue += amt;
          else expense += amt;
        } else if (d >= prevStartKey && d <= prevEndKey) {
          if (r.type === "INCOME") revenuePrev += amt;
          else expensePrev += amt;
        }
      }
      const profit = revenue - expense;
      const profitPrev = revenuePrev - expensePrev;

      // Appointments — period vs prev
      const apptsAll = appts.data ?? [];
      const inPeriod = apptsAll.filter((a) => {
        const d = new Date(a.start_datetime);
        return d >= range.start && d <= range.end;
      });
      const inPrev = apptsAll.filter((a) => {
        const d = new Date(a.start_datetime);
        return d >= range.prevStart && d <= range.prevEnd;
      });
      const completed = inPeriod.filter((a) => a.status === "COMPLETED");
      const completedPrev = inPrev.filter((a) => a.status === "COMPLETED");
      const ticket = completed.length
        ? completed.reduce((s, a) => s + Number(a.price ?? 0), 0) / completed.length
        : 0;
      const ticketPrev = completedPrev.length
        ? completedPrev.reduce((s, a) => s + Number(a.price ?? 0), 0) / completedPrev.length
        : 0;

      // Active clients
      const activeClients = (clientsAll.data ?? []).filter((c) => c.status === "ACTIVE").length;

      // 6-month revenue series
      const months: { label: string; receita: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
          label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
          receita: 0,
        });
      }
      for (const r of tx.data ?? []) {
        if (r.type !== "INCOME") continue;
        const d = new Date(r.transaction_date + "T00:00:00");
        const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
        const idx = 5 - diff;
        if (idx >= 0 && idx <= 5) months[idx].receita += Number(r.amount);
      }

      // Appointments per day (within current period, capped to 60 points)
      const days: { label: string; count: number }[] = [];
      const dayMap = new Map<string, number>();
      
      let totalDays = 30;
      let startDay = new Date(range.start);
      
      if (period.includes("-")) {
        const [year, month] = period.split("-").map(Number);
        totalDays = new Date(year, month, 0).getDate();
      } else if (period === "today") {
        totalDays = 1;
        startDay = new Date(range.start);
      } else if (period === "week") {
        totalDays = 7;
        startDay = new Date(range.start);
      } else if (period === "year") {
        totalDays = 60;
        startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 59);
      } else {
        // "month"
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        totalDays = daysInMonth;
        startDay = new Date(range.start);
      }

      for (let i = 0; i < totalDays; i++) {
        const d = new Date(startDay);
        d.setDate(startDay.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        dayMap.set(key, 0);
        days.push({
          label:
            totalDays > 30
              ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
              : d.getDate().toString().padStart(2, "0"),
          count: 0,
        });
      }

      for (const a of inPeriod) {
        const key = a.start_datetime.slice(0, 10);
        if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
      }
      let i = 0;
      for (const v of dayMap.values()) {
        days[i].count = v;
        i++;
      }

      // Top services (donut)
      const topServices = (services.data ?? [])
        .filter((s) => Number(s.total_revenue ?? 0) > 0)
        .map((s) => ({ name: s.name ?? "—", value: Number(s.total_revenue ?? 0) }));

      return {
        revenue,
        expense,
        profit,
        revenuePrev,
        expensePrev,
        profitPrev,
        appointments: inPeriod.length,
        appointmentsPrev: inPrev.length,
        ticket,
        ticketPrev,
        activeClients,
        lateReturns: returnsLate.count ?? 0,
        months,
        days,
        topServices,
      };
    },
  });

  const data = stats.data;
  const loading = stats.isLoading;

  return (
    <div className="space-y-6 lg:space-y-8 pb-12">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">
            {greeting()}, {firstName ?? "tudo bem"}
            <span className="text-primary"> 👋</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sua operação em um relance — {periodText ? periodText.toLowerCase() : ""}.
          </p>
        </div>
        <Tabs
          value={period.includes("-") ? "custom-month" : period}
          onValueChange={(v) => {
            if (v !== "custom-month") {
              setPeriod(v);
            }
          }}
          className="w-auto"
        >
          <TabsList>
            <TabsTrigger value="today">Hoje</TabsTrigger>
            <TabsTrigger value="week">Semana</TabsTrigger>
            <TabsTrigger value="month">Mês</TabsTrigger>
            <TabsTrigger value="year">Ano</TabsTrigger>
            <Select value={period.includes("-") ? period : ""} onValueChange={(v) => setPeriod(v)}>
              <SelectTrigger
                className={`h-7 border-0 bg-transparent shadow-none px-3 py-1 text-sm font-medium ring-offset-background transition-all focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 ${
                  period.includes("-")
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <SelectValue placeholder="Outros meses" />
              </SelectTrigger>
              <SelectContent>
                {monthsWithTransactions.data?.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TabsList>
        </Tabs>
      </header>

      {/* KPI grid */}
      <section className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <Kpi
          icon={DollarSign}
          label="Receita"
          value={loading ? null : formatBRL(data?.revenue ?? 0)}
          delta={pct(data?.revenue, data?.revenuePrev)}
          accent
        />
        <Kpi
          icon={TrendingDown}
          label="Despesa"
          value={loading ? null : formatBRL(data?.expense ?? 0)}
          delta={pct(data?.expense, data?.expensePrev)}
          tone="warn"
          invertDelta
        />
        <Kpi
          icon={TrendingUp}
          label="Lucro"
          value={loading ? null : formatBRL(data?.profit ?? 0)}
          delta={pct(data?.profit, data?.profitPrev)}
          tone={data && data.profit >= 0 ? "default" : "warn"}
        />
        <Kpi
          icon={Calendar}
          label="Atendimentos"
          value={loading ? null : String(data?.appointments ?? 0)}
          delta={pct(data?.appointments, data?.appointmentsPrev)}
        />
        <Kpi
          icon={Receipt}
          label="Ticket médio"
          value={loading ? null : formatBRL(data?.ticket ?? 0)}
          delta={pct(data?.ticket, data?.ticketPrev)}
        />
        <Kpi
          icon={Users}
          label="Clientes ativos"
          value={loading ? null : String(data?.activeClients ?? 0)}
        />
        <Kpi
          icon={AlertCircle}
          label="Clientes p/ retorno"
          value={loading ? null : String(data?.lateReturns ?? 0)}
          tone={data && data.lateReturns > 0 ? "warn" : "default"}
        />
      </section>

      {/* Charts */}
      <section className="grid gap-4 lg:gap-6 lg:grid-cols-3">
        {/* Receita */}
        <Card className="p-5 shadow-soft lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-[15px]">Receita · últimos 6 meses</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Entradas registradas no financeiro
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <RefreshCw className="h-3 w-3" /> atualizado agora
            </div>
          </div>
          <div className="h-64">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data?.months ?? []}
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="vgIncomeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `R$${Math.round(v / 1000)}k` : `R$${v}`)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(v: any) => [formatBRL(Number(v)), "Receita"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="receita"
                    stroke="var(--color-primary)"
                    strokeWidth={2.5}
                    fill="url(#vgIncomeFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Top serviços */}
        <Card className="p-5 shadow-soft">
          <div className="mb-4">
            <h2 className="font-semibold text-[15px]">Top serviços</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Por receita histórica</p>
          </div>
          <div className="h-64">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (data?.topServices.length ?? 0) === 0 ? (
              <div className="h-full grid place-items-center text-xs text-muted-foreground">
                Nenhum serviço com receita registrada
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data?.topServices ?? []}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={86}
                    paddingAngle={2}
                    stroke="var(--color-card)"
                    strokeWidth={2}
                  >
                    {(data?.topServices ?? []).map((_, idx) => (
                      <Cell key={idx} fill={PIE[idx % PIE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(v: any, n: any) => [formatBRL(Number(v)), n]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          {!loading && (data?.topServices.length ?? 0) > 0 && (
            <ul className="mt-3 space-y-1.5">
              {data!.topServices.map((s, idx) => (
                <li key={s.name} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: PIE[idx % PIE.length] }}
                  />
                  <span className="truncate flex-1">{s.name}</span>
                  <span className="text-muted-foreground tabular-nums">{formatBRL(s.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Atendimentos por dia */}
        <Card className="p-5 shadow-soft lg:col-span-3">
          <div className="mb-4">
            <h2 className="font-semibold text-[15px]">Atendimentos por dia</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{periodText}</p>
          </div>
          <div className="h-56">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data?.days ?? []}
                  margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="var(--color-muted-foreground)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    interval={(data?.days.length ?? 0) > 30 ? 6 : 3}
                  />
                  <YAxis
                    stroke="var(--color-muted-foreground)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(v: any) => [v, "Atendimentos"]}
                  />
                  <Bar dataKey="count" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}

function pct(current?: number, prev?: number): number | null {
  if (current === undefined || prev === undefined) return null;
  if (prev === 0) return current > 0 ? 100 : null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

function Kpi({
  icon: Icon,
  label,
  value,
  delta,
  tone = "default",
  accent,
  invertDelta = false,
}: {
  icon: any;
  label: string;
  value: string | null;
  delta?: number | null;
  tone?: "default" | "warn";
  accent?: boolean;
  invertDelta?: boolean;
}) {
  const positive = (delta ?? 0) >= 0;
  const isGood = invertDelta ? !positive : positive;
  return (
    <Card
      className={`p-4 shadow-soft transition-all hover:shadow-md ${
        accent ? "border-primary/30 bg-gradient-to-br from-card to-accent/30" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-3 min-w-0">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate mr-1" title={label}>
          {label}
        </span>
        <div
          className={`grid h-7 w-7 place-items-center rounded-lg shrink-0 ${
            tone === "warn" ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      {value === null ? (
        <Skeleton className="h-7 w-24" />
      ) : (
        <p className="text-lg sm:text-xl lg:text-2xl font-semibold tracking-tight tabular-nums truncate" title={value}>
          {value}
        </p>
      )}
      {delta !== null && delta !== undefined && (
        <div
          className={`mt-2 flex items-center gap-1 text-[11px] font-medium ${
            isGood ? "text-success" : "text-destructive"
          }`}
        >
          {positive ? <ArrowUpRight className="h-3 w-3 shrink-0" /> : <ArrowDownRight className="h-3 w-3 shrink-0" />}
          <span className="tabular-nums font-semibold shrink-0">{Math.abs(Math.round(delta))}%</span>
          <span className="text-muted-foreground font-normal truncate">vs. ant</span>
        </div>
      )}
    </Card>
  );
}
