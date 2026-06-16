import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { TrendingUp, Users, Calendar, AlertCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Dashboard · BeautyFlow" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;

  const stats = useQuery({
    enabled: !!companyId,
    queryKey: ["dashboard-stats", companyId],
    queryFn: async () => {
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

      const [
        clientsCount,
        todayAppts,
        openReturns,
        lateReturns,
      ] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("company_id", companyId!),
        supabase
          .from("appointments")
          .select("id, price, status, start_datetime, clients(name), services(name)")
          .eq("company_id", companyId!)
          .gte("start_datetime", startOfToday)
          .lt("start_datetime", endOfToday)
          .order("start_datetime"),
        supabase
          .from("return_opportunities")
          .select("id, estimated_value", { count: "exact" })
          .eq("company_id", companyId!)
          .eq("converted", false),
        supabase
          .from("return_opportunities")
          .select("id, estimated_value", { count: "exact" })
          .eq("company_id", companyId!)
          .eq("converted", false)
          .in("status", ["DUE", "LATE"]),
      ]);

      const potential = (openReturns.data ?? []).reduce(
        (sum, r) => sum + Number(r.estimated_value ?? 0),
        0,
      );
      const lateValue = (lateReturns.data ?? []).reduce(
        (sum, r) => sum + Number(r.estimated_value ?? 0),
        0,
      );

      return {
        clients: clientsCount.count ?? 0,
        todayAppointments: todayAppts.data ?? [],
        openReturns: openReturns.count ?? 0,
        lateReturns: lateReturns.count ?? 0,
        potential,
        lateValue,
      };
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Olá, {profile?.profile?.name?.split(" ")[0] ?? "tudo bem"}!
        </h1>
        <p className="text-sm text-muted-foreground">
          Aqui está o que pode mudar seu faturamento hoje.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Receita potencial"
          value={formatBRL(stats.data?.potential ?? 0)}
          hint="clientes pendentes de retorno"
          icon={TrendingUp}
          accent
        />
        <StatCard
          label="Retornos atrasados"
          value={String(stats.data?.lateReturns ?? 0)}
          hint={`${formatBRL(stats.data?.lateValue ?? 0)} em risco`}
          icon={AlertCircle}
        />
        <StatCard
          label="Atendimentos hoje"
          value={String(stats.data?.todayAppointments.length ?? 0)}
          hint="na sua agenda"
          icon={Calendar}
        />
        <StatCard
          label="Clientes"
          value={String(stats.data?.clients ?? 0)}
          hint="cadastrados"
          icon={Users}
        />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Retornos para agir hoje</h2>
          <Link to="/app/returns" className="text-sm text-primary hover:underline">
            Ver todos
          </Link>
        </div>
        <ReturnsPreview companyId={companyId} />
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Hoje na agenda</h2>
          <Link to="/app/agenda" className="text-sm text-primary hover:underline">
            Abrir agenda
          </Link>
        </div>
        {(stats.data?.todayAppointments.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum atendimento marcado para hoje.</p>
        ) : (
          <ul className="divide-y">
            {stats.data!.todayAppointments.map((a) => (
              <li key={a.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{(a as any).clients?.name ?? "Cliente"}</p>
                  <p className="text-xs text-muted-foreground">
                    {(a as any).services?.name} ·{" "}
                    {new Date(a.start_datetime).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{formatBRL(Number(a.price))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StatCard({
  label, value, hint, icon: Icon, accent,
}: {
  label: string; value: string; hint?: string; icon: any; accent?: boolean;
}) {
  return (
    <Card className={`p-5 ${accent ? "border-primary/30 bg-gradient-to-br from-secondary/40 to-card" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${accent ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </Card>
  );
}

function ReturnsPreview({ companyId }: { companyId?: string }) {
  const q = useQuery({
    enabled: !!companyId,
    queryKey: ["returns-preview", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("return_opportunities")
        .select("id, status, expected_return_date, estimated_value, clients(name, phone), services(name)")
        .eq("company_id", companyId!)
        .eq("converted", false)
        .in("status", ["DUE", "LATE"])
        .order("expected_return_date")
        .limit(5);
      return data ?? [];
    },
  });

  if (!q.data?.length) {
    return <p className="text-sm text-muted-foreground">Nenhum retorno pendente. 👏</p>;
  }
  return (
    <ul className="divide-y">
      {q.data.map((r: any) => (
        <li key={r.id} className="py-2 flex items-center justify-between text-sm">
          <div>
            <p className="font-medium">{r.clients?.name}</p>
            <p className="text-xs text-muted-foreground">{r.services?.name}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-primary">{formatBRL(Number(r.estimated_value))}</p>
            <p className="text-[11px] text-muted-foreground">{new Date(r.expected_return_date).toLocaleDateString("pt-BR")}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
