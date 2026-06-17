import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, DollarSign, Users, TrendingUp, ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";

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
          <StatCard label="Empresas" value={totalCompanies.toString()} icon={<Building2 className="h-4 w-4" />} />
          <StatCard label="MRR" value={fmtBRL(mrr)} icon={<DollarSign className="h-4 w-4" />} accent />
          <StatCard label="Em Trial" value={trialSubs.length.toString()} icon={<TrendingUp className="h-4 w-4" />} />
          <StatCard label="Cancelados" value={churned.toString()} icon={<Users className="h-4 w-4" />} />
        </div>

        <Tabs defaultValue="companies">
          <TabsList>
            <TabsTrigger value="companies">Empresas</TabsTrigger>
            <TabsTrigger value="features">Feature Flags</TabsTrigger>
            <TabsTrigger value="jobs">Filas</TabsTrigger>
          </TabsList>

          <TabsContent value="companies" className="mt-4">
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
                                <Badge variant="secondary" className={STATUS_COLOR[status] ?? ""}>
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
          </TabsContent>

          <TabsContent value="features" className="mt-4">
            <FeaturesPanel companies={companies} />
          </TabsContent>

          <TabsContent value="jobs" className="mt-4">
            <JobsPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

const FEATURE_LIST: Array<{ key: string; label: string; description: string; defaultOn: boolean }> = [
  { key: "smart_import", label: "Smart Import", description: "Importação inteligente com IA", defaultOn: true },
  { key: "ai_assist", label: "Assistente IA", description: "Sugestões e análises com IA", defaultOn: true },
  { key: "campaigns_bulk", label: "Campanhas em massa", description: "Envio em lote pela aba Comunicação", defaultOn: true },
  { key: "whatsapp_api", label: "WhatsApp API", description: "Conector oficial (Meta/Evolution)", defaultOn: false },
  { key: "marketplace", label: "Marketplace", description: "Vitrine pública de serviços", defaultOn: false },
  { key: "white_label", label: "White Label", description: "Marca personalizada", defaultOn: false },
  { key: "public_api", label: "API Pública", description: "Acesso programático externo", defaultOn: false },
];

function FeaturesPanel({ companies }: { companies: CompanyRow[] }) {
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState<string>(companies[0]?.id ?? "");

  useEffect(() => {
    if (!companyId && companies[0]) setCompanyId(companies[0].id);
  }, [companies, companyId]);

  const flagsQuery = useQuery({
    queryKey: ["admin-features", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_features")
        .select("feature,enabled")
        .eq("company_id", companyId);
      if (error) throw error;
      const map: Record<string, boolean> = {};
      for (const r of data ?? []) map[r.feature] = r.enabled;
      return map;
    },
  });

  async function toggle(feature: string, enabled: boolean) {
    const { error } = await supabase
      .from("company_features")
      .upsert({ company_id: companyId, feature, enabled }, { onConflict: "company_id,feature" });
    if (error) {
      toast.error("Falha ao salvar: " + error.message);
      return;
    }
    toast.success(`${feature} ${enabled ? "ativado" : "desativado"}`);
    qc.invalidateQueries({ queryKey: ["admin-features", companyId] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feature Flags por empresa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-md">
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma empresa" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!companyId ? (
          <p className="text-sm text-muted-foreground">Selecione uma empresa.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {FEATURE_LIST.map((f) => {
              const override = flagsQuery.data?.[f.key];
              const enabled = override !== undefined ? override : f.defaultOn;
              return (
                <div key={f.key} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <div className="font-medium">{f.label}</div>
                    <div className="text-xs text-muted-foreground">{f.description}</div>
                    {override === undefined && (
                      <div className="mt-1 text-[10px] uppercase text-muted-foreground">
                        padrão: {f.defaultOn ? "ligado" : "desligado"}
                      </div>
                    )}
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) => toggle(f.key, v)}
                    disabled={flagsQuery.isLoading}
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const JOB_STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-blue-500/10 text-blue-700",
  RUNNING: "bg-amber-500/10 text-amber-700",
  DONE: "bg-emerald-500/10 text-emerald-700",
  FAILED: "bg-rose-500/10 text-rose-700",
  CANCELLED: "bg-muted text-muted-foreground",
};

function JobsPanel() {
  const qc = useQueryClient();
  const jobsQuery = useQuery({
    queryKey: ["admin-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id,type,status,company_id,attempts,max_attempts,scheduled_at,finished_at,last_error,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5000,
  });

  async function runTick() {
    try {
      const res = await fetch("/api/public/hooks/jobs-tick", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "tick failed");
      toast.success(`Worker rodou: ${body.count ?? 0} jobs processados`);
      qc.invalidateQueries({ queryKey: ["admin-jobs"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao rodar worker");
    }
  }

  async function enqueueTest() {
    const { error } = await supabase.rpc("enqueue_job", {
      _type: "noop",
      _payload: { ts: Date.now() },
    } as never);
    if (error) toast.error(error.message);
    else {
      toast.success("Job de teste enfileirado");
      qc.invalidateQueries({ queryKey: ["admin-jobs"] });
    }
  }

  const jobs = jobsQuery.data ?? [];
  const counts = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Filas — últimos 100 jobs</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Pending: {counts.PENDING ?? 0} · Running: {counts.RUNNING ?? 0} · Done: {counts.DONE ?? 0} · Failed: {counts.FAILED ?? 0}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={enqueueTest}>
            Enfileirar teste
          </Button>
          <Button size="sm" onClick={runTick}>
            <RefreshCw className="mr-2 h-4 w-4" /> Rodar worker agora
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {jobsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum job ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Agendado</TableHead>
                  <TableHead>Finalizado</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="font-mono text-xs">{j.type}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={JOB_STATUS_COLOR[j.status] ?? ""}>
                        {j.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {j.attempts}/{j.max_attempts}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(j.scheduled_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {j.finished_at ? new Date(j.finished_at).toLocaleString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-rose-600">
                      {j.last_error ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
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
