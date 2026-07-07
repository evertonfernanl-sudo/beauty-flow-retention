import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  Plus,
  Calendar as CalendarIcon,
  Check,
  X,
  Edit3,
  Search,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  Wallet,
  Trash2,
  Receipt,
  Share2,
} from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const agendaSearchSchema = z.object({
  newAppt: z.boolean().optional(),
  clientId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/app/agenda")({
  validateSearch: (search) => agendaSearchSchema.parse(search),
  head: () => ({ meta: [{ title: "Agenda · BeautyFlow" }] }),
  component: AgendaPage,
});

const schema = z.object({
  client_id: z.string().uuid("Selecione a cliente"),
  service_ids: z.array(z.string().uuid()).min(1, "Selecione pelo menos um serviço"),
  professional_id: z.string().uuid("Selecione o profissional").optional().nullable(),
  date: z.string().min(1, "Data obrigatória"),
  time: z.string().min(1, "Hora obrigatória"),
  price: z.coerce.number().min(0).optional(),
  notes: z.string().max(500).optional().or(z.literal("")),
});

type StatusFilter = "ALL" | "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

type PeriodMode = "today" | "week" | "month" | "year";
type PeriodState = {
  mode: PeriodMode;
  date?: string; // YYYY-MM-DD
  month?: string; // YYYY-MM
  year?: number;
};

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function periodToRange(p: PeriodState): { from: Date; to: Date; label: string } {
  const now = new Date();
  if (p.mode === "today") {
    const base = p.date ? new Date(p.date + "T00:00:00") : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const from = new Date(base);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return {
      from,
      to,
      label: from.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }),
    };
  }
  if (p.mode === "week") {
    const to = new Date(now);
    to.setHours(0, 0, 0, 0);
    to.setDate(to.getDate() + 1);
    const from = new Date(to);
    from.setDate(from.getDate() - 7);
    return {
      from,
      to,
      label: `Últimos 7 dias`,
    };
  }
  if (p.mode === "month") {
    const ym = p.month ?? now.toISOString().slice(0, 7);
    const [y, m] = ym.split("-").map(Number);
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 1);
    const label = from.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return { from, to, label: label.charAt(0).toUpperCase() + label.slice(1) };
  }
  const y = p.year ?? now.getFullYear();
  return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1), label: String(y) };
}

