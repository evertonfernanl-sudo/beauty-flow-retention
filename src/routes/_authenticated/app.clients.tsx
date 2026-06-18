import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Users, Cake, ChevronRight } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/clients")({
  head: () => ({ meta: [{ title: "Clientes · BeautyFlow" }] }),
  component: ClientsPage,
});

const clientSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("E-mail inválido").max(255).optional().or(z.literal("")),
  birthday: z.string().optional().or(z.literal("")),
  instagram: z.string().trim().max(60).optional().or(z.literal("")),
  profession: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

type Filter = "ALL" | "ACTIVE" | "INACTIVE" | "LOST" | "RETURN" | "BIRTHDAY";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "ALL", label: "Todos" },
  { id: "ACTIVE", label: "Ativos" },
  { id: "INACTIVE", label: "Inativos" },
  { id: "LOST", label: "Perdidos" },
  { id: "RETURN", label: "Retorno pendente" },
  { id: "BIRTHDAY", label: "Aniversariantes" },
];

function ClientsPage() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  type DupMatch = { id: string; name: string; phone: string | null; confidence: number; reason: string };
  const [duplicate, setDuplicate] = useState<{ match: DupMatch; values: z.infer<typeof clientSchema> } | null>(null);

  const list = useQuery({
    enabled: !!companyId,
    queryKey: ["clients", companyId, search, filter],
    queryFn: async () => {
      let q = supabase
        .from("clients")
        .select("*")
        .eq("company_id", companyId!)
        .order("name");
      const s = search.trim();
      if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`);
      if (filter === "ACTIVE") q = q.eq("status", "ACTIVE");
      if (filter === "INACTIVE") q = q.eq("status", "INACTIVE");
      if (filter === "LOST") q = q.eq("status", "LOST");
      if (filter === "RETURN") q = q.not("next_return", "is", null);
      if (filter === "BIRTHDAY") {
        const month = new Date().getMonth() + 1;
        q = q.not("birthday", "is", null);
        // filter month client-side below
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []).filter((c) => c.birthday && new Date(c.birthday).getMonth() + 1 === month);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const form = useForm<z.infer<typeof clientSchema>>({
    resolver: zodResolver(clientSchema),
    defaultValues: { name: "", phone: "", email: "", birthday: "", instagram: "", profession: "", notes: "" },
  });

  async function onCreate(values: z.infer<typeof clientSchema>) {
    if (!companyId) return;
    const { error } = await supabase.from("clients").insert({
      company_id: companyId,
      name: values.name,
      phone: values.phone || null,
      email: values.email || null,
      birthday: values.birthday || null,
      instagram: values.instagram || null,
      profession: values.profession || null,
      notes: values.notes || null,
    });
    if (error) {
      if (error.code === "23505") toast.error("Já existe uma cliente com esse telefone.");
      else toast.error(error.message);
      return;
    }
    toast.success("Cliente cadastrada!");
    form.reset();
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["clients", companyId] });
  }

  const counts = useMemo(() => {
    const d = list.data ?? [];
    return {
      total: d.length,
    };
  }, [list.data]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">{counts.total} cliente(s) — o coração do seu negócio.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nova cliente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova cliente</DialogTitle></DialogHeader>
            <form onSubmit={form.handleSubmit(onCreate)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input id="name" {...form.register("name")} autoFocus />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="phone">WhatsApp *</Label>
                  <Input id="phone" placeholder="(11) 99999-9999" {...form.register("phone")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="birthday">Aniversário</Label>
                  <Input id="birthday" type="date" {...form.register("birthday")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="instagram">Instagram</Label>
                  <Input id="instagram" placeholder="@usuario" {...form.register("instagram")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profession">Profissão</Label>
                  <Input id="profession" {...form.register("profession")} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" {...form.register("email")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" rows={3} {...form.register("notes")} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={form.formState.isSubmitting}>Salvar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <Card className="p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`text-xs rounded-full px-3 py-1.5 border transition ${
                filter === f.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted border-border text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {list.isLoading ? (
          <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>
        ) : !list.data?.length ? (
          <div className="py-16 text-center">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
              <Users className="h-5 w-5" />
            </div>
            <p className="mt-3 font-medium">Nenhuma cliente encontrada.</p>
            <p className="text-sm text-muted-foreground">Ajuste a busca ou cadastre uma nova.</p>
          </div>
        ) : (
          <ul className="divide-y -mx-4">
            {list.data.map((c: any) => {
              const isBirthdayMonth = c.birthday && new Date(c.birthday).getMonth() === new Date().getMonth();
              return (
                <li key={c.id}>
                  <Link
                    to="/app/clients/$clientId"
                    params={{ clientId: c.id }}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{c.name}</p>
                        <StatusBadge status={c.status} />
                        {isBirthdayMonth && (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <Cake className="h-3 w-3" /> Aniversariante
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.phone ?? "—"} · {c.appointments_count} atend. ·{" "}
                        {c.last_visit ? `última ${new Date(c.last_visit).toLocaleDateString("pt-BR")}` : "sem atendimentos"}
                      </p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-medium">{formatBRL(Number(c.total_spent))}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.next_return ? `retorno: ${new Date(c.next_return).toLocaleDateString("pt-BR")}` : "—"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ACTIVE: { label: "Ativa", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
    INACTIVE: { label: "Inativa", cls: "bg-muted text-muted-foreground" },
    LOST: { label: "Perdida", cls: "bg-destructive/15 text-destructive" },
  };
  const m = map[status] ?? map.ACTIVE;
  return <span className={`text-[10px] rounded-full px-2 py-0.5 ${m.cls}`}>{m.label}</span>;
}
