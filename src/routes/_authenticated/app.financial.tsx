import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown,
  ArrowUp,
  DollarSign,
  Plus,
  Search,
  Wallet,
  AlertTriangle,
  Target,
  Heart,
  Download,
} from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/app/financial")({
  head: () => ({ meta: [{ title: "Financeiro · BeautyFlow" }] }),
  component: FinancialPage,
});

const PAYMENT_METHODS = ["PIX", "Dinheiro", "Cartão Crédito", "Cartão Débito", "Transferência"];
const INCOME_CATEGORIES = ["Atendimento", "Venda de produto", "Outros"];
const EXPENSE_CATEGORIES = [
  "Aluguel",
  "Internet",
  "Energia",
  "Água",
  "Produtos",
  "Marketing",
  "Impostos",
  "Funcionários",
  "Outros",
];

const schema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  category: z.string().trim().min(2).max(60),
  description: z.string().max(200).optional().or(z.literal("")),
  amount: z.coerce.number().min(0.01).max(1_000_000),
  payment_method: z.string().max(40).optional().or(z.literal("")),
  transaction_date: z.string().min(1),
});

type Period = "today" | "week" | "month" | "year";
type TypeFilter = "all" | "INCOME" | "EXPENSE";

function FinancialPage() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [goalOpen, setGoalOpen] = useState(false);

  const range = useMemo(() => periodRange(period), [period]);

  const list = useQuery({
    enabled: !!companyId,
    queryKey: ["financial", companyId, range.from],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select("*")
        .eq("company_id", companyId!)
        .gte("transaction_date", range.from)
        .lte("transaction_date", range.to)
        .order("transaction_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const monthSummary = useQuery({
    enabled: !!companyId,
    queryKey: ["financial-month-summary", companyId],
    queryFn: async () => {
      const start = new Date();
      start.setDate(1);
      const { data } = await supabase
        .from("financial_transactions")
        .select("type, amount, transaction_date")
        .eq("company_id", companyId!)
        .gte("transaction_date", start.toISOString().slice(0, 10));
      const rows = data ?? [];
      const income = rows
        .filter((r) => r.type === "INCOME")
        .reduce((s, r) => s + Number(r.amount), 0);
      const expense = rows
        .filter((r) => r.type === "EXPENSE")
        .reduce((s, r) => s + Number(r.amount), 0);
      return { income, expense, profit: income - expense };
    },
  });

  const recoverable = useQuery({
    enabled: !!companyId,
    queryKey: ["recovery", "dashboard", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("recovery_dashboard")
        .select("potential_revenue, recovered_value_month")
        .eq("company_id", companyId!)
        .maybeSingle();
      return data ?? { potential_revenue: 0, recovered_value_month: 0 };
    },
  });

  const flow30 = useQuery({
    enabled: !!companyId,
    queryKey: ["financial-flow30", companyId],
    queryFn: async () => {
      const start = new Date();
      start.setDate(start.getDate() - 29);
      const { data } = await supabase
        .from("financial_transactions")
        .select("type, amount, transaction_date")
        .eq("company_id", companyId!)
        .gte("transaction_date", start.toISOString().slice(0, 10));
      const map = new Map<string, { date: string; in: number; out: number }>();
      for (let i = 0; i < 30; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        map.set(key, { date: key, in: 0, out: 0 });
      }
      for (const r of data ?? []) {
        const e = map.get(r.transaction_date);
        if (!e) continue;
        if (r.type === "INCOME") e.in += Number(r.amount);
        else e.out += Number(r.amount);
      }
      return [...map.values()].map((d) => ({
        date: d.date.slice(5),
        Entradas: d.in,
        Saídas: d.out,
        Saldo: d.in - d.out,
      }));
    },
  });

  const filtered = useMemo(() => {
    let rows = list.data ?? [];
    if (typeFilter !== "all") rows = rows.filter((r: any) => r.type === typeFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      rows = rows.filter(
        (r: any) =>
          r.description?.toLowerCase().includes(s) ||
          r.category?.toLowerCase().includes(s) ||
          String(r.amount).includes(s),
      );
    }
    return rows;
  }, [list.data, typeFilter, search]);

  const goal = Number((profile?.company as any)?.monthly_revenue_goal ?? 0);
  const goalPct =
    goal > 0 ? Math.min(100, Math.round(((monthSummary.data?.income ?? 0) / goal) * 100)) : 0;

  function exportCSV() {
    const rows = filtered.map((r: any) =>
      [
        r.transaction_date,
        r.type,
        r.category,
        (r.description ?? "").replace(/[,;]/g, " "),
        r.payment_method ?? "",
        r.amount,
      ].join(","),
    );
    const csv = ["data,tipo,categoria,descricao,pagamento,valor", ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financeiro_${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 pb-24">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight truncate">Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Quanto entrou, quanto saiu e quanto sobrou.
          </p>
        </div>
        <NewTransactionDialog
          open={open}
          onOpenChange={setOpen}
          companyId={companyId}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["financial", companyId] });
            qc.invalidateQueries({ queryKey: ["financial-month-summary", companyId] });
            qc.invalidateQueries({ queryKey: ["financial-flow30", companyId] });
          }}
        />
      </header>

      {/* 4 KPI cards */}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Receitas (mês)"
          value={formatBRL(monthSummary.data?.income ?? 0)}
          tone="success"
          icon={ArrowUp}
        />
        <Kpi
          label="Despesas (mês)"
          value={formatBRL(monthSummary.data?.expense ?? 0)}
          tone="destructive"
          icon={ArrowDown}
        />
        <Kpi
          label="Lucro (mês)"
          value={formatBRL(monthSummary.data?.profit ?? 0)}
          tone="primary"
          icon={DollarSign}
          highlight
        />
        <Kpi
          label="Receita Recuperável"
          value={formatBRL(Number(recoverable.data?.potential_revenue ?? 0))}
          tone="primary"
          icon={Heart}
        />
      </section>

      {/* Negative balance alert */}
      {monthSummary.data && monthSummary.data.profit < 0 && (
        <Card className="p-4 border-destructive/40 bg-destructive/5 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm">Atenção: suas despesas superaram suas receitas neste mês.</p>
        </Card>
      )}

      {/* Goal */}
      <Card className="p-5 shadow-soft">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-[15px]">Meta de faturamento do mês</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setGoalOpen(true)}>
            {goal > 0 ? "Editar meta" : "Definir meta"}
          </Button>
        </div>
        {goal > 0 ? (
          <>
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-2xl font-semibold tabular-nums">
                {formatBRL(monthSummary.data?.income ?? 0)}
              </p>
              <p className="text-sm text-muted-foreground">
                de {formatBRL(goal)}{" "}
                <span className="font-semibold text-primary">· {goalPct}%</span>
              </p>
            </div>
            <Progress value={goalPct} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Defina uma meta para acompanhar o progresso do mês.
          </p>
        )}
      </Card>

      {/* Cash flow chart */}
      <Card className="p-5 shadow-soft">
        <h2 className="font-semibold text-[15px] mb-3">Fluxo de caixa · últimos 30 dias</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={flow30.data ?? []}>
              <defs>
                <linearGradient id="g-in" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g-out" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} width={50} />
              <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
              <Area
                type="monotone"
                dataKey="Entradas"
                stroke="hsl(var(--success))"
                fill="url(#g-in)"
              />
              <Area
                type="monotone"
                dataKey="Saídas"
                stroke="hsl(var(--destructive))"
                fill="url(#g-out)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Period + type filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={period}
            onValueChange={(v) => setPeriod(v as Period)}
            className="flex-1 min-w-[260px]"
          >
            <TabsList>
              <TabsTrigger value="today">Hoje</TabsTrigger>
              <TabsTrigger value="week">Semana</TabsTrigger>
              <TabsTrigger value="month">Mês</TabsTrigger>
              <TabsTrigger value="year">Ano</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1">
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
        <div className="flex flex-wrap gap-3">
          <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="INCOME">Receitas</TabsTrigger>
              <TabsTrigger value="EXPENSE">Despesas</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar descrição, categoria, valor…"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <Card className="p-4 shadow-soft">
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>
        ) : !filtered.length ? (
          <div className="py-16 text-center">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
              <Wallet className="h-5 w-5" />
            </div>
            <p className="mt-3 font-medium">Sem lançamentos neste período</p>
            <p className="text-sm text-muted-foreground">
              Atendimentos concluídos viram receita automaticamente.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((t: any) => (
              <li
                key={t.id}
                className="py-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3"
              >
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                    t.type === "INCOME"
                      ? "bg-success/15 text-success"
                      : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {t.type === "INCOME" ? (
                    <ArrowUp className="h-4 w-4" />
                  ) : (
                    <ArrowDown className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.description || t.category}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {new Date(t.transaction_date + "T00:00:00").toLocaleDateString("pt-BR")}
                    {" · "}
                    {t.category}
                    {t.payment_method ? ` · ${t.payment_method}` : ""}
                  </p>
                </div>
                <p
                  className={`text-sm font-semibold ${t.type === "INCOME" ? "text-success" : "text-destructive"}`}
                >
                  {t.type === "INCOME" ? "+" : "−"} {formatBRL(Number(t.amount))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <GoalDialog
        open={goalOpen}
        onOpenChange={setGoalOpen}
        companyId={companyId}
        current={goal}
        onSaved={() => qc.invalidateQueries({ queryKey: ["current-profile"] })}
      />
    </div>
  );
}

function periodRange(p: Period) {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now);
  if (p === "today") {
    /* same day */
  } else if (p === "week") from.setDate(now.getDate() - 6);
  else if (p === "month") from.setDate(1);
  else if (p === "year") {
    from.setMonth(0);
    from.setDate(1);
  }
  return { from: from.toISOString().slice(0, 10), to };
}

function Kpi({
  label,
  value,
  tone,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  tone: "success" | "destructive" | "primary";
  icon: any;
  highlight?: boolean;
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : "text-primary";
  const bg =
    tone === "success"
      ? "bg-success/15 text-success"
      : tone === "destructive"
        ? "bg-destructive/15 text-destructive"
        : "gradient-primary text-primary-foreground";
  return (
    <Card
      className={`p-4 shadow-soft ${highlight ? "border-primary/30 bg-gradient-to-br from-card to-accent/30" : ""}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${bg}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={`mt-2 text-xl sm:text-2xl font-semibold ${color}`}>{value}</p>
    </Card>
  );
}

const newSchema = schema;
function NewTransactionDialog({
  open,
  onOpenChange,
  companyId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId?: string;
  onSaved: () => void;
}) {
  const form = useForm<z.infer<typeof newSchema>>({
    resolver: zodResolver(newSchema),
    defaultValues: {
      type: "INCOME",
      category: "",
      description: "",
      amount: 0,
      payment_method: "",
      transaction_date: new Date().toISOString().slice(0, 10),
    },
  });
  const type = form.watch("type");
  const cats = type === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  async function onSubmit(v: z.infer<typeof newSchema>) {
    if (!companyId) return;
    const { error } = await supabase.from("financial_transactions").insert({
      ...v,
      description: v.description || null,
      payment_method: v.payment_method || null,
      company_id: companyId,
    });
    if (error) return toast.error(error.message);
    toast.success(v.type === "INCOME" ? "Receita registrada" : "Despesa registrada");
    form.reset({
      type: v.type,
      category: "",
      description: "",
      amount: 0,
      payment_method: "",
      transaction_date: v.transaction_date,
    });
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Lançamento
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo lançamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <Tabs
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    form.setValue("category", "");
                  }}
                >
                  <TabsList className="grid grid-cols-2 w-full">
                    <TabsTrigger value="INCOME">Receita</TabsTrigger>
                    <TabsTrigger value="EXPENSE">Despesa</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Controller
                control={form.control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {cats.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.category && (
                <p className="text-xs text-destructive">{form.formState.errors.category.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" {...form.register("amount")} />
              {form.formState.errors.amount && (
                <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" {...form.register("transaction_date")} />
            </div>
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Controller
                control={form.control}
                name="payment_method"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input {...form.register("description")} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GoalDialog({
  open,
  onOpenChange,
  companyId,
  current,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId?: string;
  current: number;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(String(current || ""));
  async function save() {
    if (!companyId) return;
    const num = Number(value);
    if (Number.isNaN(num) || num < 0) return toast.error("Valor inválido");
    const { error } = await supabase
      .from("companies")
      .update({ monthly_revenue_goal: num })
      .eq("id", companyId);
    if (error) return toast.error(error.message);
    toast.success("Meta atualizada");
    onOpenChange(false);
    onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Meta de faturamento mensal</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Meta (R$)</Label>
          <Input
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ex: 10000"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
