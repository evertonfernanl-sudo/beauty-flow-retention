import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { MoreVertical, Plus, Scissors, Trophy, TrendingUp, Repeat } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/services")({
  head: () => ({ meta: [{ title: "Serviços · BeautyFlow" }] }),
  component: ServicesPage,
});

const CATEGORIES = [
  "Sobrancelhas", "Lash", "Cabelo", "Barba", "Massagem",
  "Depilação", "Estética", "Unhas", "Outros",
];

const COLORS = [
  "#EC4899", "#A855F7", "#3B82F6", "#10B981",
  "#F59E0B", "#EF4444", "#6B7280", "#14B8A6",
];

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  price: z.coerce.number().min(0).max(100000),
  duration_minutes: z.coerce.number().int().min(5).max(600),
  return_days: z.coerce.number().int().min(1).max(365),
  category: z.string().optional().or(z.literal("")),
  color: z.string().optional().or(z.literal("")),
  description: z.string().max(500).optional().or(z.literal("")),
});
type FormVals = z.infer<typeof schema>;

function ServicesPage() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const list = useQuery({
    enabled: !!companyId,
    queryKey: ["services", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services").select("*").eq("company_id", companyId!).order("name");
      if (error) throw error;
      return data;
    },
  });

  const metrics = useQuery({
    enabled: !!companyId,
    queryKey: ["service_metrics", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("service_metrics").select("*").eq("company_id", companyId!);
      return data ?? [];
    },
  });

  const top = useMemo(() => {
    const m = metrics.data ?? [];
    const bySold = [...m].sort((a, b) => b.total_completed - a.total_completed)[0];
    const byRev = [...m].sort((a, b) => Number(b.total_revenue) - Number(a.total_revenue))[0];
    const byRec = [...m].sort((a, b) => Number(b.recurrence_ratio) - Number(a.recurrence_ratio))[0];
    return { bySold, byRev, byRec };
  }, [metrics.data]);

  function openCreate() { setEditing(null); setOpen(true); }
  function openEdit(s: any) { setEditing(s); setOpen(true); }

  async function duplicateService(s: any) {
    const { error } = await supabase.from("services").insert({
      company_id: companyId,
      name: `${s.name} (cópia)`,
      price: s.price, duration_minutes: s.duration_minutes, return_days: s.return_days,
      category: s.category, color: s.color, description: s.description,
    });
    if (error) return toast.error(error.message);
    toast.success("Serviço duplicado");
    qc.invalidateQueries({ queryKey: ["services", companyId] });
  }

  async function removeService(id: string) {
    if (!confirm("Excluir este serviço? Atendimentos passados não serão afetados.")) return;
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Serviço excluído");
    qc.invalidateQueries({ queryKey: ["services", companyId] });
  }

  async function toggleActive(id: string, active: boolean) {
    const { error } = await supabase.from("services").update({ active }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["services", companyId] });
  }

  return (
    <div className="space-y-6 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Serviços</h1>
          <p className="text-sm text-muted-foreground">A base de todo agendamento. O retorno ideal define quando contatar o cliente novamente.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Novo serviço</Button>
      </header>

      {/* Top metrics */}
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={Trophy}     label="Mais vendido"      title={top.bySold?.name} hint={top.bySold ? `${top.bySold.total_completed} atendimentos` : "—"} />
        <MetricCard icon={TrendingUp} label="Maior faturamento" title={top.byRev?.name}  hint={top.byRev ? formatBRL(Number(top.byRev.total_revenue)) : "—"} />
        <MetricCard icon={Repeat}     label="Maior recorrência" title={top.byRec?.name}  hint={top.byRec ? `${Number(top.byRec.recurrence_ratio).toFixed(1)}× por cliente` : "—"} />
      </section>

      <Card className="p-4">
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>
        ) : !list.data?.length ? (
          <div className="py-16 text-center">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
              <Scissors className="h-5 w-5" />
            </div>
            <p className="mt-3 font-medium">Nenhum serviço cadastrado</p>
            <Button className="mt-3" onClick={openCreate}>Criar primeiro serviço</Button>
          </div>
        ) : (
          <ul className="divide-y">
            {list.data.map((s: any) => (
              <li key={s.id} className="py-3 flex items-center gap-3">
                <span className="h-9 w-1.5 rounded-full shrink-0" style={{ background: s.color ?? "hsl(var(--primary))" }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{s.name}</p>
                    {s.category && <Badge variant="secondary" className="text-[10px]">{s.category}</Badge>}
                    {!s.active && <Badge variant="outline" className="text-[10px]">Inativo</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {s.duration_minutes}min · retorno em {s.return_days} dias
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums">{formatBRL(Number(s.price))}</p>
                <Switch checked={s.active} onCheckedChange={(v) => toggleActive(s.id, v)} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(s)}>Editar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => duplicateService(s)}>Duplicar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleActive(s.id, !s.active)}>
                      {s.active ? "Desativar" : "Ativar"}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => removeService(s.id)}>Excluir</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ServiceDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        companyId={companyId}
        onSaved={() => qc.invalidateQueries({ queryKey: ["services", companyId] })}
      />
    </div>
  );
}

function MetricCard({ icon: Icon, label, title, hint }: { icon: any; label: string; title?: string; hint: string }) {
  return (
    <Card className="p-4 shadow-soft">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-primary"><Icon className="h-3.5 w-3.5" /></span>
      </div>
      <p className="mt-2 font-semibold truncate">{title ?? "—"}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

function ServiceDialog({
  open, onOpenChange, editing, companyId, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; editing: any; companyId?: string; onSaved: () => void }) {
  const form = useForm<FormVals>({
    resolver: zodResolver(schema),
    values: editing ? {
      name: editing.name, price: Number(editing.price), duration_minutes: editing.duration_minutes,
      return_days: editing.return_days, category: editing.category ?? "", color: editing.color ?? "",
      description: editing.description ?? "",
    } : { name: "", price: 0, duration_minutes: 60, return_days: 30, category: "", color: COLORS[0], description: "" },
  });

  async function onSubmit(v: FormVals) {
    if (!companyId) return;
    const payload = {
      ...v,
      category: v.category || null,
      color: v.color || null,
      description: v.description || null,
    };
    const op = editing
      ? supabase.from("services").update(payload).eq("id", editing.id)
      : supabase.from("services").insert({ ...payload, company_id: companyId });
    const { error } = await op;
    if (error) return toast.error(error.message);
    toast.success(editing ? "Serviço atualizado" : "Serviço criado");
    onOpenChange(false);
    form.reset();
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Editar serviço" : "Novo serviço"}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input {...form.register("name")} placeholder="Ex: Design de Sobrancelhas" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2"><Label>Preço (R$) *</Label><Input type="number" step="0.01" {...form.register("price")} /></div>
            <div className="space-y-2"><Label>Duração (min) *</Label><Input type="number" {...form.register("duration_minutes")} /></div>
            <div className="space-y-2"><Label>Retorno (dias) *</Label><Input type="number" {...form.register("return_days")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Controller control={form.control} name="category" render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <Controller control={form.control} name="color" render={({ field }) => (
                <div className="flex gap-1.5 pt-1">
                  {COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => field.onChange(c)}
                      className={`h-7 w-7 rounded-full border-2 ${field.value === c ? "border-foreground" : "border-transparent"}`}
                      style={{ background: c }} aria-label={c}/>
                  ))}
                </div>
              )} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea {...form.register("description")} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
