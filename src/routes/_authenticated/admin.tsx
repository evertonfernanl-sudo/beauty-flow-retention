import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, DollarSign, Users, TrendingUp, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Painel SaaS — BeautyFlow Admin" }] }),
  component: AdminPanel,
});

type CompanyRow = {
  id: string;
  name: string;
  slug: string | null;
  plan: string | null;
  trial_ends_at: string | null;
  onboarding_completed: boolean | null;
  vertical: string | null;
  created_at: string;
};

type SubRow = {
  company_id: string;
  status: string;
  amount: number | null;
  plan_id: string | null;
  current_period_end: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  TRIAL: "bg-blue-500/10 text-blue-700",
  ACTIVE: "bg-emerald-500/10 text-emerald-700",
  PAST_DUE: "bg-amber-500/10 text-amber-700",
  CANCELED: "bg-rose-500/10 text-rose-700",
  EXPIRED: "bg-muted text-muted-foreground",
};

function AdminPanel() {
  const navigate = useNavigate();

  const accessQuery = useQuery({
    queryKey: ["platform-admin-access"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", u.user.id)
        .maybeSingle();
      return !!data;
    },
  });

  useEffect(() => {
    if (accessQuery.isSuccess && !accessQuery.data) {
      navigate({ to: "/app" });
    }
  }, [accessQuery.data, accessQuery.isSuccess, navigate]);

  const companiesQuery = useQuery({
    queryKey: ["admin-companies"],
    enabled: accessQuery.data === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id,name,slug,plan,trial_ends_at,onboarding_completed,vertical,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CompanyRow[];
    },
  });

  const subsQuery = useQuery({
    queryKey: ["admin-subs"],
    enabled: accessQuery.data === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("company_id,status,amount,plan_id,current_period_end");
      if (error) throw error;
      return (data ?? []) as SubRow[];
    },
  });

  if (accessQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Verificando acesso…
      </div>
    );
  }

  if (!accessQuery.data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <p className="text-lg font-medium">Acesso restrito</p>
        <p className="text-sm text-muted-foreground">
          Esta área é exclusiva para administradores da plataforma.
        </p>
        <Link to="/app">
          <Button variant="outline">Voltar para o app</Button>
        </Link>
      </div>
    );
  }

  const companies = companiesQuery.data ?? [];
  const subs = subsQuery.data ?? [];
  const subByCompany = new Map(subs.map((s) => [s.company_id, s]));

  const totalCompanies = companies.length;
  const activeSubs = subs.filter((s) => s.status === "ACTIVE");
  const trialSubs = subs.filter((s) => s.status === "TRIAL");
  const mrr = activeSubs.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
  const churned = subs.filter((s) => s.status === "CANCELED").length;

  const fmtBRL = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex items-center justify-between py-4">
          <div>
            <h1 className="text-xl font-bold">Painel SaaS Admin</h1>
            <p className="text-xs text-muted-foreground">
              Visão geral da plataforma BeautyFlow
            </p>
          </div>
          <Link to="/app">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para o app
            </Button>
          </Link>
        </div>
      </header>

      <main className="container space-y-6 py-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Empresas"
            value={totalCompanies.toString()}
            icon={<Building2 className="h-4 w-4" />}
          />
          <StatCard
            label="MRR"
            value={fmtBRL(mrr)}
            icon={<DollarSign className="h-4 w-4" />}
            accent
          />
          <StatCard
            label="Em Trial"
            value={trialSubs.length.toString()}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatCard
            label="Cancelados"
            value={churned.toString()}
            icon={<Users className="h-4 w-4" />}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Empresas ({totalCompanies})</CardTitle>
          </CardHeader>
          <CardContent>
            {companiesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : companies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Vertical</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">MRR</TableHead>
                      <TableHead>Trial até</TableHead>
                      <TableHead>Criada em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companies.map((c) => {
                      const s = subByCompany.get(c.id);
                      const status = s?.status ?? "—";
                      return (
                        <TableRow key={c.id}>
                          <TableCell>
                            <div className="font-medium">{c.name}</div>
                            {c.slug && (
                              <div className="text-xs text-muted-foreground">/{c.slug}</div>
                            )}
                          </TableCell>
                          <TableCell className="capitalize">
                            {c.vertical?.toLowerCase() ?? "—"}
                          </TableCell>
                          <TableCell className="capitalize">{c.plan ?? "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={STATUS_COLOR[status] ?? ""}
                            >
                              {status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {s?.amount ? fmtBRL(Number(s.amount)) : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {c.trial_ends_at
                              ? new Date(c.trial_ends_at).toLocaleDateString("pt-BR")
                              : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(c.created_at).toLocaleDateString("pt-BR")}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-primary/30 bg-primary/5" : ""}>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <div className="rounded-md bg-background p-2 text-muted-foreground">{icon}</div>
      </CardContent>
    </Card>
  );
}
