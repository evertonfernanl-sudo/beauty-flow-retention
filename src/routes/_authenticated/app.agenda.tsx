import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Calendar as CalendarIcon, Check } from "lucide-react";
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
  date: z.string().min(1, "Data obrigatória"),
  time: z.string().min(1, "Hora obrigatória"),
});

function AgendaPage() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [open, setOpen] = useState(false);

  const { start, end } = useMemo(() => {
    const d = new Date(selectedDate + "T00:00:00");
    const next = new Date(d); next.setDate(d.getDate() + 1);
    return { start: d.toISOString(), end: next.toISOString() };
  }, [selectedDate]);

  const list = useQuery({
    enabled: !!companyId,
    queryKey: ["appointments", companyId, selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, start_datetime, end_datetime, status, price, notes, clients(name, phone), services(name, duration_minutes)")
        .eq("company_id", companyId!)
        .gte("start_datetime", start)
        .lt("start_datetime", end)
        .order("start_datetime");
      if (error) throw error;
      return data;
    },
  });

  const clients = useQuery({
    enabled: !!companyId,
    queryKey: ["clients-options", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").eq("company_id", companyId!).order("name");
      return data ?? [];
    },
  });
  const services = useQuery({
    enabled: !!companyId,
    queryKey: ["services-options", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("services").select("id, name, price, duration_minutes").eq("company_id", companyId!).eq("active", true).order("name");
      return data ?? [];
    },
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { client_id: "", service_id: "", date: selectedDate, time: "09:00" },
  });

  async function onCreate(values: z.infer<typeof schema>) {
    if (!companyId) return;
    const svc = services.data?.find((s) => s.id === values.service_id);
    if (!svc) return;
    const startDt = new Date(`${values.date}T${values.time}:00`);
    const endDt = new Date(startDt.getTime() + (svc.duration_minutes ?? 60) * 60_000);

    const { error } = await supabase.from("appointments").insert({
      company_id: companyId,
      client_id: values.client_id,
      service_id: values.service_id,
      start_datetime: startDt.toISOString(),
      end_datetime: endDt.toISOString(),
      price: Number(svc.price ?? 0),
      status: "SCHEDULED",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Atendimento agendado!");
    form.reset({ client_id: "", service_id: "", date: values.date, time: "09:00" });
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["appointments", companyId] });
  }

  async function markCompleted(id: string) {
    const { error } = await supabase.from("appointments").update({ status: "COMPLETED" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Atendimento concluído. Retorno criado automaticamente.");
    queryClient.invalidateQueries({ queryKey: ["appointments", companyId] });
    queryClient.invalidateQueries({ queryKey: ["returns-preview"] });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">Marque, conclua e o retorno se calcula sozinho.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-auto" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> Agendar</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo agendamento</DialogTitle></DialogHeader>
              <form onSubmit={form.handleSubmit(onCreate)} className="space-y-4">
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Controller
                    control={form.control}
                    name="client_id"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {clients.data?.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {form.formState.errors.client_id && <p className="text-xs text-destructive">{form.formState.errors.client_id.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Serviço</Label>
                  <Controller
                    control={form.control}
                    name="service_id"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {services.data?.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name} · {formatBRL(Number(s.price))}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {form.formState.errors.service_id && <p className="text-xs text-destructive">{form.formState.errors.service_id.message}</p>}
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
                <DialogFooter>
                  <Button type="submit" disabled={form.formState.isSubmitting}>Agendar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <Card className="p-4">
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>
        ) : !list.data?.length ? (
          <div className="py-16 text-center">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <p className="mt-3 font-medium">Nada agendado para este dia</p>
            <p className="text-sm text-muted-foreground">Aproveite e cadastre o próximo atendimento.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {list.data.map((a: any) => (
              <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-center w-14 shrink-0">
                    <p className="text-sm font-semibold">
                      {new Date(a.start_datetime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{a.services?.duration_minutes}min</p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{a.clients?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.services?.name} · {formatBRL(Number(a.price))}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] rounded-full px-2 py-0.5 ${statusStyle(a.status)}`}>{statusLabel(a.status)}</span>
                  {a.status !== "COMPLETED" && (
                    <Button size="sm" variant="outline" onClick={() => markCompleted(a.id)}>
                      <Check className="h-4 w-4 mr-1" /> Concluir
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function statusLabel(s: string) {
  return ({
    SCHEDULED: "Agendado",
    CONFIRMED: "Confirmado",
    COMPLETED: "Concluído",
    CANCELLED: "Cancelado",
    NO_SHOW: "Faltou",
  } as Record<string, string>)[s] ?? s;
}
function statusStyle(s: string) {
  return ({
    COMPLETED: "bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]",
    CANCELLED: "bg-destructive/15 text-destructive",
    NO_SHOW: "bg-destructive/15 text-destructive",
    CONFIRMED: "bg-secondary text-secondary-foreground",
    SCHEDULED: "bg-muted text-muted-foreground",
  } as Record<string, string>)[s] ?? "bg-muted text-muted-foreground";
}
