import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Target, TrendingUp, Users } from "lucide-react";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/reports")({
  head: () => ({ meta: [{ title: "Relatórios · BeautyFlow" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;

  const retention = useQuery({
    enabled: !!companyId,
    queryKey: ["retention-report", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("retention_report")
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      return data ?? { pending_returns: 0, converted_returns: 0, lost_returns: 0, potential_revenue: 0, conversion_rate: 0 };
    },
  });

  const dashboard = useQuery({
    enabled: !!companyId,
    queryKey: ["dashboard-view", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("dashboard_metrics")
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      return data ?? { total_income: 0, total_expense: 0, profit: 0, income_month: 0, expense_month: 0 };
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Visão consolidada do seu negócio.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          loading={retention.isLoading}
          label="Receita potencial"
          value={formatBRL(Number(retention.data?.potential_revenue ?? 0))}
          hint="em retornos pendentes"
          icon={TrendingUp}
          highlight
        />
        <MetricCard
          loading={retention.isLoading}
          label="Taxa de conversão"
          value={`${Number(retention.data?.conversion_rate ?? 0).toFixed(0)}%`}
          hint={`${retention.data?.converted_returns ?? 0} retornos convertidos`}
          icon={Target}
        />
        <MetricCard
          loading={retention.isLoading}
          label="Clientes perdidos"
          value={String(retention.data?.lost_returns ?? 0)}
          hint="90+ dias sem voltar"
          icon={Users}
        />
        <MetricCard
          loading={dashboard.isLoading}
          label="Lucro acumulado"
          value={formatBRL(Number(dashboard.data?.profit ?? 0))}
          hint="receita − despesa total"
          icon={BarChart3}
        />
      </section>

      <Card className="p-6 shadow-soft">
        <h2 className="font-semibold text-[15px]">Resumo do mês</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Row label="Receita" value={formatBRL(Number(dashboard.data?.income_month ?? 0))} tone="success" />
          <Row label="Despesa" value={formatBRL(Number(dashboard.data?.expense_month ?? 0))} tone="destructive" />
          <Row
            label="Lucro"
            value={formatBRL(Number(dashboard.data?.income_month ?? 0) - Number(dashboard.data?.expense_month ?? 0))}
            tone="primary"
          />
        </div>
      </Card>

      <Card className="p-6 shadow-soft">
        <h2 className="font-semibold text-[15px]">Funil de retenção</h2>
        <div className="mt-5 space-y-3">
          <FunnelRow label="Pendentes" value={retention.data?.pending_returns ?? 0} tone="warning" />
          <FunnelRow label="Convertidos" value={retention.data?.converted_returns ?? 0} tone="success" />
          <FunnelRow label="Perdidos" value={retention.data?.lost_returns ?? 0} tone="destructive" />
        </div>
      </Card>
    </div>
  );
}

function MetricCard({
  loading, label, value, hint, icon: Icon, highlight,
}: {
  loading?: boolean; label: string; value: string; hint?: string; icon: any; highlight?: boolean;
}) {
  return (
    <Card className={`p-5 shadow-soft ${highlight ? "border-primary/30 bg-gradient-to-br from-card to-accent/30" : ""}`}>
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${highlight ? "gradient-primary text-primary-foreground" : "bg-secondary text-primary"}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold">{loading ? <Skeleton className="h-7 w-24" /> : value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </Card>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: "success" | "destructive" | "primary" }) {
  const color = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-primary";
  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
    </div>
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
