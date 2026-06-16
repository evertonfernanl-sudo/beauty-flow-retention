import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Scissors } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/services")({
  head: () => ({ meta: [{ title: "Serviços · BeautyFlow" }] }),
  component: ServicesPage,
});

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  price: z.coerce.number().min(0).max(100000),
  duration_minutes: z.coerce.number().int().min(5).max(600),
  return_days: z.coerce.number().int().min(1).max(365),
});

function ServicesPage() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const list = useQuery({
    enabled: !!companyId,
    queryKey: ["services", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", price: 0, duration_minutes: 60, return_days: 30 },
  });

  async function onCreate(values: z.infer<typeof schema>) {
    if (!companyId) return;
    const { error } = await supabase.from("services").insert({ ...values, company_id: companyId });
    if (error) { toast.error(error.message); return; }
    toast.success("Serviço criado!");
    form.reset();
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["services", companyId] });
  }

  async function toggleActive(id: string, active: boolean) {
    const { error } = await supabase.from("services").update({ active }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ["services", companyId] });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Serviços</h1>
          <p className="text-sm text-muted-foreground">O retorno é calculado a partir dos dias que você define aqui.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Novo serviço</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo serviço</DialogTitle></DialogHeader>
            <form onSubmit={form.handleSubmit(onCreate)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input id="name" {...form.register("name")} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="price">Preço (R$)</Label>
                  <Input id="price" type="number" step="0.01" {...form.register("price")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration_minutes">Duração (min)</Label>
                  <Input id="duration_minutes" type="number" {...form.register("duration_minutes")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="return_days">Retorno (dias)</Label>
                  <Input id="return_days" type="number" {...form.register("return_days")} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={form.formState.isSubmitting}>Salvar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <Card className="p-4">
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>
        ) : !list.data?.length ? (
          <div className="py-16 text-center">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
              <Scissors className="h-5 w-5" />
            </div>
            <p className="mt-3 font-medium">Nenhum serviço cadastrado</p>
          </div>
        ) : (
          <ul className="divide-y">
            {list.data.map((s) => (
              <li key={s.id} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.duration_minutes}min · retorno em {s.return_days} dias
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-sm font-medium">{formatBRL(Number(s.price))}</p>
                  <Switch checked={s.active} onCheckedChange={(v) => toggleActive(s.id, v)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
