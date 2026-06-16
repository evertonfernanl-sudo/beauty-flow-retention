import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowDown, ArrowUp, DollarSign, Plus, Wallet } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/financial")({
  head: () => ({ meta: [{ title: "Financeiro · BeautyFlow" }] }),
  component: FinancialPage,
});

const schema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  category: z.string().trim().min(2, "Categoria obrigatória").max(60),
  description: z.string().max(200).optional().or(z.literal("")),
  amount: z.coerce.number().min(0.01, "Valor obrigatório").max(1_000_000),
  payment_method: z.string().max(40).optional().or(z.literal("")),
  transaction_date: z.string().min(1, "Data obrigatória"),
});

type Filter = "all" | "INCOME" | "EXPENSE";

function FinancialPage() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const list = useQuery({
    enabled: !!companyId,
    queryKey: ["financial", companyId, filter],
    queryFn: async () => {
      let q = supabase
        .from("financial_transactions")
        .select("*")
        .eq("company_id", companyId!)
        .order("transaction_date", { ascending: false })
        .limit(100);
      if (filter !== "all") q = q.eq("type", filter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const summary = useQuery({
    enabled: !!companyId,
    queryKey: ["financial-summary", companyId],
    queryFn: async () => {
      const start = new Date();
      start.setDate(1);
      const { data } = await supabase
        .from("financial_transactions")
        .select("type, amount")
        .eq("company_id", companyId!)
        .gte("transaction_date", start.toISOString().slice(0, 10));
      const rows = data ?? [];
      const income = rows.filter((r) => r.type === "INCOME").reduce((s, r) => s + Number(r.amount), 0);
      const expense = rows.filter((r) => r.type === "EXPENSE").reduce((s, r) => s + Number(r.amount), 0);
      return { income, expense, profit: income - expense };
    },
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "INCOME", category: "", description: "", amount: 0,
      payment_method: "", transaction_date: new Date().toISOString().slice(0, 10),
    },
  });

  async function onCreate(values: z.infer<typeof schema>) {
    if (!companyId) return;
    const { error } = await supabase.from("financial_transactions").insert({
      ...values,
      description: values.description || null,
      payment_method: values.payment_method || null,
      company_id: companyId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(values.type === "INCOME" ? "Receita registrada" : "Despesa registrada");
    form.reset({
      type: values.type, category: "", description: "", amount: 0,
      payment_method: "", transaction_date: values.transaction_date,
    });
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["financial", companyId] });
    queryClient.invalidateQueries({ queryKey: ["financial-summary", companyId] });
  }

  return (
    <div className="space-y-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight truncate">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Acompanhe receita, despesa e lucro do mês.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="shrink-0"><Plus className="h-4 w-4" /> Lançamento</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo lançamento</DialogTitle></DialogHeader>
            <form onSubmit={form.handleSubmit(onCreate)} className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Controller
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INCOME">Receita</SelectItem>
                        <SelectItem value="EXPENSE">Despesa</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="category">Categoria</Label>
                  <Input id="category" placeholder="Ex: Produtos" {...form.register("category")} />
                  {form.formState.errors.category && (
                    <p className="text-xs text-destructive">{form.formState.errors.category.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Valor (R$)</Label>
                  <Input id="amount" type="number" step="0.01" {...form.register("amount")} />
                  {form.formState.errors.amount && (
                    <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="transaction_date">Data</Label>
                  <Input id="transaction_date" type="date" {...form.register("transaction_date")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment_method">Forma de pagamento</Label>
                  <Input id="payment_method" placeholder="Pix, Cartão…" {...form.register("payment_method")} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Input id="description" {...form.register("description")} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={form.formState.isSubmitting}>Salvar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <section className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Card className="p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Receita do mês</p>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-success/15 text-success">
              <ArrowUp className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-success">{formatBRL(summary.data?.income ?? 0)}</p>
        </Card>
        <Card className="p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Despesa do mês</p>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-destructive/15 text-destructive">
              <ArrowDown className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-destructive">{formatBRL(summary.data?.expense ?? 0)}</p>
        </Card>
        <Card className="p-5 shadow-soft border-primary/30 bg-gradient-to-br from-card to-accent/30">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Lucro do mês</p>
            <span className="grid h-8 w-8 place-items-center rounded-lg gradient-primary text-primary-foreground">
              <DollarSign className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-primary">{formatBRL(summary.data?.profit ?? 0)}</p>
        </Card>
      </section>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="INCOME">Receitas</TabsTrigger>
          <TabsTrigger value="EXPENSE">Despesas</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="p-4 shadow-soft">
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>
        ) : !list.data?.length ? (
          <div className="py-16 text-center">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
              <Wallet className="h-5 w-5" />
            </div>
            <p className="mt-3 font-medium">Nenhum lançamento ainda</p>
            <p className="text-sm text-muted-foreground">Atendimentos concluídos viram receita automaticamente.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {list.data.map((t: any) => (
              <li key={t.id} className="py-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                  t.type === "INCOME" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                }`}>
                  {t.type === "INCOME" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.category}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {new Date(t.transaction_date + "T00:00:00").toLocaleDateString("pt-BR")}
                    {t.description ? ` · ${t.description}` : ""}
                  </p>
                </div>
                <p className={`text-sm font-semibold ${t.type === "INCOME" ? "text-success" : "text-destructive"}`}>
                  {t.type === "INCOME" ? "+" : "−"} {formatBRL(Number(t.amount))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