function AgendaPage() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;
  const queryClient = useQueryClient();
  const searchParams = Route.useSearch();
  const navigate = useNavigate();
  const [agendaPeriod, setAgendaPeriod] = useState<PeriodState>({ mode: "today" });
  const [expensesPeriod, setExpensesPeriod] = useState<PeriodState>({ mode: "month" });
  const [incomePeriod, setIncomePeriod] = useState<PeriodState>({ mode: "month" });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [newApptOpen, setNewApptOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [closeMonthOpen, setCloseMonthOpen] = useState(false);

  useEffect(() => {
    if (searchParams.newAppt) {
      setNewApptOpen(true);
      navigate({
        search: ((prev: any) => {
          const copy = { ...prev };
          delete copy.newAppt;
          return copy;
        }) as any,
        replace: true,
      });
    }
  }, [searchParams.newAppt, navigate]);

  const isEmployee = profile?.role === "employee";
  const isAdm = profile?.role === "owner" || profile?.role === "admin";
  const shouldRestrictAgenda = isEmployee && !profile?.permissions?.view_other_professionals_agenda;

  const { data: myProfessional } = useQuery({
    enabled: !!companyId && isEmployee,
    queryKey: ["my-professional", profile?.userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("professionals")
        .select("id, name")
        .eq("user_id", profile!.userId)
        .maybeSingle();
      return data;
    },
  });

  const professionals = useQuery({
    enabled: !!companyId,
    queryKey: ["professionals-options", companyId],
    queryFn: async () =>
      (
        await supabase
          .from("professionals")
          .select("id, name")
          .eq("company_id", companyId!)
          .eq("active", true)
          .order("name")
      ).data ?? [],
  });

  // Available months/years for agenda's period filter (from appointments)
  const apptHistory = useQuery({
    enabled: !!companyId,
    queryKey: ["appt-history-buckets", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("start_datetime")
        .eq("company_id", companyId!)
        .order("start_datetime", { ascending: false })
        .limit(2000);
      return extractBuckets((data ?? []).map((r: any) => r.start_datetime?.slice(0, 10)));
    },
  });

  // Available months/years for financial transactions
  const txHistory = useQuery({
    enabled: !!companyId,
    queryKey: ["tx-history-buckets", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_transactions")
        .select("transaction_date")
        .eq("company_id", companyId!)
        .order("transaction_date", { ascending: false });
      return extractBuckets((data ?? []).map((r: any) => r.transaction_date));
    },
  });

  const agendaRange = useMemo(() => periodToRange(agendaPeriod), [agendaPeriod]);
  const expensesRange = useMemo(() => periodToRange(expensesPeriod), [expensesPeriod]);
  const incomeRange = useMemo(() => periodToRange(incomePeriod), [incomePeriod]);

  const list = useQuery({
    enabled: !!companyId && (!shouldRestrictAgenda || !!myProfessional),
    queryKey: [
      "appointments",
      companyId,
      agendaRange.from.toISOString(),
      agendaRange.to.toISOString(),
      statusFilter,
      shouldRestrictAgenda,
      myProfessional?.id,
    ],
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select(
          "id, start_datetime, end_datetime, status, price, notes, cancellation_reason, client_id, service_id, professional_id, clients(name, phone), services(name, duration_minutes, price), professionals(name)",
        )
        .eq("company_id", companyId!)
        .gte("start_datetime", agendaRange.from.toISOString())
        .lt("start_datetime", agendaRange.to.toISOString())
        .order("start_datetime");
      if (statusFilter !== "ALL") q = q.eq("status", statusFilter);
      if (shouldRestrictAgenda && myProfessional) {
        q = q.eq("professional_id", myProfessional.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  // Current month income + scheduled value (estimativa)
  const estimativa = useQuery({
    enabled: !!companyId,
    queryKey: ["estimativa-faturamento", companyId],
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const [txRes, apptRes] = await Promise.all([
        supabase
          .from("financial_transactions")
          .select("amount, type, transaction_date")
          .eq("company_id", companyId!)
          .eq("type", "INCOME")
          .gte("transaction_date", toISODate(monthStart))
          .lt("transaction_date", toISODate(monthEnd)),
        supabase
          .from("appointments")
          .select("price, status, start_datetime")
          .eq("company_id", companyId!)
          .in("status", ["SCHEDULED", "CONFIRMED"])
          .gte("start_datetime", monthStart.toISOString())
          .lt("start_datetime", monthEnd.toISOString()),
      ]);
      const received = (txRes.data ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
      const scheduled = (apptRes.data ?? []).reduce((s: number, r: any) => s + Number(r.price ?? 0), 0);
      return { received, scheduled, total: received + scheduled, monthStart, monthEnd };
    },
  });

  // Cash flow chart data (current month, daily)
  const cashflowMonth = useQuery({
    enabled: !!companyId,
    queryKey: ["cashflow-month", companyId],
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const { data } = await supabase
        .from("financial_transactions")
        .select("amount, type, transaction_date")
        .eq("company_id", companyId!)
        .gte("transaction_date", toISODate(monthStart))
        .lt("transaction_date", toISODate(monthEnd));
      const map = new Map<string, { date: string; Entradas: number; Saídas: number }>();
      const cur = new Date(monthStart);
      while (cur < monthEnd) {
        const key = toISODate(cur);
        map.set(key, {
          date: cur.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          Entradas: 0,
          Saídas: 0,
        });
        cur.setDate(cur.getDate() + 1);
      }
      for (const r of data ?? []) {
        const v = map.get((r as any).transaction_date);
        if (!v) continue;
        if ((r as any).type === "INCOME") v.Entradas += Number((r as any).amount);
        else v.Saídas += Number((r as any).amount);
      }
      return [...map.values()];
    },
  });

  const expensesList = useQuery({
    enabled: !!companyId,
    queryKey: ["expenses", companyId, expensesRange.from.toISOString(), expensesRange.to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select(`
          *,
          appointments (
            id,
            clients (
              id,
              name
            )
          ),
          providers (
            id,
            name
          )
        `)
        .eq("company_id", companyId!)
        .eq("type", "EXPENSE")
        .gte("transaction_date", toISODate(expensesRange.from))
        .lt("transaction_date", toISODate(expensesRange.to))
        .order("transaction_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const incomeList = useQuery({
    enabled: !!companyId,
    queryKey: ["incomes", companyId, incomeRange.from.toISOString(), incomeRange.to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select(`
          *,
          appointments (
            id,
            clients (
              id,
              name
            )
          ),
          providers (
            id,
            name
          )
        `)
        .eq("company_id", companyId!)
        .eq("type", "INCOME")
        .gte("transaction_date", toISODate(incomeRange.from))
        .lt("transaction_date", toISODate(incomeRange.to))
        .order("transaction_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!list.data) return [];
    const s = search.trim().toLowerCase();
    if (!s) return list.data;
    return list.data.filter(
      (a: any) =>
        (a.clients?.name ?? "").toLowerCase().includes(s) ||
        (a.clients?.phone ?? "").toLowerCase().includes(s) ||
        (a.services?.name ?? "").toLowerCase().includes(s),
    );
  }, [list.data, search]);

  const clients = useQuery({
    enabled: !!companyId,
    queryKey: ["clients-options", companyId],
    queryFn: async () =>
      (await supabase.from("clients").select("id, name").eq("company_id", companyId!).order("name"))
        .data ?? [],
  });
  const services = useQuery({
    enabled: !!companyId,
    queryKey: ["services-options", companyId],
    queryFn: async () =>
      (
        await supabase
          .from("services")
          .select("id, name, price, duration_minutes")
          .eq("company_id", companyId!)
          .eq("active", true)
          .order("name")
      ).data ?? [],
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      client_id: "",
      service_ids: [],
      professional_id: "",
      date: toISODate(new Date()),
      time: "09:00",
      notes: "",
    },
  });

  useEffect(() => {
    if (searchParams.newAppt) {
      setNewApptOpen(true);
      if (searchParams.clientId) {
        form.setValue("client_id", searchParams.clientId);
      }
      navigate({ search: {} as any, replace: true });
    }
  }, [searchParams.newAppt, searchParams.clientId, form, navigate]);

  const selectedServiceIds = form.watch("service_ids") || [];
  useMemo(() => {
    const sum = selectedServiceIds.reduce((acc: number, id: string) => {
      const s = services.data?.find((svc: any) => svc.id === id);
      return acc + Number(s?.price ?? 0);
    }, 0);
    form.setValue("price", sum);
  }, [selectedServiceIds]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onCreate(values: z.infer<typeof schema>) {
    if (!companyId) return;
    const selectedSvcs = values.service_ids
      .map((id) => services.data?.find((s: any) => s.id === id))
      .filter(Boolean) as any[];
    if (!selectedSvcs.length) {
      toast.error("Selecione pelo menos um serviço.");
      return;
    }
    const startDt = new Date(`${values.date}T${values.time}:00`);
    const sumPrices = selectedSvcs.reduce((acc, s) => acc + Number(s.price ?? 0), 0);
    const customPrice = values.price !== undefined ? Number(values.price) : sumPrices;

    let currentStart = startDt;
    for (const svc of selectedSvcs) {
      const duration = svc.duration_minutes ?? 60;
      const endDt = new Date(currentStart.getTime() + duration * 60_000);
      const svcPrice = sumPrices > 0 ? customPrice * (Number(svc.price ?? 0) / sumPrices) : 0;
      const { error } = await supabase.from("appointments").insert({
        company_id: companyId,
        client_id: values.client_id,
        service_id: svc.id,
        professional_id: shouldRestrictAgenda
          ? (myProfessional?.id ?? null)
          : values.professional_id || null,
        start_datetime: currentStart.toISOString(),
        end_datetime: endDt.toISOString(),
        price: svcPrice,
        notes: values.notes || null,
        status: "SCHEDULED",
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      currentStart = endDt;
    }
    toast.success("Atendimento agendado!");
    form.reset({
      client_id: "",
      service_ids: [],
      professional_id: "",
      date: values.date,
      time: "09:00",
      notes: "",
    });
    setNewApptOpen(false);
    queryClient.invalidateQueries({ queryKey: ["appointments", companyId] });
    queryClient.invalidateQueries({ queryKey: ["estimativa-faturamento", companyId] });
  }

  async function markCompleted(id: string) {
    const { error } = await supabase
      .from("appointments")
      .update({ status: "COMPLETED" })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Concluído. Retorno e receita gerados.");
    queryClient.invalidateQueries({ queryKey: ["appointments", companyId] });
    queryClient.invalidateQueries({ queryKey: ["returns-preview"] });
    queryClient.invalidateQueries({ queryKey: ["estimativa-faturamento", companyId] });
    queryClient.invalidateQueries({ queryKey: ["cashflow-month", companyId] });
    queryClient.invalidateQueries({ queryKey: ["incomes", companyId] });
  }

  async function confirmAppointment(id: string) {
    const { error } = await supabase
      .from("appointments")
      .update({ status: "CONFIRMED" })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["appointments", companyId] });
  }

  return (
    <div className="space-y-6 pb-24">
      {/* === AGENDA === */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">{agendaRange.label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setNewApptOpen(true)} className="hidden md:flex">
            <Plus className="h-4 w-4 mr-1" /> Agendar
          </Button>
          {isAdm && (
            <Button onClick={() => setBlockDialogOpen(true)} variant="outline" className="hidden md:flex">
              <X className="h-4 w-4 mr-1" /> Bloquear Horário
            </Button>
          )}
          <PeriodFilter
            value={agendaPeriod}
            onChange={setAgendaPeriod}
            months={apptHistory.data?.months ?? []}
            years={apptHistory.data?.years ?? []}
          />
        </div>
      </header>

      {/* Mobile Actions: placed below date filters and before daily list */}
      <div className="flex flex-col gap-2 md:hidden w-full">
        <Button onClick={() => setNewApptOpen(true)} className="w-full">
          <Plus className="h-4 w-4 mr-1" /> Novo Agendamento
        </Button>
        {isAdm && (
          <Button onClick={() => setBlockDialogOpen(true)} variant="outline" className="w-full">
            <X className="h-4 w-4 mr-1" /> Bloquear Horário
          </Button>
        )}
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente, telefone ou serviço..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os status</SelectItem>
              <SelectItem value="SCHEDULED">Agendados</SelectItem>
              <SelectItem value="CONFIRMED">Confirmados</SelectItem>
              <SelectItem value="COMPLETED">Concluídos</SelectItem>
              <SelectItem value="CANCELLED">Cancelados</SelectItem>
              <SelectItem value="NO_SHOW">Faltas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {list.isLoading ? (
          <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>
        ) : !filtered.length ? (
          <div className="py-16 text-center">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <p className="mt-3 font-medium">Nada agendado neste período</p>
            <p className="text-sm text-muted-foreground">
              Aproveite para cadastrar o próximo atendimento.
            </p>
          </div>
        ) : (
          <GroupedList
            items={filtered}
            mode={agendaPeriod.mode}
            onComplete={markCompleted}
            onConfirm={confirmAppointment}
            onChanged={() =>
              queryClient.invalidateQueries({ queryKey: ["appointments", companyId] })
            }
            services={services.data ?? []}
            professionals={professionals.data ?? []}
            shouldRestrictAgenda={shouldRestrictAgenda}
            myProfessional={myProfessional}
          />
        )}
      </Card>

      {/* Hidden dialog wired to be opened externally (kept for parity) */}
      <Dialog open={newApptOpen} onOpenChange={setNewApptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo agendamento</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onCreate)} className="space-y-3">
            <FormSelectField
              label="Cliente"
              name="client_id"
              form={form}
              options={(clients.data ?? []).map((c: any) => ({ value: c.id, label: c.name }))}
            />
            {!shouldRestrictAgenda && (
              <FormSelectField
                label="Profissional"
                name="professional_id"
                form={form}
                options={(professionals.data ?? []).map((p: any) => ({
                  value: p.id,
                  label: p.name,
                }))}
              />
            )}
            <div className="space-y-2">
              <Label>Serviços (Selecione um ou mais)</Label>
              <Controller
                control={form.control}
                name="service_ids"
                render={({ field }) => {
                  const selected = field.value || [];
                  return (
                    <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2 bg-background">
                      {(services.data ?? []).map((s: any) => {
                        const isChecked = selected.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className="flex items-center gap-2 p-2 hover:bg-secondary/40 rounded cursor-pointer text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  field.onChange(selected.filter((id: string) => id !== s.id));
                                } else {
                                  field.onChange([...selected, s.id]);
                                }
                              }}
                              className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                            />
                            <span className="flex-1 font-medium">{s.name}</span>
                            <span className="text-muted-foreground">
                              {formatBRL(Number(s.price))}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  );
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" {...form.register("date")} />
              </div>
              <div className="space-y-2">
                <Label>Hora</Label>
                <Input type="time" {...form.register("time")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" {...form.register("price")} />
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea rows={2} {...form.register("notes")} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Agendar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <BlockSlotDialog
        open={blockDialogOpen}
        onOpenChange={setBlockDialogOpen}
        companyId={companyId || null}
        onChanged={() => {
          queryClient.invalidateQueries({ queryKey: ["appointments", companyId] });
          queryClient.invalidateQueries({ queryKey: ["estimativa-faturamento", companyId] });
        }}
      />

      {/* === SECTION 1: ESTIMATIVA + CASH FLOW === */}
      <Card className="p-5 shadow-soft">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-[15px]">Estimativa de faturamento do mês</h2>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mb-5">
          <div className="rounded-lg border p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Recebido</p>
            <p className="text-lg font-semibold text-success tabular-nums">
              {formatBRL(estimativa.data?.received ?? 0)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Agendado</p>
            <p className="text-lg font-semibold text-primary tabular-nums">
              {formatBRL(estimativa.data?.scheduled ?? 0)}
            </p>
          </div>
          <div className="rounded-lg border p-3 bg-primary/5 border-primary/30">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Estimativa total</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatBRL(estimativa.data?.total ?? 0)}
            </p>
          </div>
        </div>

        <h3 className="font-medium text-sm mb-3 text-muted-foreground">Fluxo de caixa do mês</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cashflowMonth.data ?? []}>
              <defs>
                <linearGradient id="agenda-g-in" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="agenda-g-out" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} width={50} />
              <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
              <Area type="monotone" dataKey="Entradas" stroke="hsl(var(--success))" fill="url(#agenda-g-in)" />
              <Area type="monotone" dataKey="Saídas" stroke="hsl(var(--destructive))" fill="url(#agenda-g-out)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* === SECTION 2: DESPESAS === */}
      <Card className="p-5 shadow-soft space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ArrowDown className="h-4 w-4 text-destructive" />
            <h2 className="font-semibold text-[15px]">Despesas · {expensesRange.label.toLowerCase()}</h2>
          </div>
          <div className="flex flex-col items-center gap-2 w-full md:w-auto">
            <PeriodFilter
              value={expensesPeriod}
              onChange={setExpensesPeriod}
              months={txHistory.data?.months ?? []}
              years={txHistory.data?.years ?? []}
              compact
              className="w-full max-w-xs sm:max-w-sm justify-between md:w-auto md:max-w-none"
            />
            <div className="grid grid-cols-2 gap-2 w-full max-w-xs sm:max-w-sm md:flex md:w-auto">
              <Button size="sm" onClick={() => setExpenseDialogOpen(true)} className="w-full">
                <Plus className="h-4 w-4 mr-1" /> Lançamento
              </Button>
              <Button size="sm" variant="outline" onClick={() => setProviderDialogOpen(true)} className="w-full">
                <Plus className="h-4 w-4 mr-1" /> Fornecedor
              </Button>
            </div>
          </div>
        </div>
        <TransactionList rows={expensesList.data ?? []} loading={expensesList.isLoading} kind="EXPENSE" />
      </Card>

      {/* === SECTION 3: RECEITAS === */}
      <Card className="p-5 shadow-soft space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ArrowUp className="h-4 w-4 text-success" />
            <h2 className="font-semibold text-[15px]">Receitas · {incomeRange.label.toLowerCase()}</h2>
          </div>
          <div className="flex flex-col items-center gap-2 w-full md:w-auto">
            <PeriodFilter
              value={incomePeriod}
              onChange={setIncomePeriod}
              months={txHistory.data?.months ?? []}
              years={txHistory.data?.years ?? []}
              compact
              className="w-full max-w-xs sm:max-w-sm justify-between md:w-auto md:max-w-none"
            />
            <Button size="sm" onClick={() => setIncomeDialogOpen(true)} className="w-full max-w-xs sm:max-w-sm md:w-auto">
              <Plus className="h-4 w-4 mr-1" /> Lançamento
            </Button>
          </div>
        </div>
        <TransactionList rows={incomeList.data ?? []} loading={incomeList.isLoading} kind="INCOME" />
      </Card>

      <NewTransactionDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
        companyId={companyId}
        defaultType="EXPENSE"
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["expenses", companyId] });
          queryClient.invalidateQueries({ queryKey: ["incomes", companyId] });
          queryClient.invalidateQueries({ queryKey: ["cashflow-month", companyId] });
          queryClient.invalidateQueries({ queryKey: ["estimativa-faturamento", companyId] });
          queryClient.invalidateQueries({ queryKey: ["tx-history-buckets", companyId] });
        }}
      />
      <NewTransactionDialog
        open={incomeDialogOpen}
        onOpenChange={setIncomeDialogOpen}
        companyId={companyId}
        defaultType="INCOME"
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["expenses", companyId] });
          queryClient.invalidateQueries({ queryKey: ["incomes", companyId] });
          queryClient.invalidateQueries({ queryKey: ["cashflow-month", companyId] });
          queryClient.invalidateQueries({ queryKey: ["estimativa-faturamento", companyId] });
          queryClient.invalidateQueries({ queryKey: ["tx-history-buckets", companyId] });
        }}
      />
      <NewProviderDialog
        open={providerDialogOpen}
        onOpenChange={setProviderDialogOpen}
        companyId={companyId ?? null}
      />

      {/* Botão de Fechar o Mês no final da página */}
      <div className="flex justify-center pt-4">
        <Button
          onClick={() => setCloseMonthOpen(true)}
          className="w-full max-w-md py-6 text-base font-semibold shadow-soft"
          variant="secondary"
        >
          Fechar o Mês
        </Button>
      </div>

      <CloseMonthDialog
        open={closeMonthOpen}
        onOpenChange={setCloseMonthOpen}
        companyId={companyId || null}
        currentMonth={expensesPeriod.month ?? new Date().toISOString().slice(0, 7)}
        onChanged={() => {
          queryClient.invalidateQueries({ queryKey: ["expenses", companyId] });
          queryClient.invalidateQueries({ queryKey: ["incomes", companyId] });
          queryClient.invalidateQueries({ queryKey: ["cashflow-month", companyId] });
          queryClient.invalidateQueries({ queryKey: ["estimativa-faturamento", companyId] });
        }}
      />
    </div>
  );
}

