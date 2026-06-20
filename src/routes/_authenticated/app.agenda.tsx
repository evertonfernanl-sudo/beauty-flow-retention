import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Plus,
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  Edit3,
  Search,
} from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/agenda")({
  head: () => ({ meta: [{ title: "Agenda · BeautyFlow" }] }),
  component: AgendaPage,
});

const schema = z.object({
  client_id: z.string().uuid("Selecione a cliente"),
  service_id: z.string().uuid("Selecione o serviço"),
  professional_id: z.string().uuid("Selecione o profissional").optional().nullable(),
  date: z.string().min(1, "Data obrigatória"),
  time: z.string().min(1, "Hora obrigatória"),
  price: z.coerce.number().min(0).optional(),
  notes: z.string().max(500).optional().or(z.literal("")),
});

type ViewMode = "day" | "week" | "month";
type StatusFilter = "ALL" | "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function AgendaPage() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("day");
  const [cursor, setCursor] = useState(() => new Date());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const isEmployee = profile?.role === "employee";

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

  const { start, end, label } = useMemo(() => rangeFor(view, cursor), [view, cursor]);

  const list = useQuery({
    enabled: !!companyId && (!isEmployee || !!myProfessional),
    queryKey: [
      "appointments",
      companyId,
      view,
      start.toISOString(),
      statusFilter,
      isEmployee,
      myProfessional?.id,
    ],
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select(
          "id, start_datetime, end_datetime, status, price, notes, cancellation_reason, client_id, service_id, professional_id, clients(name, phone), services(name, duration_minutes, price)",
        )
        .eq("company_id", companyId!)
        .gte("start_datetime", start.toISOString())
        .lt("start_datetime", end.toISOString())
        .order("start_datetime");
      if (statusFilter !== "ALL") q = q.eq("status", statusFilter);
      if (isEmployee && myProfessional) {
        q = q.eq("professional_id", myProfessional.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
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
      service_id: "",
      professional_id: "",
      date: toISODate(new Date()),
      time: "09:00",
      notes: "",
    },
  });

  const selectedServiceId = form.watch("service_id");
  const selectedService = services.data?.find((s: any) => s.id === selectedServiceId);
  // auto-fill price when service changes
  useMemo(() => {
    if (selectedService) form.setValue("price", Number(selectedService.price ?? 0));
  }, [selectedServiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onCreate(values: z.infer<typeof schema>) {
    if (!companyId) return;
    const svc = services.data?.find((s: any) => s.id === values.service_id);
    if (!svc) return;
    const startDt = new Date(`${values.date}T${values.time}:00`);
    const endDt = new Date(startDt.getTime() + (svc.duration_minutes ?? 60) * 60_000);
    const { error } = await supabase.from("appointments").insert({
      company_id: companyId,
      client_id: values.client_id,
      service_id: values.service_id,
      professional_id: isEmployee ? (myProfessional?.id ?? null) : values.professional_id || null,
      start_datetime: startDt.toISOString(),
      end_datetime: endDt.toISOString(),
      price: values.price ?? Number(svc.price ?? 0),
      notes: values.notes || null,
      status: "SCHEDULED",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Atendimento agendado!");
    form.reset({
      client_id: "",
      service_id: "",
      professional_id: "",
      date: values.date,
      time: "09:00",
      notes: "",
    });
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["appointments", companyId] });
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

  function step(dir: -1 | 1) {
    const d = new Date(cursor);
    if (view === "day") d.setDate(d.getDate() + dir);
    if (view === "week") d.setDate(d.getDate() + dir * 7);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    setCursor(d);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden md:block">
            <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="day">Dia</TabsTrigger>
                <TabsTrigger value="week">Semana</TabsTrigger>
                <TabsTrigger value="month">Mês</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <Button variant="outline" size="icon" onClick={() => step(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
            Hoje
          </Button>
          <Button variant="outline" size="icon" onClick={() => step(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1" /> Agendar
              </Button>
            </DialogTrigger>
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
                {!isEmployee && (
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
                <FormSelectField
                  label="Serviço"
                  name="service_id"
                  form={form}
                  options={(services.data ?? []).map((s: any) => ({
                    value: s.id,
                    label: `${s.name} · ${formatBRL(Number(s.price))}`,
                  }))}
                />
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
        </div>
      </header>

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
            view={view}
            onComplete={markCompleted}
            onConfirm={confirmAppointment}
            onChanged={() =>
              queryClient.invalidateQueries({ queryKey: ["appointments", companyId] })
            }
            services={services.data ?? []}
            professionals={professionals.data ?? []}
            isEmployee={isEmployee}
            myProfessional={myProfessional}
          />
        )}
      </Card>
    </div>
  );
}

function GroupedList({
  items,
  view,
  onComplete,
  onConfirm,
  onChanged,
  services,
  professionals,
  isEmployee,
  myProfessional,
}: {
  items: any[];
  view: ViewMode;
  onComplete: (id: string) => void;
  onConfirm: (id: string) => void;
  onChanged: () => void;
  services: any[];
  professionals: any[];
  isEmployee: boolean;
  myProfessional: any;
}) {
  if (view === "day") {
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
            isEmployee={isEmployee}
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
                isEmployee={isEmployee}
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
  isEmployee,
  myProfessional,
}: {
  a: any;
  onComplete: (id: string) => void;
  onConfirm: (id: string) => void;
  onChanged: () => void;
  services: any[];
  professionals: any[];
  isEmployee: boolean;
  myProfessional: any;
}) {
  return (
    <li className="py-3 flex items-center justify-between gap-3">
      <Link
        to="/app/clients/$clientId"
        params={{ clientId: a.client_id }}
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
          <p className="font-medium truncate text-sm">{a.clients?.name}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-xs text-muted-foreground truncate">
              {a.services?.name} · {formatBRL(Number(a.price))}
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
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`text-[11px] rounded-full px-2 py-0.5 ${statusStyle(a.status)}`}>
          {statusLabel(a.status)}
        </span>
        {a.status !== "COMPLETED" && a.status !== "CANCELLED" && (
          <>
            {a.status === "SCHEDULED" && (
              <Button size="sm" variant="ghost" onClick={() => onConfirm(a.id)} title="Confirmar">
                <Check className="h-4 w-4" />
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onComplete(a.id)}>
              <Check className="h-4 w-4 mr-1" /> Concluir
            </Button>
            <EditAppointment
              a={a}
              services={services}
              professionals={professionals}
              isEmployee={isEmployee}
              myProfessional={myProfessional}
              onChanged={onChanged}
            />
            <CancelAppointment a={a} onChanged={onChanged} />
          </>
        )}
      </div>
    </li>
  );
}

function EditAppointment({
  a,
  services,
  professionals,
  isEmployee,
  myProfessional,
  onChanged,
}: {
  a: any;
  services: any[];
  professionals: any[];
  isEmployee: boolean;
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

  async function save() {
    const svc = services.find((s) => s.id === serviceId);
    const startDt = new Date(`${date}T${time}:00`);
    const endDt = new Date(startDt.getTime() + (svc?.duration_minutes ?? 60) * 60_000);
    const finalProfId = isEmployee
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
      <DialogContent>
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
          {!isEmployee && (
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
        </div>
        <DialogFooter>
          <Button onClick={save}>Salvar</Button>
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

function rangeFor(view: ViewMode, cursor: Date): { start: Date; end: Date; label: string } {
  const d = new Date(cursor);
  if (view === "day") {
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      start,
      end,
      label: d.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    };
  }
  if (view === "week") {
    const start = new Date(d);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return {
      start,
      end,
      label: `Semana de ${start.toLocaleDateString("pt-BR")} a ${new Date(end.getTime() - 86400000).toLocaleDateString("pt-BR")}`,
    };
  }
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return {
    start,
    end,
    label: start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
  };
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
      } as Record<string, string>
    )[s] ?? "bg-muted text-muted-foreground"
  );
}
