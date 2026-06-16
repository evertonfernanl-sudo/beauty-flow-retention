import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Check,
  DollarSign,
  MessageCircle,
  Sparkles,
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Dashboard · BeautyFlow" }] }),
  component: Dashboard,
});

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

const WEEKDAY: Record<number, string> = {
  0: "domingo", 1: "segunda-feira", 2: "terça-feira", 3: "quarta-feira",
  4: "quinta-feira", 5: "sexta-feira", 6: "sábado",
};

function Dashboard() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;
  const firstName = profile?.profile?.name?.split(" ")[0];

  const stats = useQuery({
    enabled: !!companyId,
    queryKey: ["dashboard-stats", companyId],
    queryFn: async () => {
      const now = new Date();
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const start30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29).toISOString();
      const start6mo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10);

      const [tx6mo, todayAppts, openReturns, lateReturns, appts30, topClients, clientsCount] = await Promise.all([
        supabase
          .from("financial_transactions")
          .select("type, amount, transaction_date")
          .eq("company_id", companyId!)
          .gte("transaction_date", start6mo),
        supabase
          .from("appointments")
          .select("id, price, status, start_datetime, clients(name), services(name, duration_minutes)")
          .eq("company_id", companyId!)
          .gte("start_datetime", startToday)
          .lt("start_datetime", endToday)
          .order("start_datetime"),
        supabase
          .from("return_opportunities")
          .select("id, status, expected_return_date, estimated_value, days_late, clients(id, name, phone), services(name)")
          .eq("company_id", companyId!)
          .eq("converted", false)
          .in("status", ["DUE", "LATE"])
          .order("expected_return_date")
          .limit(5),
        supabase
          .from("return_opportunities")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .eq("converted", false)
          .in("status", ["DUE", "LATE"]),
        supabase
          .from("appointments")
          .select("start_datetime")
          .eq("company_id", companyId!)
          .gte("start_datetime", start30),
        supabase
          .from("clients")
          .select("id, name, total_spent, appointments_count, last_visit")
          .eq("company_id", companyId!)
          .order("total_spent", { ascending: false })
          .limit(5),
        supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!),
      ]);

      // Revenue current vs previous month
      const rows = tx6mo.data ?? [];
      let incomeMonth = 0, expenseMonth = 0, incomePrev = 0, expensePrev = 0;
      for (const r of rows) {
        const d = r.transaction_date;
        const amt = Number(r.amount);
        if (d >= startMonth) {
          if (r.type === "INCOME") incomeMonth += amt;
          else expenseMonth += amt;
        } else if (d >= startPrev) {
          if (r.type === "INCOME") incomePrev += amt;
          else expensePrev += amt;
        }
      }
      const profitMonth = incomeMonth - expenseMonth;
      const profitPrev = incomePrev - expensePrev;

      // 6-month revenue series
      const months: { label: string; income: number; expense: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
          label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
          income: 0,
          expense: 0,
        });
      }
      for (const r of rows) {
        const d = new Date(r.transaction_date + "T00:00:00");
        const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
        const idx = 5 - diff;
        if (idx >= 0 && idx <= 5) {
          if (r.type === "INCOME") months[idx].income += Number(r.amount);
          else months[idx].expense += Number(r.amount);
        }
      }

      // 30-day appointments series
      const days: { label: string; count: number }[] = [];
      const dayMap = new Map<string, number>();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dayMap.set(key, 0);
        days.push({ label: d.getDate().toString().padStart(2, "0"), count: 0 });
      }
      for (const a of appts30.data ?? []) {
        const key = a.start_datetime.slice(0, 10);
        if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
      }
      let idx = 0;
      for (const v of dayMap.values()) { days[idx].count = v; idx++; }

      return {
        incomeMonth, expenseMonth, profitMonth,
        incomePrev, expensePrev, profitPrev,
        months, days,
        todayAppointments: todayAppts.data ?? [],
        returns: openReturns.data ?? [],
        lateCount: lateReturns.count ?? 0,
        topClients: topClients.data ?? [],
        clientsCount: clientsCount.count ?? 0,
      };
    },
  });

  const now = new Date();
  const data = stats.data;
  const isLoading = stats.isLoading;

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Header */}
      <header>
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">
          {greeting()}, {firstName ?? "tudo bem"}
          <span className="text-primary"> 👋</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hoje é {WEEKDAY[now.getDay()]}, {now.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}.
        </p>
      </header>

      {/* KPI Row */}
      <section className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Receita do mês"
          value={isLoading ? null : formatBRL(data?.incomeMonth ?? 0)}
          delta={delta(data?.incomeMonth, data?.incomePrev)}
          icon={DollarSign}
        />
        <KpiCard
          label="Lucro do mês"
          value={isLoading ? null : formatBRL(data?.profitMonth ?? 0)}
          delta={delta(data?.profitMonth, data?.profitPrev)}
          icon={TrendingUp}
          tone={data && data.profitMonth >= 0 ? "default" : "warn"}
        />
        <KpiCard
          label="Atendimentos hoje"
          value={isLoading ? null : String(data?.todayAppointments.length ?? 0)}
          hint="na sua agenda"
          icon={Calendar}
        />
        <KpiCard
          label="Clientes p/ retorno"
          value={isLoading ? null : String(data?.lateCount ?? 0)}
          hint="recupere agora"
          icon={AlertCircle}
          highlight
        />
      </section>

      {/* Agenda + Retornos */}
      <section className="grid gap-4 lg:gap-6 lg:grid-cols-2">
        <Card className="p-5 shadow-soft">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-[15px]">Agenda de hoje</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data?.todayAppointments.length ?? 0} atendimento(s)
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/app/agenda">Ver agenda</Link>
            </Button>
          </div>
          {isLoading ? (
            <SkeletonList />
          ) : (data?.todayAppointments.length ?? 0) === 0 ? (
            <EmptyState
              icon={Calendar}
              title="Nenhum agendamento para hoje"
              cta={<Link to="/app/agenda"><Button size="sm" className="mt-3">Novo agendamento</Button></Link>}
            />
          ) : (
            <ul className="divide-y -mx-2">
              {data!.todayAppointments.slice(0, 5).map((a: any) => (
                <li key={a.id} className="py-2.5 px-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="grid h-10 w-12 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground text-[12px] font-semibold">
                      {new Date(a.start_datetime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.clients?.name ?? "Cliente"}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.services?.name}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${apptStyle(a.status)}`}>
                    {apptLabel(a.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5 shadow-soft border-primary/20 bg-gradient-to-br from-card to-accent/30">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                <Sparkles className="h-3 w-3" /> Receita escondida
              </div>
              <h2 className="font-semibold text-[15px] mt-1">Clientes para retorno</h2>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/app/returns">Ver todos</Link>
            </Button>
          </div>
          {isLoading ? (
            <SkeletonList />
          ) : (data?.returns.length ?? 0) === 0 ? (
            <EmptyState
              icon={Check}
              title="Tudo em dia por aqui 👏"
              subtitle="Nenhum retorno pendente."
            />
          ) : (
            <ul className="divide-y -mx-2">
              {data!.returns.map((r: any) => (
                <li key={r.id} className="py-2.5 px-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.clients?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.status === "LATE" ? `${r.days_late}d atrasada` : "hoje"} · {formatBRL(Number(r.estimated_value))}
                    </p>
                  </div>
                  <a
                    href={`https://wa.me/${(r.clients?.phone ?? "").replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90"
                  >
                    <MessageCircle className="h-3 w-3" /> WhatsApp
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Charts */}
      <section className="grid gap-4 lg:gap-6 lg:grid-cols-2">
        <Card className="p-5 shadow-soft">
          <div className="mb-4">
            <h2 className="font-semibold text-[15px]">Receita · últimos 6 meses</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Entradas registradas no financeiro</p>
          </div>
          <div className="h-56">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.months ?? []} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
                  <Tooltip
                    contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }}
                    formatter={(v: any) => formatBRL(Number(v))}
                  />
                  <Area type="monotone" dataKey="income" stroke="var(--color-primary)" strokeWidth={2} fill="url(#incomeFill)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-5 shadow-soft">
          <div className="mb-4">
            <h2 className="font-semibold text-[15px]">Atendimentos · últimos 30 dias</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Volume diário de agendamentos</p>
          </div>
          <div className="h-56">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.days ?? []} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} interval={4} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }}
                  />
                  <Bar dataKey="count" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </section>

      {/* Top Clients */}
      <section>
        <Card className="p-5 shadow-soft">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-[15px]">Top clientes</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Quem mais investe com você</p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/app/clients">Ver todas</Link>
            </Button>
          </div>
          {isLoading ? (
            <SkeletonList />
          ) : (data?.topClients.length ?? 0) === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhuma cliente cadastrada"
              cta={<Link to="/app/clients"><Button size="sm" className="mt-3">Cadastrar cliente</Button></Link>}
            />
          ) : (
            <ul className="divide-y -mx-2">
              {data!.topClients.map((c: any, i: number) => (
                <li key={c.id} className="py-2.5 px-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-primary">
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.appointments_count} atend. · {c.last_visit ? `última ${new Date(c.last_visit).toLocaleDateString("pt-BR")}` : "sem visitas"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-primary">{formatBRL(Number(c.total_spent))}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function delta(current?: number, prev?: number) {
  if (current === undefined || prev === undefined) return null;
  if (prev === 0) return current > 0 ? 100 : 0;
  return ((current - prev) / Math.abs(prev)) * 100;
}

function KpiCard({
  label, value, hint, delta, icon: Icon, highlight, tone,
}: {
  label: string;
  value: string | null;
  hint?: string;
  delta?: number | null;
  icon: any;
  highlight?: boolean;
  tone?: "default" | "warn";
}) {
  const isUp = (delta ?? 0) >= 0;
  return (
    <Card className={`p-4 lg:p-5 shadow-soft transition-shadow hover:shadow-card ${
      highlight ? "border-primary/30 bg-gradient-to-br from-card via-card to-accent/40" : ""
    }`}>
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${
          highlight ? "gradient-primary text-primary-foreground" : "bg-secondary text-primary"
        }`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className={`mt-2 text-2xl lg:text-[26px] font-semibold tracking-tight ${tone === "warn" ? "text-warning" : ""}`}>
        {value ?? <Skeleton className="h-7 w-24" />}
      </p>
      <div className="mt-1.5 flex items-center gap-1 text-[11px]">
        {delta !== null && delta !== undefined ? (
          <span className={`inline-flex items-center gap-0.5 font-medium ${isUp ? "text-success" : "text-destructive"}`}>
            {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(0)}%
          </span>
        ) : null}
        {hint && <span className="text-muted-foreground">{hint}</span>}
        {delta !== null && delta !== undefined && <span className="text-muted-foreground">vs. mês anterior</span>}
      </div>
    </Card>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-12 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-20" />
          </div>
          <Skeleton className="h-5 w-14" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  icon: Icon, title, subtitle, cta,
}: { icon: any; title: string; subtitle?: string; cta?: React.ReactNode }) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-medium">{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      {cta}
    </div>
  );
}

function apptLabel(s: string) {
  return ({
    SCHEDULED: "Agendado", CONFIRMED: "Confirmado", COMPLETED: "Concluído",
    CANCELLED: "Cancelado", NO_SHOW: "Faltou",
  } as Record<string, string>)[s] ?? s;
}
function apptStyle(s: string) {
  return ({
    COMPLETED: "bg-success/15 text-success",
    CANCELLED: "bg-destructive/15 text-destructive",
    NO_SHOW: "bg-destructive/15 text-destructive",
    CONFIRMED: "bg-secondary text-secondary-foreground",
    SCHEDULED: "bg-muted text-muted-foreground",
  } as Record<string, string>)[s] ?? "bg-muted text-muted-foreground";
}