function extractBuckets(dates: (string | null | undefined)[]): { months: string[]; years: number[] } {
  const monthSet = new Set<string>();
  const yearSet = new Set<number>();
  const now = new Date();
  monthSet.add(now.toISOString().slice(0, 7));
  yearSet.add(now.getFullYear());
  for (const d of dates) {
    if (!d) continue;
    monthSet.add(d.slice(0, 7));
    yearSet.add(Number(d.slice(0, 4)));
  }
  return {
    months: Array.from(monthSet).sort((a, b) => b.localeCompare(a)),
    years: Array.from(yearSet).sort((a, b) => b - a),
  };
}

function PeriodFilter({
  value,
  onChange,
  months,
  years,
  compact,
  className,
}: {
  value: PeriodState;
  onChange: (p: PeriodState) => void;
  months: string[];
  years: number[];
  compact?: boolean;
  className?: string;
}) {
  const todayISO = toISODate(new Date());
  const dayLabel = value.mode === "today" && value.date && value.date !== todayISO
    ? new Date(value.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : "Hoje";
  const monthLabel = value.mode === "month" && value.month
    ? formatMonthLabel(value.month)
    : "Mês";
  const showYearDropdown = years.length > 1;

  return (
    <div className={cn("flex items-center gap-1 rounded-lg border bg-muted/30 p-1", compact && "text-xs", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={value.mode === "today" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-3"
          >
            <CalendarIcon className="h-3.5 w-3.5 mr-1" />
            {dayLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={value.date ? new Date(value.date + "T00:00:00") : new Date()}
            onSelect={(d) => {
              if (d) onChange({ mode: "today", date: toISODate(d) });
            }}
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
      <Button
        variant={value.mode === "week" ? "default" : "ghost"}
        size="sm"
        className="h-7 px-3"
        onClick={() => onChange({ mode: "week" })}
      >
        Semana
      </Button>
      <Select
        value={value.mode === "month" ? (value.month ?? new Date().toISOString().slice(0, 7)) : ""}
        onValueChange={(v) => onChange({ mode: "month", month: v })}
      >
        <SelectTrigger
          className={cn(
            "h-7 border-0 bg-transparent shadow-none px-3 py-0 text-sm font-medium gap-1 w-auto",
            value.mode === "month"
              ? "bg-primary text-primary-foreground rounded-md"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <SelectValue placeholder={monthLabel}>{monthLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {months.map((m) => (
            <SelectItem key={m} value={m}>
              {formatMonthLabel(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showYearDropdown ? (
        <Select
          value={value.mode === "year" ? String(value.year ?? new Date().getFullYear()) : ""}
          onValueChange={(v) => onChange({ mode: "year", year: Number(v) })}
        >
          <SelectTrigger
            className={cn(
              "h-7 border-0 bg-transparent shadow-none px-3 py-0 text-sm font-medium gap-1 w-auto",
              value.mode === "year"
                ? "bg-primary text-primary-foreground rounded-md"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <SelectValue placeholder="Ano">
              {value.mode === "year" ? String(value.year ?? new Date().getFullYear()) : "Ano"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Button
          variant={value.mode === "year" ? "default" : "ghost"}
          size="sm"
          className="h-7 px-3"
          onClick={() => onChange({ mode: "year", year: new Date().getFullYear() })}
        >
          {new Date().getFullYear()}
        </Button>
      )}
    </div>
  );
}

function formatMonthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function TransactionList({
  rows,
  loading,
  kind,
}: {
  rows: any[];
  loading: boolean;
  kind: "INCOME" | "EXPENSE";
}) {
  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>;
  if (!rows.length) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
          <Wallet className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm font-medium">
          {kind === "INCOME" ? "Sem receitas neste período" : "Sem despesas neste período"}
        </p>
      </div>
    );
  }
  const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  return (
    <>
      <ul className="divide-y">
        {rows.map((t: any) => {
          // Resolve appointments and clients safely handling both object and array formats
          const appt = t.appointments;
          const apptObj = Array.isArray(appt) ? appt[0] : appt;
          const client = apptObj?.clients;
          const clientObj = Array.isArray(client) ? client[0] : client;
          const clientName = clientObj?.name;

          const prov = t.providers;
          const provObj = Array.isArray(prov) ? prov[0] : prov;
          const providerName = provObj?.name;

          let personName = "";
          if (t.type === "INCOME") {
            personName = clientName || t.description || t.category || "Cliente";
          } else {
            // Se for despesa, prioriza o nome do cliente se houver vínculo com atendimento,
            // senão usa o nome do fornecedor, caindo por fim na descrição/categoria.
            personName = clientName || providerName || t.description || t.category || "Fornecedor";
          }

          return (
            <li
              key={t.id}
              className="py-3 grid grid-cols-[100px_1fr_120px] items-center gap-3 text-sm"
            >
              <span className="text-muted-foreground">
                {new Date(t.transaction_date + "T00:00:00").toLocaleDateString("pt-BR")}
              </span>
              <span className="font-medium truncate" title={personName}>
                {personName}
              </span>
              <span
                className={`text-right font-semibold ${t.type === "INCOME" ? "text-success" : "text-destructive"}`}
              >
                {t.type === "INCOME" ? "+" : "−"} {formatBRL(Number(t.amount))}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end pt-2 border-t text-sm">
        <span className="text-muted-foreground mr-2">Total:</span>
        <span className={`font-semibold ${kind === "INCOME" ? "text-success" : "text-destructive"}`}>
          {formatBRL(total)}
        </span>
      </div>
    </>
  );
}

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

const txSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  category: z.string().trim().min(2).max(60),
  description: z.string().max(200).optional().or(z.literal("")),
  amount: z.coerce.number().min(0.01).max(1_000_000),
  payment_method: z.string().max(40).optional().or(z.literal("")),
  transaction_date: z.string().min(1),
  provider_id: z.string().uuid().optional().or(z.literal("")),
  account_source: z.string().min(1, "Selecione a fonte/saída"),
  status: z.string().optional(),
  is_personal: z.boolean().optional(),
  revenue_type: z.string().optional(),
  recurring: z.boolean().optional(),
  recurring_months: z.coerce.number().min(1).max(36).optional(),
});

function NewTransactionDialog({
  open,
  onOpenChange,
  companyId,
  defaultType,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId?: string;
  defaultType: "INCOME" | "EXPENSE";
  onSaved: () => void;
}) {
  const providersQuery = useQuery({
    enabled: !!companyId && open,
    queryKey: ["providers-select", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("providers")
        .select("id, name")
        .eq("company_id", companyId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const form = useForm<z.infer<typeof txSchema>>({
    resolver: zodResolver(txSchema),
    defaultValues: {
      type: defaultType,
      category: "",
      description: "",
      amount: 0,
      payment_method: "",
      transaction_date: toISODate(new Date()),
      provider_id: "",
      account_source: "Caixa Banco",
      status: "PAID",
      is_personal: false,
      revenue_type: "receita",
      recurring: false,
      recurring_months: 1,
    },
  });
  const type = form.watch("type");
  const cats = type === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  // Reset default type when opening
  useMemo(() => {
    if (open) {
      form.reset({
        type: defaultType,
        category: "",
        description: "",
        amount: 0,
        payment_method: "",
        transaction_date: toISODate(new Date()),
        provider_id: "",
        account_source: "Caixa Banco",
        status: "PAID",
        is_personal: false,
        revenue_type: "receita",
        recurring: false,
        recurring_months: 1,
      });
    }
  }, [open, defaultType]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(v: z.infer<typeof txSchema>) {
    if (!companyId) return;

    // Verificação de despesas pessoais que excedem Salário + Retiradas
    if (v.type === "EXPENSE" && v.is_personal) {
      try {
        const { data: allTx } = await supabase
          .from("financial_transactions")
          .select("amount, type, transaction_date, is_personal, status")
          .eq("company_id", companyId);
        
        if (allTx) {
          const targetYM = v.transaction_date.slice(0, 7);
          let startYM = targetYM;
          for (const t of allTx) {
            if (t.transaction_date && t.transaction_date.slice(0, 7) < startYM) {
              startYM = t.transaction_date.slice(0, 7);
            }
          }
          const [selYear, selMonth] = targetYM.split("-").map(Number);
          const dateLimit = new Date(selYear, selMonth - 4, 1);
          const limitYM = dateLimit.toISOString().slice(0, 7);
          if (limitYM < startYM) {
            startYM = limitYM;
          }
          
          const ymList: string[] = [];
          let currentYear = Number(startYM.split("-")[0]);
          let currentMonth = Number(startYM.split("-")[1]);
          while (currentYear < selYear || (currentYear === selYear && currentMonth <= selMonth)) {
            ymList.push(`${currentYear}-${String(currentMonth).padStart(2, "0")}`);
            currentMonth++;
            if (currentMonth > 12) {
              currentMonth = 1;
              currentYear++;
            }
          }
          
          const monthlyData: Record<string, { revenueRealized: number; expenseRealized: number; expensePersonal: number; lucroEmpresa: number }> = {};
          for (const ym of ymList) {
            monthlyData[ym] = { revenueRealized: 0, expenseRealized: 0, expensePersonal: 0, lucroEmpresa: 0 };
          }
          for (const t of allTx) {
            if (!t.transaction_date) continue;
            const ym = t.transaction_date.slice(0, 7);
            if (!monthlyData[ym]) continue;
            const amt = Number(t.amount);
            if (t.type === "INCOME") {
              if (t.status === "PAID") {
                monthlyData[ym].revenueRealized += amt;
              }
            } else if (t.type === "EXPENSE") {
              if (t.is_personal) {
                if (t.status === "PAID") {
                  monthlyData[ym].expensePersonal += amt;
                }
              } else {
                if (t.status === "PAID") {
                  monthlyData[ym].expenseRealized += amt;
                }
              }
            }
          }
          for (const ym of ymList) {
            monthlyData[ym].lucroEmpresa = monthlyData[ym].revenueRealized - monthlyData[ym].expenseRealized;
          }
          
          let prevSalarioNaoRecebido = 0;
          let prevRetiradaLucroNaoRealizada = 0;
          let prevLucro = 0;
          let targetDireitoTotal = 0;
          let targetCurrentPersonal = 0;
          
          for (let idx = 0; idx < ymList.length; idx++) {
            const ym = ymList[idx];
            const mData = monthlyData[ym];
            let sumPersonal = mData.expensePersonal;
            let countPersonal = 1;
            if (idx >= 1) {
              sumPersonal += monthlyData[ymList[idx - 1]].expensePersonal;
              countPersonal++;
            }
            if (idx >= 2) {
              sumPersonal += monthlyData[ymList[idx - 2]].expensePersonal;
              countPersonal++;
            }
            const salarioCalculado = sumPersonal / countPersonal;
            const lucro30Prev = 0.30 * prevLucro;
            const retiradaPermitida = prevSalarioNaoRecebido + lucro30Prev + prevRetiradaLucroNaoRealizada;
            const direitoTotal = retiradaPermitida + salarioCalculado;
            
            if (ym === targetYM) {
              targetDireitoTotal = direitoTotal;
              targetCurrentPersonal = mData.expensePersonal;
            }
            
            const retiradasEfetuadas = mData.expensePersonal;
            let salarioNaoRecebido = 0;
            let retiradaLucroNaoRealizada = 0;
            if (retiradasEfetuadas < salarioCalculado) {
              salarioNaoRecebido = salarioCalculado - retiradasEfetuadas;
              retiradaLucroNaoRealizada = retiradaPermitida;
            } else {
              salarioNaoRecebido = 0;
              retiradaLucroNaoRealizada = Math.max(0, direitoTotal - retiradasEfetuadas);
            }
            prevSalarioNaoRecebido = salarioNaoRecebido;
            prevRetiradaLucroNaoRealizada = retiradaLucroNaoRealizada;
            prevLucro = mData.lucroEmpresa;
          }
          
          const futurePersonalSum = targetCurrentPersonal + Number(v.amount);
          if (futurePersonalSum > targetDireitoTotal) {
            alert("você está adoecendo o fluxo de caixa de sua empresa.");
          }
        }
      } catch (err) {
        console.error("Erro ao verificar limite de despesas pessoais:", err);
      }
    }

    const count = v.recurring && v.type === "EXPENSE" && v.recurring_months && v.recurring_months > 1
      ? v.recurring_months
      : 1;

    try {
      for (let i = 0; i < count; i++) {
        const baseDate = new Date(v.transaction_date + "T00:00:00");
        baseDate.setMonth(baseDate.getMonth() + i);
        const transactionDate = toISODate(baseDate);

        // Se for recorrência (count > 1), as parcelas futuras (i > 0) devem iniciar como pendentes (não pagas)
        const currentStatus = i === 0 ? (v.status || "PAID") : "PENDING";

        const { error } = await supabase.from("financial_transactions").insert({
          type: v.type,
          category: v.category,
          amount: v.amount,
          transaction_date: transactionDate,
          description: v.description || null,
          payment_method: v.payment_method || null,
          provider_id: v.provider_id || null,
          company_id: companyId,
          account_source: v.account_source || null,
          status: currentStatus,
          is_personal: v.type === "EXPENSE" ? !!v.is_personal : false,
          revenue_type: v.type === "INCOME" ? (v.revenue_type || "receita") : null,
        });

        if (error) throw error;
      }

      toast.success(
        v.type === "INCOME"
          ? "Receita registrada"
          : count > 1
          ? `Despesa e ${count - 1} recorrências registradas`
          : "Despesa registrada"
      );
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{type === "INCOME" ? "Fonte *" : "Saída *"}</Label>
              <Controller
                control={form.control}
                name="account_source"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Caixa Dinheiro">Caixa Dinheiro</SelectItem>
                      <SelectItem value="Caixa Banco">Caixa Banco</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.account_source && (
                <p className="text-xs text-destructive">{form.formState.errors.account_source.message}</p>
              )}
            </div>

            {type === "INCOME" && (
              <div className="space-y-2">
                <Label>Tipo de Receita</Label>
                <Controller
                  control={form.control}
                  name="revenue_type"
                  render={({ field }) => (
                    <Select value={field.value || "receita"} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="receita">Receita Padrão</SelectItem>
                        <SelectItem value="aporte">Aporte (Aporte de Capital)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}

            {type === "EXPENSE" && (
              <div className="space-y-2">
                <Label>Destinação</Label>
                <Controller
                  control={form.control}
                  name="is_personal"
                  render={({ field }) => (
                    <Select value={field.value ? "true" : "false"} onValueChange={(val) => field.onChange(val === "true")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="false">Empresa (Comercial)</SelectItem>
                        <SelectItem value="true">Pessoal (Particular)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}
          </div>

          {type === "EXPENSE" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Status do Pagamento</Label>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PAID">Paga</SelectItem>
                        <SelectItem value="PENDING">Pendente (Não Paga)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <Controller
                  control={form.control}
                  name="provider_id"
                  render={({ field }) => (
                    <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {(providersQuery.data ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          )}

          {type === "EXPENSE" && (
            <div className="rounded-lg border p-3 bg-muted/20 space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  {...form.register("recurring")}
                  className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                />
                <span>Despesa Recorrente?</span>
              </label>
              {form.watch("recurring") && (
                <div className="space-y-2">
                  <Label>Número de meses (Repetições)</Label>
                  <Input
                    type="number"
                    min="2"
                    max="36"
                    {...form.register("recurring_months")}
                    placeholder="Ex: 3"
                  />
                  {form.formState.errors.recurring_months && (
                    <p className="text-xs text-destructive">{form.formState.errors.recurring_months.message}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input {...form.register("description")} placeholder="Ex: Aluguel da sala" />
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

function GroupedList({
  items,
  mode,
  onComplete,
  onConfirm,
  onChanged,
  services,
  professionals,
  shouldRestrictAgenda,
  myProfessional,
}: {
  items: any[];
  mode: PeriodMode;
  onComplete: (id: string) => void;
  onConfirm: (id: string) => void;
  onChanged: () => void;
  services: any[];
  professionals: any[];
  shouldRestrictAgenda: boolean;
  myProfessional: any;
}) {
  if (mode === "today") {
    return (
      <ul className="divide-y">
        {items.map((a) => (
          <AppointmentRow
            key={a.id}
            a={a}
            onComplete={onComplete}
            onConfirm={onConfirm}
            onChanged={onChanged}
            services={services}
            professionals={professionals}
            shouldRestrictAgenda={shouldRestrictAgenda}
            myProfessional={myProfessional}
          />
        ))}
      </ul>
    );
  }
  const groups = new Map<string, any[]>();
  for (const a of items) {
    const k = new Date(a.start_datetime).toISOString().slice(0, 10);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(a);
  }
  return (
    <div className="space-y-5">
      {Array.from(groups.entries()).map(([day, arr]) => (
        <div key={day}>
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
            {new Date(day + "T00:00:00").toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "short",
            })}
          </p>
          <ul className="divide-y">
            {arr.map((a) => (
              <AppointmentRow
                key={a.id}
                a={a}
                onComplete={onComplete}
                onConfirm={onConfirm}
                onChanged={onChanged}
                services={services}
                professionals={professionals}
                shouldRestrictAgenda={shouldRestrictAgenda}
                myProfessional={myProfessional}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function AppointmentRow({
  a,
  onComplete,
  onConfirm,
  onChanged,
  services,
  professionals,
  shouldRestrictAgenda,
  myProfessional,
}: {
  a: any;
  onComplete: (id: string) => void;
  onConfirm: (id: string) => void;
  onChanged: () => void;
  services: any[];
  professionals: any[];
  shouldRestrictAgenda: boolean;
  myProfessional: any;
}) {
  const { data: profile } = useCurrentProfile();
  const isAdm = profile?.role === "owner" || profile?.role === "admin";

  async function unblock() {
    const { error } = await supabase.from("appointments").delete().eq("id", a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Bloqueio de horário removido");
    onChanged();
  }

  if (a.status === "BLOCKED") {
    const startDt = new Date(a.start_datetime);
    const endDt = new Date(a.end_datetime);
    const calculatedDuration = Math.round((endDt.getTime() - startDt.getTime()) / 60_000);

    return (
      <li className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b sm:border-b-0 last:border-b-0">
        <div className="flex items-center gap-3 min-w-0 flex-1 bg-destructive/5 border-l-4 border-destructive pl-3 py-1.5 rounded-r-lg">
          <div className="text-center w-14 shrink-0">
            <p className="text-sm font-semibold text-destructive">
              {startDt.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="text-[10px] text-muted-foreground">{calculatedDuration}min</p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm text-destructive truncate">Horário Bloqueado</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs text-muted-foreground">
                {a.notes ? a.notes : "Sem justificativa informada"}
                {a.professionals?.name && ` · Prof: ${a.professionals.name}`}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0">
          <span className={`text-[11px] rounded-full px-2 py-0.5 ${statusStyle(a.status)}`}>
            {statusLabel(a.status)}
          </span>
          {isAdm && (
            <Button
              size="sm"
              variant="ghost"
              onClick={unblock}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 px-2"
              title="Remover Bloqueio"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              <span className="text-xs">Desbloquear</span>
            </Button>
          )}
        </div>
      </li>
    );
  }

  return (
    <li className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b sm:border-b-0 last:border-b-0">
      <Link
        to="/app/clients/$clientId"
        params={{ clientId: a.client_id || "" }}
        className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-80"
      >
        <div className="text-center w-14 shrink-0">
          <p className="text-sm font-semibold">
            {new Date(a.start_datetime).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="text-[10px] text-muted-foreground">{a.services?.duration_minutes}min</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{a.clients?.name}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-xs text-muted-foreground">
              {a.services?.name} · {formatBRL(Number(a.price))}
              {a.professionals?.name && ` · Prof: ${a.professionals.name}`}
            </p>
            {a.notes && (
              <span
                className="text-[9px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded truncate max-w-[200px]"
                title={a.notes}
              >
                {a.notes}
              </span>
            )}
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0">
        <span className={`text-[11px] rounded-full px-2 py-0.5 ${statusStyle(a.status)}`}>
          {statusLabel(a.status)}
        </span>
        {a.status !== "COMPLETED" && a.status !== "CANCELLED" && (
          <div className="flex items-center gap-1.5">
            {a.status === "SCHEDULED" && (
              <Button size="sm" variant="ghost" onClick={() => onConfirm(a.id)} title="Confirmar">
                <Check className="h-4 w-4" />
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onComplete(a.id)}>
              <Check className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Concluir</span>
            </Button>
            <EditAppointment
              a={a}
              services={services}
              professionals={professionals}
              shouldRestrictAgenda={shouldRestrictAgenda}
              myProfessional={myProfessional}
              onChanged={onChanged}
            />
            {isAdm && <CancelAppointment a={a} onChanged={onChanged} />}
          </div>
        )}
      </div>
    </li>
  );
}

function EditAppointment({
  a,
  services,
  professionals,
  shouldRestrictAgenda,
  myProfessional,
  onChanged,
}: {
  a: any;
  services: any[];
  professionals: any[];
  shouldRestrictAgenda: boolean;
  myProfessional: any;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const startDate = new Date(a.start_datetime);
  const [date, setDate] = useState(toISODate(startDate));
  const [time, setTime] = useState(startDate.toTimeString().slice(0, 5));
  const [serviceId, setServiceId] = useState<string>(a.service_id);
  const [professionalId, setProfessionalId] = useState<string>(a.professional_id ?? "");
  const [price, setPrice] = useState<string>(String(a.price));

  const [billText, setBillText] = useState("");
  const [loadingBill, setLoadingBill] = useState(false);

  useEffect(() => {
    if (!open) {
      setBillText("");
    }
  }, [open]);

  async function handleGenerateBill() {
    if (!a.client_id) {
      toast.error("Cliente não identificado neste agendamento.");
      return;
    }
    setLoadingBill(true);
    try {
      const startOfDay = `${date}T00:00:00.000Z`;
      const endOfDay = `${date}T23:59:59.999Z`;

      const { data: dayApps, error } = await supabase
        .from("appointments")
        .select("price, services(name)")
        .eq("client_id", a.client_id)
        .eq("company_id", a.company_id)
        .gte("start_datetime", startOfDay)
        .lte("start_datetime", endOfDay)
        .neq("status", "CANCELLED");

      if (error) throw error;

      const formattedDate = new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
      const clientName = a.clients?.name || "Cliente";
      let text = `Olá, ${clientName}! Segue o descritivo dos seus serviços de hoje (${formattedDate}):\n\n`;

      let total = 0;
      if (dayApps && dayApps.length > 0) {
        dayApps.forEach((item: any) => {
          const svcName = item.services?.name || "Serviço";
          const priceVal = Number(item.price ?? 0);
          text += `• ${svcName}: ${formatBRL(priceVal)}\n`;
          total += priceVal;
        });
      } else {
        const svc = services.find((s) => s.id === serviceId);
        const svcName = svc?.name || "Serviço";
        text += `• ${svcName}: ${formatBRL(Number(price))}\n`;
        total = Number(price);
      }

      text += `\n*Total: ${formatBRL(total)}*\n\nSe preferir, você pode efetuar o pagamento via PIX.\nMuito obrigado pela preferência!`;
      setBillText(text);
      toast.success("Resumo da conta gerado com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao gerar conta: " + err.message);
    } finally {
      setLoadingBill(false);
    }
  }

  async function save() {
    const svc = services.find((s) => s.id === serviceId);
    const startDt = new Date(`${date}T${time}:00`);
    const endDt = new Date(startDt.getTime() + (svc?.duration_minutes ?? 60) * 60_000);
    const finalProfId = shouldRestrictAgenda
      ? (myProfessional?.id ?? null)
      : professionalId === "none" || !professionalId
        ? null
        : professionalId;

    const { error } = await supabase
      .from("appointments")
      .update({
        service_id: serviceId,
        professional_id: finalProfId,
        start_datetime: startDt.toISOString(),
        end_datetime: endDt.toISOString(),
        price: Number(price),
      })
      .eq("id", a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Agendamento atualizado");
    setOpen(false);
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Editar / Reagendar">
          <Edit3 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar agendamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Serviço</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!shouldRestrictAgenda && (
            <div className="space-y-2">
              <Label>Profissional</Label>
              <Select value={professionalId || "none"} onValueChange={setProfessionalId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem profissional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem profissional</SelectItem>
                  {professionals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Hora</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          {billText && (
            <div className="mt-4 p-4 border border-primary/20 bg-primary/5 rounded-lg space-y-3">
              <Label className="font-semibold text-xs text-primary uppercase tracking-wider block">Resumo da Conta</Label>
              <Textarea
                value={billText}
                onChange={(e) => setBillText(e.target.value)}
                rows={7}
                className="font-mono text-xs leading-relaxed bg-background"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs gap-1.5"
                  onClick={() => {
                    navigator.clipboard.writeText(billText);
                    toast.success("Copiado para a área de transferência!");
                  }}
                >
                  <Check className="h-3.5 w-3.5" /> Copiar Texto
                </Button>
                {a.clients?.phone && (
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1 text-xs bg-green-600 hover:bg-green-700 text-white gap-1.5"
                    onClick={() => {
                      navigator.clipboard.writeText(billText);
                      const cleanPhone = a.clients.phone.replace(/\D/g, "");
                      window.open(`https://api.whatsapp.com/send?phone=55${cleanPhone}&text=${encodeURIComponent(billText)}`, "_blank");
                    }}
                  >
                    <Share2 className="h-3.5 w-3.5" /> WhatsApp
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="flex flex-col sm:flex-row sm:justify-between items-center gap-2 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handleGenerateBill}
            disabled={loadingBill}
            className="w-full sm:w-auto gap-2 border-primary/45 text-primary hover:bg-primary/5 mr-auto"
          >
            <Receipt className="h-4 w-4" /> {loadingBill ? "Gerando..." : "Gerar Conta do Dia"}
          </Button>
          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>Salvar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelAppointment({ a, onChanged }: { a: any; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [type, setType] = useState<"CANCELLED" | "NO_SHOW">("CANCELLED");
  async function save() {
    const { error } = await supabase
      .from("appointments")
      .update({ status: type, cancellation_reason: reason || null })
      .eq("id", a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(type === "CANCELLED" ? "Cancelado" : "Marcado como falta");
    setOpen(false);
    onChanged();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Cancelar">
          <X className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar atendimento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CANCELLED">Cancelamento</SelectItem>
                <SelectItem value="NO_SHOW">Falta (no-show)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Observação</Label>
            <Textarea
              rows={3}
              placeholder="Por que foi cancelado?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={save}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormSelectField({
  label,
  name,
  form,
  options,
}: {
  label: string;
  name: any;
  form: any;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {form.formState.errors[name] && (
        <p className="text-xs text-destructive">{String(form.formState.errors[name].message)}</p>
      )}
    </div>
  );
}

function statusLabel(s: string) {
  return (
    (
      {
        SCHEDULED: "Agendado",
        CONFIRMED: "Confirmado",
        COMPLETED: "Concluído",
        CANCELLED: "Cancelado",
        NO_SHOW: "Faltou",
        BLOCKED: "Bloqueado",
      } as Record<string, string>
    )[s] ?? s
  );
}
function statusStyle(s: string) {
  return (
    (
      {
        SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
        CONFIRMED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
        COMPLETED: "bg-primary/15 text-primary",
        CANCELLED: "bg-destructive/15 text-destructive",
        NO_SHOW: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
        BLOCKED: "bg-destructive/15 text-destructive font-semibold border border-destructive/20",
      } as Record<string, string>
    )[s] ?? "bg-muted text-muted-foreground"
  );
}

const providerSchema = z.object({
  client_id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().min(1, "Nome é obrigatório"),
  document: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
});

function NewProviderDialog({
  open,
  onOpenChange,
  companyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
}) {
  const queryClient = useQueryClient();

  const clientsQuery = useQuery({
    enabled: !!companyId && open,
    queryKey: ["clients-options-for-providers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, phone")
        .eq("company_id", companyId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const form = useForm<z.infer<typeof providerSchema>>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      client_id: "",
      name: "",
      document: "",
      phone: "",
      address: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        client_id: "",
        name: "",
        document: "",
        phone: "",
        address: "",
      });
    }
  }, [open]);

  async function onSubmit(v: z.infer<typeof providerSchema>) {
    if (!companyId) return;
    const { error } = await supabase.from("providers").insert({
      company_id: companyId,
      client_id: v.client_id || null,
      name: v.name,
      document: v.document || null,
      phone: v.phone || null,
      address: v.address || null,
    });

    if (error) return toast.error(error.message);
    toast.success("Fornecedor cadastrado com sucesso!");
    queryClient.invalidateQueries({ queryKey: ["providers-select", companyId] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastrar Fornecedor</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Associar a Cliente Existente (Opcional)</Label>
            <Controller
              control={form.control}
              name="client_id"
              render={({ field }) => (
                <Select
                  value={field.value || "none"}
                  onValueChange={(val) => {
                    field.onChange(val === "none" ? "" : val);
                    if (val !== "none") {
                      const selectedClient = (clientsQuery.data ?? []).find((c) => c.id === val);
                      if (selectedClient) {
                        form.setValue("name", selectedClient.name);
                        form.setValue("phone", selectedClient.phone || "");
                      }
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente para importar dados" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum (Criar avulso)</SelectItem>
                    {(clientsQuery.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input {...form.register("name")} placeholder="Nome do fornecedor" />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>CNPJ / CPF</Label>
            <Input {...form.register("document")} placeholder="00.000.000/0000-00 ou 000.000.000-00" />
            {form.formState.errors.document && (
              <p className="text-xs text-destructive">{form.formState.errors.document.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input {...form.register("phone")} placeholder="(00) 00000-0000" />
            {form.formState.errors.phone && (
              <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Endereço</Label>
            <Input {...form.register("address")} placeholder="Endereço completo" />
            {form.formState.errors.address && (
              <p className="text-xs text-destructive">{form.formState.errors.address.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BlockSlotDialog({
  open,
  onOpenChange,
  companyId,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  onChanged: () => void;
}) {
  const professionalsQuery = useQuery({
    enabled: !!companyId && open,
    queryKey: ["professionals-options", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, name")
        .eq("company_id", companyId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [selectedHours, setSelectedHours] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset when opening
  useEffect(() => {
    if (open) {
      setProfessionalId("");
      setDate(toISODate(new Date()));
      setSelectedHours([]);
      setNotes("");
    }
  }, [open]);

  // If there's only one professional, auto-select it
  useEffect(() => {
    if (open && professionalsQuery.data && professionalsQuery.data.length > 0 && !professionalId) {
      setProfessionalId(professionalsQuery.data[0].id);
    }
  }, [open, professionalsQuery.data, professionalId]);

  const ALL_HOURS = [
    "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
    "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
    "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"
  ];

  const toggleHour = (hour: string) => {
    setSelectedHours((prev) =>
      prev.includes(hour) ? prev.filter((h) => h !== hour) : [...prev, hour]
    );
  };

  async function handleBlock() {
    if (!companyId) return;
    if (!professionalId) {
      toast.error("Selecione o profissional.");
      return;
    }
    if (!date) {
      toast.error("Selecione a data.");
      return;
    }
    if (selectedHours.length === 0) {
      toast.error("Selecione pelo menos um horário para bloquear.");
      return;
    }

    setSubmitting(true);
    try {
      // Sort selected hours chronologically
      const sortedHours = [...selectedHours].sort((a, b) => {
        const [ha, ma] = a.split(":").map(Number);
        const [hb, mb] = b.split(":").map(Number);
        return (ha * 60 + ma) - (hb * 60 + mb);
      });

      // Merge contiguous slots (each is 30 mins)
      const intervals: { start: string; end: string }[] = [];
      let currentStart: string | null = null;
      let currentEnd: string | null = null;

      const computeEnd = (hour: string): string => {
        const parts = hour.split(":").map((v) => Number(v));
        const hh: number = parts[0];
        const mm: number = parts[1];
        const endMinutes: number = mm + 30;
        const endHour: number = hh + Math.floor(endMinutes / 60);
        const endMin: number = endMinutes % 60;
        return `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;
      };

      for (const hour of sortedHours) {
        if (!currentStart) {
          currentStart = hour;
          currentEnd = computeEnd(hour);
        } else {
          if (hour === currentEnd) {
            currentEnd = computeEnd(hour);
          } else {
            intervals.push({ start: currentStart as string, end: currentEnd as string });
            currentStart = hour;
            currentEnd = computeEnd(hour);
          }
        }
      }
      if (currentStart && currentEnd) {
        intervals.push({ start: currentStart, end: currentEnd });
      }

      // Insert into db
      for (const interval of intervals) {
        const startDt = new Date(`${date}T${interval.start}:00`);
        const endDt = new Date(`${date}T${interval.end}:00`);

        const { error } = await supabase.from("appointments").insert({
          company_id: companyId,
          client_id: null,
          service_id: null,
          professional_id: professionalId,
          start_datetime: startDt.toISOString(),
          end_datetime: endDt.toISOString(),
          status: "BLOCKED",
          notes: notes.trim() || "Horário Bloqueado",
          price: 0,
        });

        if (error) throw error;
      }

      toast.success("Horário(s) bloqueado(s) com sucesso!");
      onChanged();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao bloquear horário.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bloquear Horários</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Profissional *</Label>
            <Select value={professionalId} onValueChange={setProfessionalId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um profissional" />
              </SelectTrigger>
              <SelectContent>
                {(professionalsQuery.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Data *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Selecione os Horários para Bloquear
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {ALL_HOURS.map((hour) => {
                const isSelected = selectedHours.includes(hour);
                return (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => toggleHour(hour)}
                    className={`px-2 py-2.5 text-xs font-semibold rounded-lg border transition ${
                      isSelected
                        ? "bg-destructive text-destructive-foreground border-destructive shadow-sm"
                        : "bg-background hover:bg-secondary/40 text-foreground border-border"
                    }`}
                  >
                    {hour}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Justificativa / Notas</Label>
            <Textarea
              placeholder="Ex: Horário de almoço, treinamento, etc."
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleBlock} disabled={submitting}>
              {submitting ? "Bloqueando..." : "Bloquear Horário"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface CloseMonthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  currentMonth: string;
  onChanged: () => void;
}

export function CloseMonthDialog({
  open,
  onOpenChange,
  companyId,
  currentMonth,
  onChanged,
}: CloseMonthDialogProps) {
  const queryClient = useQueryClient();
  const MONTH_NAMES_PT = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [newDueDate, setNewDueDate] = useState<string>("");

  const [yearStr, monthStr] = currentMonth.split("-");
  const year = parseInt(yearStr || "2026", 10);
  const month = parseInt(monthStr || "06", 10);
  const start = `${currentMonth}-01`;
  
  // Calcular o fim do mês adicionando 1 mês e pegando o primeiro dia
  const nextMonthDate = new Date(year, month, 1);
  const end = nextMonthDate.toISOString().slice(0, 10);
  const monthName = MONTH_NAMES_PT[month - 1] || "Mês Selecionado";

  const { data: pendingExpenses = [], refetch, isLoading } = useQuery({
    enabled: open && !!companyId,
    queryKey: ["pending-expenses", companyId, currentMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select("*")
        .eq("company_id", companyId!)
        .eq("type", "EXPENSE")
        .eq("status", "PENDING")
        .gte("transaction_date", start)
        .lt("transaction_date", end)
        .order("transaction_date", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  async function handlePay(id: string) {
    const { error } = await supabase
      .from("financial_transactions")
      .update({ status: "PAID" })
      .eq("id", id);

    if (error) {
      toast.error("Erro ao liquidar despesa: " + error.message);
      return;
    }

    toast.success("Despesa liquidada com sucesso!");
    refetch();
    onChanged();
  }

  async function handleReschedule(tx: any) {
    if (!newDueDate) {
      toast.error("Selecione uma nova data de vencimento.");
      return;
    }

    const originalDesc = tx.description || "";
    const suffix = ` (alteração de data de vencimento não paga no mês de ${monthName} por esta razão a data foi alterada para a data escolhida)`;
    const newDesc = originalDesc + suffix;

    const { error } = await supabase
      .from("financial_transactions")
      .update({
        transaction_date: newDueDate,
        description: newDesc,
      })
      .eq("id", tx.id);

    if (error) {
      toast.error("Erro ao reprogramar despesa: " + error.message);
      return;
    }

    toast.success("Despesa reprogramada com sucesso!");
    setEditingId(null);
    setNewDueDate("");
    refetch();
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
            <Wallet className="h-5 w-5 text-primary" />
            Fechar Mês: {monthName} / {year}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-2">
          <p className="text-sm text-muted-foreground">
            Abaixo estão listadas todas as despesas que ficaram pendentes (não pagas) neste mês.
            Você deve liquidar ou alterar o vencimento de cada uma para poder concluir o fechamento do período.
          </p>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <span className="text-sm text-muted-foreground">Carregando despesas pendentes...</span>
            </div>
          ) : pendingExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center bg-muted/20 border border-dashed rounded-lg p-6">
              <div className="rounded-full bg-primary/10 p-3 mb-3">
                <Check className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Tudo limpo!</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">
                Nenhuma despesa pendente encontrada para o mês de {monthName}. Tudo foi devidamente liquidado ou reprogramado.
              </p>
              <Button onClick={() => onOpenChange(false)} className="mt-4" variant="outline">
                Fechar Janela
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingExpenses.map((tx: any) => {
                const isEditing = editingId === tx.id;

                return (
                  <div
                    key={tx.id}
                    className="flex flex-col p-4 rounded-lg bg-card border border-border/60 hover:border-border transition-colors duration-200 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <h4 className="font-medium text-sm text-foreground">{tx.description}</h4>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="h-3.5 w-3.5" />
                            {new Date(tx.transaction_date + "T00:00:00").toLocaleDateString("pt-BR")}
                          </span>
                          <span>•</span>
                          <span className="font-semibold text-destructive">{formatBRL(tx.amount)}</span>
                          {tx.account_source && (
                            <>
                              <span>•</span>
                              <span className="bg-muted px-1.5 py-0.5 rounded text-[10px]">
                                {tx.account_source}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {!isEditing && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingId(tx.id);
                              setNewDueDate(tx.transaction_date);
                            }}
                            className="h-8 px-2 text-xs flex items-center gap-1"
                          >
                            <CalendarIcon className="h-3 w-3" />
                            Vencimento
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handlePay(tx.id)}
                            className="h-8 px-2 text-xs flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <Check className="h-3 w-3" />
                            Liquidar
                          </Button>
                        </div>
                      )}
                    </div>

                    {isEditing && (
                      <div className="mt-4 pt-3 border-t border-dashed flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 p-2.5 rounded-md">
                        <div className="flex flex-col gap-1 w-full sm:max-w-xs">
                          <Label className="text-xs text-muted-foreground">Novo Vencimento</Label>
                          <Input
                            type="date"
                            value={newDueDate}
                            onChange={(e) => setNewDueDate(e.target.value)}
                            className="h-9 text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(null);
                              setNewDueDate("");
                            }}
                            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleReschedule(tx)}
                            className="h-8 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/95"
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Confirmar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


