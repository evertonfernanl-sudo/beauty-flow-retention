import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { mergeClientsServer } from "@/lib/api/clients.functions";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  Users,
  Cake,
  ChevronRight,
  MoreVertical,
  Pencil,
  Trash2,
  Heart,
  RefreshCw,
  Check,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { Checkbox } from "@/components/ui/checkbox";
import { whatsappLink } from "@/lib/phone";
import { ComunicacaoPage } from "./app.comunicacao";
import { MensageriaPage } from "./app.mensageria";
import {
  Clock,
  AlertCircle,
  TrendingDown,
  Send,
  Calendar,
  Copy,
  MessageCircle,
  Sparkles,
} from "lucide-react";

const clientsSearchSchema = z.object({
  tab: z.enum(["cadastro", "retorno", "comunicacao", "mensageria"]).optional(),
  filter: z.string().optional(),
  new: z.boolean().optional(),
});

export const Route = createFileRoute("/_authenticated/app/clients")({
  validateSearch: (search) => clientsSearchSchema.parse(search),
  head: () => ({ meta: [{ title: "Clientes · BeautyFlow" }] }),
  component: ClientsPage,
});

const clientSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  phone2: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("E-mail inválido").max(255).optional().or(z.literal("")),
  birthday: z.string().optional().or(z.literal("")),
  instagram: z.string().trim().max(60).optional().or(z.literal("")),
  profession: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

type Filter = "ALL" | "ACTIVE" | "INACTIVE" | "LOST" | "RETURN" | "BIRTHDAY" | "AT_RISK";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "ALL", label: "Todos" },
  { id: "ACTIVE", label: "Ativos" },
  { id: "RETURN", label: "Retorno pendente" },
  { id: "AT_RISK", label: "Em risco" },
  { id: "LOST", label: "Perdidos" },
  { id: "INACTIVE", label: "Inativos" },
  { id: "BIRTHDAY", label: "Aniversariantes" },
];

function formatShortName(fullName: string): string {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName;
  return `${parts[0]} ${parts[1]}`;
}

function ClientsPage() {
  const { data: profile } = useCurrentProfile();
  const companyId = profile?.company?.id;
  const canManage = profile?.role === "owner" || profile?.role === "admin";
  const queryClient = useQueryClient();
  const searchParams = Route.useSearch();
  
  const [search, setSearch] = useState("");
  const [mainTab, setMainTab] = useState<"oportunidades" | "comunicacao" | "mensageria">(() => {
    if (searchParams.tab === "comunicacao") return "comunicacao";
    if (searchParams.tab === "mensageria") return "mensageria";
    return "oportunidades";
  });

  const [activeTab, setActiveTab] = useState(searchParams.tab || "cadastro");
  const [filter, setFilter] = useState<Filter>((searchParams.filter as Filter) || "ALL");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [mergingSource, setMergingSource] = useState<any | null>(null);
  const navigate = useNavigate();

  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (searchParams.new) {
      setOpen(true);
      navigate({
        search: (prev: any) => {
          const copy = { ...prev };
          delete copy.new;
          return copy;
        },
        replace: true,
      });
    }
  }, [searchParams.new, navigate]);

  useEffect(() => {
    if (searchParams.tab) {
      setActiveTab(searchParams.tab);
      if (searchParams.tab === "comunicacao") setMainTab("comunicacao");
      else if (searchParams.tab === "mensageria") setMainTab("mensageria");
      else setMainTab("oportunidades");
    }
  }, [searchParams.tab]);

  useEffect(() => {
    if (searchParams.filter) {
      setFilter(searchParams.filter as Filter);
    }
  }, [searchParams.filter]);

  useEffect(() => {
    setSelected(new Set());
  }, [filter, search]);

  useEffect(() => {
    if (!companyId) return;
    supabase.rpc("refresh_return_opportunities").then(() =>
      supabase.rpc("refresh_recovery_opportunities", { _company: companyId }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["clients", companyId] });
      })
    );
  }, [companyId, queryClient]);

  type DupMatch = {
    id: string;
    name: string;
    phone: string | null;
    confidence: number;
    reason: string;
  };
  const [duplicate, setDuplicate] = useState<{
    match: DupMatch;
    values: z.infer<typeof clientSchema>;
  } | null>(null);

  const [historyClient, setHistoryClient] = useState<any | null>(null);

  const historyQ = useQuery({
    enabled: !!companyId && !!historyClient,
    queryKey: ["client-history", historyClient?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, start_datetime, status, price, notes, services(name)")
        .eq("client_id", historyClient!.id)
        .eq("company_id", companyId!)
        .order("start_datetime", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const list = useQuery({
    enabled: !!companyId,
    queryKey: ["clients", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(`
          *,
          recovery_opportunities(
            id,
            classification,
            status,
            expected_return_date,
            potential_value,
            days_late,
            services(name)
          )
        `)
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Clients with a future SCHEDULED appointment — excluded from all retention buckets.
  const scheduledQ = useQuery({
    enabled: !!companyId,
    queryKey: ["scheduled-clients", companyId],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("appointments")
        .select("client_id")
        .eq("company_id", companyId!)
        .eq("status", "SCHEDULED")
        .gte("start_datetime", nowIso);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.client_id).filter(Boolean));
    },
  });

  // Ticket médio: completed appointments in current month / count
  const ticketQ = useQuery({
    enabled: !!companyId,
    queryKey: ["ticket-month", companyId],
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      const { data, error } = await supabase
        .from("appointments")
        .select("price")
        .eq("company_id", companyId!)
        .eq("status", "COMPLETED")
        .gte("start_datetime", start)
        .lt("start_datetime", end);
      if (error) throw error;
      const rows = data ?? [];
      const sum = rows.reduce((acc: number, r: any) => acc + Number(r.price || 0), 0);
      return { sum, count: rows.length, avg: rows.length > 0 ? sum / rows.length : 0 };
    },
  });

  const clientsWithOpp = useMemo(() => {
    const scheduledSet = scheduledQ.data ?? new Set<string>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (list.data ?? []).map((c: any) => {
      const activeOpps = (c.recovery_opportunities ?? [])
        .filter((o: any) => o.status === "OPEN" || o.status === "IN_CONTACT")
        .sort((a: any, b: any) => {
          const da = a.expected_return_date ? new Date(a.expected_return_date).getTime() : 0;
          const db = b.expected_return_date ? new Date(b.expected_return_date).getTime() : 0;
          return db - da; // latest first
        });
      const lastOpp = activeOpps[0];
      const hasScheduled = scheduledSet.has(c.id);
      // Fonte única (mesma usada pela coluna "Próxima Ação" da tabela):
      // prioriza a oportunidade ativa mais recente; se não houver, usa clients.next_return.
      const nextActionRaw = lastOpp?.expected_return_date ?? c.next_return ?? null;
      let daysLate = 0;
      if (nextActionRaw) {
        const exp = new Date(nextActionRaw);
        exp.setHours(0, 0, 0, 0);
        daysLate = Math.floor((today.getTime() - exp.getTime()) / 86400000);
      }
      const isPending = !hasScheduled && !!nextActionRaw && daysLate > 0;
      // Buckets disjuntos: cliente pertence a apenas uma categoria por vez.
      const isAtRisk = isPending && daysLate > 10 && daysLate <= 30;
      const isLost = isPending && daysLate > 30 && daysLate <= 60;
      const isInactive = isPending && daysLate > 60;
      return {
        ...c,
        activeOpps,
        lastOpp,
        hasScheduled,
        nextActionDate: nextActionRaw,
        daysLate,
        isPending,
        isAtRisk,
        isLost,
        isInactive,
      };
    });
  }, [list.data, scheduledQ.data]);

  const stats = useMemo(() => {
    const pending = clientsWithOpp.filter((c) => c.isPending);
    const atRisk = clientsWithOpp.filter((c) => c.isAtRisk);
    const sumPotential = (rows: any[]) =>
      rows.reduce((acc, c) => {
        const v = Number(c.lastOpp?.potential_value || 0);
        if (v > 0) return acc + v;
        const ticket = c.appointments_count > 0 ? Number(c.total_spent || 0) / c.appointments_count : 0;
        return acc + ticket;
      }, 0);
    return {
      opportunitiesCount: pending.length,
      recoveredValue: sumPotential(pending),
      atRiskValue: sumPotential(atRisk),
      ticketAverage: ticketQ.data?.avg ?? 0,
    };
  }, [clientsWithOpp, ticketQ.data]);

  const searched = useMemo(() => {
    const s = search.trim().toLowerCase();
    const rows = clientsWithOpp;
    if (!s) return rows;
    return rows.filter(
      (c) =>
        c.name?.toLowerCase().includes(s) ||
        c.phone?.toLowerCase().includes(s) ||
        c.email?.toLowerCase().includes(s)
    );
  }, [clientsWithOpp, search]);

  const filtered = useMemo(() => {
    return searched.filter((c) => {
      if (filter === "ALL") return true;
      if (filter === "ACTIVE") return c.status === "ACTIVE";
      if (filter === "RETURN") return c.isPending;
      if (filter === "AT_RISK") return c.isAtRisk;
      if (filter === "LOST") return c.isLost;
      if (filter === "INACTIVE") return c.isInactive;
      if (filter === "BIRTHDAY") {
        const month = new Date().getMonth() + 1;
        return c.birthday && new Date(c.birthday).getMonth() + 1 === month;
      }
      return true;
    });
  }, [searched, filter]);

  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c.id)));
    }
  }

  const waTemplate =
    profile?.company?.whatsapp_template ?? "Olá {{nome}}! Vamos marcar seu próximo horário?";

  function bulkOpen() {
    const rows = filtered.filter((c) => selected.has(c.id) && c.phone);
    if (rows.length === 0) {
      toast.error("Selecione clientes com WhatsApp.");
      return;
    }
    const link = profile?.company?.slug
      ? `${window.location.origin}/agendar/${profile.company.slug}`
      : "";
    let opened = 0;
    for (const c of rows) {
      let msg = waTemplate
        .replace(/\{\{\s*(nome|primeiro_nome)\s*\}\}/gi, c.name.split(" ")[0])
        .replace(/\{\{\s*cliente\s*\}\}/gi, c.name)
        .replace(/\{\{\s*empresa\s*\}\}/gi, profile?.company?.name ?? "");

      if (link) {
        if (msg.includes("{{link_agendamento}}")) {
          msg = msg.replace(/\{\{\s*link_agendamento\s*\}\}/gi, link);
        } else if (msg.includes("{{link}}")) {
          msg = msg.replace(/\{\{\s*link\s*\}\}/gi, link);
        } else {
          msg = msg + `\n\nAgende seu horário aqui: ${link}`;
        }
      }

      const url = whatsappLink(c.phone, msg);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        opened++;
      }
    }
    toast.success(`${opened} conversa(s) aberta(s) no WhatsApp`);
  }

  const counts = useMemo(() => {
    return {
      total: clientsWithOpp.length,
    };
  }, [clientsWithOpp]);

  const form = useForm<z.infer<typeof clientSchema>>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: "",
      phone: "",
      phone2: "",
      email: "",
      birthday: "",
      instagram: "",
      profession: "",
      notes: "",
    },
  });

  async function onCreate(values: z.infer<typeof clientSchema>) {
    if (!companyId) return;
    // Anti-duplicação: telefone exato OU nome similar (>=70%)
    if (values.phone || values.name) {
      const { data: dup } = await supabase.rpc("find_duplicate_client", {
        _company_id: companyId,
        _name: values.name,
        _phone: values.phone || "",
        _threshold: 0.7,
      });
      const match =
        Array.isArray(dup) && dup.length
          ? (dup[0] as {
              id: string;
              name: string;
              phone: string | null;
              confidence: number;
              reason: string;
            })
          : null;
      if (match) {
        setDuplicate({ match: { ...match, phone: match.phone ?? null }, values });
        return;
      }
    }
    await persistClient(values);
  }

  async function persistClient(values: z.infer<typeof clientSchema>) {
    if (!companyId) return;
    const { error } = await supabase.from("clients").insert({
      company_id: companyId,
      name: values.name,
      phone: values.phone || null,
      phone2: values.phone2 || null,
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
    setDuplicate(null);
    queryClient.invalidateQueries({ queryKey: ["clients", companyId] });
  }

  return (
    <div className="grid lg:grid-cols-[240px_1fr] gap-8 items-start">
      {/* Side Panel / Navigation Panel */}
      <aside className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-x-visible gap-1 pb-4 lg:pb-0 border-b lg:border-b-0 lg:border-r border-border lg:pr-6 shrink-0 lg:sticky lg:top-20">
        <div className="hidden lg:block mb-4 px-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Central de Comunicação
          </p>
        </div>

        <Button
          variant={mainTab === "oportunidades" ? "secondary" : "ghost"}
          className={`justify-start gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors w-auto lg:w-full shrink-0 ${
            mainTab === "oportunidades"
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
              : "text-muted-foreground hover:bg-muted/50"
          }`}
          onClick={() => {
            setMainTab("oportunidades");
            navigate({ search: { tab: "cadastro", filter: "ALL" } as any });
          }}
        >
          <Users
            className={`h-4 w-4 shrink-0 ${mainTab === "oportunidades" ? "text-primary" : ""}`}
          />
          <span>Ações de hoje</span>
        </Button>

        <Button
          variant={mainTab === "comunicacao" ? "secondary" : "ghost"}
          className={`justify-start gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors w-auto lg:w-full shrink-0 ${
            mainTab === "comunicacao"
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
              : "text-muted-foreground hover:bg-muted/50"
          }`}
          onClick={() => {
            setMainTab("comunicacao");
            navigate({ search: { tab: "comunicacao" } as any });
          }}
        >
          <MessageCircle
            className={`h-4 w-4 shrink-0 ${mainTab === "comunicacao" ? "text-primary" : ""}`}
          />
          <span>Comunicação</span>
        </Button>

        <Button
          variant={mainTab === "mensageria" ? "secondary" : "ghost"}
          className={`justify-start gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors w-auto lg:w-full shrink-0 ${
            mainTab === "mensageria"
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
              : "text-muted-foreground hover:bg-muted/50"
          }`}
          onClick={() => {
            setMainTab("mensageria");
            navigate({ search: { tab: "mensageria" } as any });
          }}
        >
          <Send className={`h-4 w-4 shrink-0 ${mainTab === "mensageria" ? "text-primary" : ""}`} />
          <span>Mensageria (MIE)</span>
        </Button>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        {mainTab === "oportunidades" && (
          <div className="space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Clientes & Recorrência</h1>
                <p className="text-sm text-muted-foreground">
                  {counts.total} cliente(s) cadastrados — o coração do seu negócio.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-1" /> Nova cliente
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nova cliente</DialogTitle>
                    </DialogHeader>
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
                          <Label htmlFor="phone2">Telefone 2</Label>
                          <Input id="phone2" placeholder="(11) 99999-9999" {...form.register("phone2")} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="birthday">Aniversário</Label>
                          <Input id="birthday" type="date" {...form.register("birthday")} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="instagram">Instagram</Label>
                          <Input id="instagram" placeholder="@usuario" {...form.register("instagram")} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="profession">Profissão</Label>
                          <Input id="profession" {...form.register("profession")} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="email">E-mail</Label>
                          <Input id="email" type="email" {...form.register("email")} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="notes">Observações</Label>
                        <Textarea id="notes" rows={3} {...form.register("notes")} />
                      </div>
                      <DialogFooter>
                        <Button type="submit" disabled={form.formState.isSubmitting}>
                          Salvar
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>

                <Button variant="outline" asChild>
                  <Link to="/app/agenda" search={{ newAppt: true }}>
                    <Calendar className="h-4 w-4 mr-1" /> Agendar
                  </Link>
                </Button>
              </div>
            </header>

            {companyId && profile?.company?.slug && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-muted/40 rounded-xl border border-primary/10 shadow-soft max-w-2xl">
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">
                    Seu Link Público de Agendamento
                  </h4>
                  <div className="flex items-center gap-2">
                    <code className="text-xs select-all bg-background border px-3 py-1.5 rounded-lg truncate flex-1 font-mono text-muted-foreground">
                      {`${window.location.origin}/agendar/${profile.company.slug}`}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shadow-sm flex-shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${window.location.origin}/agendar/${profile.company!.slug!}`,
                        );
                        toast.success("Link copiado com sucesso");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copiar
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card
                className="p-4 shadow-soft hover:bg-muted/10 transition cursor-pointer"
                onClick={() => setFilter("RETURN")}
              >
                <div className="flex items-center justify-between text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
                  <span>OPORTUNIDADES</span>
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-secondary text-primary">
                    <Users className="h-3.5 w-3.5" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold">{list.isLoading ? "—" : stats.opportunitiesCount}</p>
              </Card>

              <Card
                className="p-4 shadow-soft hover:bg-muted/10 transition cursor-pointer"
                onClick={() => setFilter("RETURN")}
              >
                <div className="flex items-center justify-between text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
                  <span>RECEITA RECUPERÁVEL</span>
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-secondary text-primary">
                    <TrendingDown className="h-3.5 w-3.5" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold text-emerald-600">{list.isLoading ? "—" : formatBRL(stats.recoveredValue)}</p>
              </Card>

              <Card
                className="p-4 shadow-soft hover:bg-muted/10 transition cursor-pointer"
                onClick={() => setFilter("AT_RISK")}
              >
                <div className="flex items-center justify-between text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
                  <span>RECEITA EM RISCO</span>
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-secondary text-primary">
                    <AlertCircle className="h-3.5 w-3.5" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold text-destructive">{list.isLoading ? "—" : formatBRL(stats.atRiskValue)}</p>
              </Card>

              <Card
                className="p-4 shadow-soft hover:bg-muted/10 transition cursor-pointer"
                onClick={() => setFilter("RETURN")}
              >
                <div className="flex items-center justify-between text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
                  <span>TICKET MÉDIO</span>
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-secondary text-primary">
                    <Clock className="h-3.5 w-3.5" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold">{list.isLoading ? "—" : formatBRL(stats.ticketAverage)}</p>
              </Card>
            </div>

            <Card className="p-4 space-y-4 shadow-soft">
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

              {/* Bulk Actions Bar */}
              {filtered.length > 0 && (
                <div className="flex items-center justify-between gap-3 border-b pb-3 pt-1">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    Selecionar todos na listagem ({filtered.length})
                  </label>
                  <Button size="sm" onClick={bulkOpen} disabled={selected.size === 0}>
                    <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
                    Enviar WhatsApp para {selected.size} selecionado{selected.size === 1 ? "" : "s"}
                  </Button>
                </div>
              )}

              {list.isLoading ? (
                <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
                    <Users className="h-5 w-5" />
                  </div>
                  <p className="mt-3 font-medium">Nenhuma cliente encontrada.</p>
                  <p className="text-sm text-muted-foreground">Ajuste a busca ou aplique outro filtro.</p>
                </div>
              ) : (
                <div className="overflow-x-scroll overflow-y-auto -mx-4 lg:mx-0 border-t border-b max-h-[calc(100vh-360px)]">
                  <div className="min-w-[1100px] divide-y">

                    {/* Header */}
                    <div className="hidden lg:grid grid-cols-[30px_220px_1.2fr_1.2fr_1.2fr_1fr_1fr_1fr_1.2fr_1.2fr] gap-4 px-4 py-3 text-xs font-semibold text-muted-foreground bg-muted/20 items-center sticky top-0 z-10">
                      <div className="w-5 sticky left-0 bg-muted/20 z-20"></div>
                      <div className="sticky left-[30px] bg-muted/20 z-20 pl-3 -ml-3 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">Nome</div>
                      <div>Telefone</div>
                      <div>Último Atend.</div>
                      <div>Serviço Realizado</div>
                      <div>Valor</div>
                      <div>Sem Retorno</div>
                      <div>Status</div>
                      <div>Próxima Ação</div>
                      <div className="text-right">Ações</div>
                    </div>

                    {/* List Items */}
                    <ul className="divide-y">
                      {filtered.map((c: any, index: number) => {
                        const isBirthdayMonth =
                          c.birthday && new Date(c.birthday).getMonth() === new Date().getMonth();
                        const daysSince = c.last_visit
                          ? Math.floor((Date.now() - new Date(c.last_visit).getTime()) / 86400000)
                          : null;
                        const serviceName = c.lastOpp?.services?.name ?? "—";
                        const valueToDisplay = c.lastOpp
                          ? Number(c.lastOpp.potential_value || 0)
                          : (c.appointments_count > 0 ? Number(c.total_spent || 0) / c.appointments_count : 0);
                        const nextActionDate = c.lastOpp?.expected_return_date
                          ? new Date(c.lastOpp.expected_return_date).toLocaleDateString("pt-BR")
                          : (c.next_return ? new Date(c.next_return).toLocaleDateString("pt-BR") : "—");
                        const link = profile?.company?.slug
                          ? `${window.location.origin}/agendar/${profile.company.slug}`
                          : "";
                        const waMsg = waTemplate
                          .replace(/\{\{\s*(nome|primeiro_nome)\s*\}\}/gi, c.name.split(" ")[0])
                          .replace(/\{\{\s*cliente\s*\}\}/gi, c.name)
                          .replace(/\{\{\s*empresa\s*\}\}/gi, profile?.company?.name ?? "")
                          .replace(/\{\{\s*link_agendamento\s*\}\}/gi, link)
                          .replace(/\{\{\s*link\s*\}\}/gi, link);
                        const individualWa = whatsappLink(c.phone, waMsg);

                        return (
                          <li key={c.id} className="group grid grid-cols-[30px_220px_1.2fr_1.2fr_1.2fr_1fr_1fr_1fr_1.2fr_1.2fr] gap-4 px-4 py-3 transition items-center text-sm bg-card hover:bg-muted/40">
                            <div className="sticky left-0 z-10 bg-card group-hover:bg-muted/40">
                              <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                            </div>
                            <div className="min-w-0 sticky left-[30px] z-10 bg-card group-hover:bg-muted/40 pl-3 -ml-3 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-muted-foreground font-mono text-xs mr-1 shrink-0 select-none">
                                  {index + 1}.
                                </span>
                                <span
                                  className="font-medium hover:underline cursor-pointer text-primary truncate block"
                                  title={c.name}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setHistoryClient(c);
                                  }}
                                >
                                  {formatShortName(c.name)}
                                </span>
                                {isBirthdayMonth && (
                                  <Badge variant="outline" className="gap-1 text-[9px] py-0 px-1 leading-none h-4 shrink-0">
                                    <Cake className="h-2.5 w-2.5" /> Aniv.
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-muted-foreground truncate">{c.phone ?? "—"}</div>
                            <div className="text-muted-foreground truncate">
                              {c.last_visit ? new Date(c.last_visit).toLocaleDateString("pt-BR") : "sem atend."}
                            </div>
                            <div className="truncate font-medium text-muted-foreground">{serviceName}</div>
                            <div className="font-medium tabular-nums text-muted-foreground">{formatBRL(valueToDisplay)}</div>
                            <div className="text-muted-foreground font-medium">{daysSince !== null ? `${daysSince}d` : "—"}</div>
                            <div>
                              <StatusBadge status={c.status} />
                            </div>
                            <div className="text-muted-foreground truncate">{nextActionDate}</div>
                            <div className="flex items-center justify-end gap-1">
                              {individualWa ? (
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-500/10" asChild>
                                  <a href={individualWa} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
                                    <MessageCircle className="h-4 w-4" />
                                  </a>
                                </Button>
                              ) : (
                                <span className="w-8" />
                              )}
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/5" asChild>
                                <Link to="/app/agenda" search={{ newAppt: true, clientId: c.id }} aria-label="Agendar">
                                  <Calendar className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => setHistoryClient(c)} aria-label="Ver Histórico">
                                <Clock className="h-4 w-4" />
                              </Button>
                              {canManage && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      aria-label="Ações"
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onSelect={() => setEditing(c)}>
                                      <Pencil className="h-4 w-4 mr-2" /> Editar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setMergingSource(c)}>
                                      <RefreshCw className="h-4 w-4 mr-2" /> Mesclar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() => setDeleting(c)}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" /> Excluir
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>

              )}
            </Card>
          </div>
        )}

        {mainTab === "comunicacao" && <ComunicacaoPage />}
        {mainTab === "mensageria" && <MensageriaPage />}
      </div>

      <AlertDialog
        open={!!duplicate}
        onOpenChange={(o) => {
          if (!o) setDuplicate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cliente já existe?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Encontramos um cadastro parecido por{" "}
                  <strong>{duplicate?.match.reason === "phone" ? "telefone" : "nome"}</strong>
                  {duplicate ? ` (${duplicate.match.confidence}% de confiança)` : ""}:
                </p>
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  <div className="font-medium text-foreground">{duplicate?.match.name}</div>
                  {duplicate?.match.phone && (
                    <div className="text-muted-foreground">{duplicate.match.phone}</div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Use o cadastro existente para evitar histórico duplicado.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => setDuplicate(null)}>Cancelar</AlertDialogCancel>
            <Button
              variant="secondary"
              onClick={() => duplicate && persistClient(duplicate.values)}
            >
              Criar mesmo assim
            </Button>
            <AlertDialogAction
              onClick={() => {
                if (!duplicate) return;
                const id = duplicate.match.id;
                setDuplicate(null);
                setOpen(false);
                navigate({ to: "/app/clients/$clientId", params: { clientId: id } });
              }}
            >
              Usar cadastro existente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditClientDialog
        client={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          queryClient.invalidateQueries({ queryKey: ["clients", companyId] });
        }}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleting?.name}</strong>? Esta ação não pode
              ser desfeita e removerá todo o histórico associado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                const { error } = await supabase.from("clients").delete().eq("id", deleting.id);
                if (error) {
                  toast.error(error.message);
                  return;
                }
                toast.success("Cliente excluída");
                setDeleting(null);
                queryClient.invalidateQueries({ queryKey: ["clients", companyId] });
              }}
            >
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!historyClient}
        onOpenChange={(o) => {
          if (!o) setHistoryClient(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Histórico de Atendimentos</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Cliente: <strong className="text-foreground">{historyClient?.name}</strong>
            </p>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto py-2 pr-1 space-y-3">
            {historyQ.isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center animate-pulse">
                Carregando histórico...
              </p>
            ) : !historyQ.data?.length ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Nenhum atendimento encontrado para esta cliente.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {historyQ.data.map((a: any) => (
                  <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-left w-14 shrink-0">
                        <p className="text-xs font-semibold">
                          {new Date(a.start_datetime).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(a.start_datetime).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{a.services?.name ?? "Serviço não especificado"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {a.notes ? a.notes : formatBRL(Number(a.price))}
                        </p>
                      </div>
                    </div>
                    <AppointmentStatusPill status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <MergeClientsDialog
        sourceClient={mergingSource}
        clients={list.data || []}
        onClose={() => setMergingSource(null)}
        onMerged={() => {
          setMergingSource(null);
          queryClient.invalidateQueries({ queryKey: ["clients", companyId] });
        }}
      />
    </div>
  );
}

function EditClientDialog({
  client,
  onClose,
  onSaved,
}: {
  client: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm<z.infer<typeof clientSchema>>({
    resolver: zodResolver(clientSchema),
    values: client
      ? {
          name: client.name ?? "",
          phone: client.phone ?? "",
          phone2: client.phone2 ?? "",
          email: client.email ?? "",
          birthday: client.birthday ?? "",
          instagram: client.instagram ?? "",
          profession: client.profession ?? "",
          notes: client.notes ?? "",
        }
      : {
          name: "",
          phone: "",
          phone2: "",
          email: "",
          birthday: "",
          instagram: "",
          profession: "",
          notes: "",
        },
  });

  async function onSave(v: z.infer<typeof clientSchema>) {
    if (!client) return;
    const { error } = await supabase
      .from("clients")
      .update({
        name: v.name,
        phone: v.phone || null,
        phone2: v.phone2 || null,
        email: v.email || null,
        birthday: v.birthday || null,
        instagram: v.instagram || null,
        profession: v.profession || null,
        notes: v.notes || null,
      })
      .eq("id", client.id);
    if (error) {
      if (error.code === "23505") toast.error("Telefone já cadastrado em outra cliente.");
      else toast.error(error.message);
      return;
    }
    toast.success("Cliente atualizada");
    onSaved();
  }

  return (
    <Dialog
      open={!!client}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Nome *</Label>
            <Input id="edit-name" {...form.register("name")} autoFocus />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-phone">WhatsApp</Label>
              <Input id="edit-phone" placeholder="(11) 99999-9999" {...form.register("phone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone2">Telefone 2</Label>
              <Input id="edit-phone2" placeholder="(11) 99999-9999" {...form.register("phone2")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-birthday">Aniversário</Label>
              <Input id="edit-birthday" type="date" {...form.register("birthday")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-instagram">Instagram</Label>
              <Input id="edit-instagram" placeholder="@usuario" {...form.register("instagram")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-profession">Profissão</Label>
              <Input id="edit-profession" {...form.register("profession")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">E-mail</Label>
              <Input id="edit-email" type="email" {...form.register("email")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-notes">Observações</Label>
            <Textarea id="edit-notes" rows={3} {...form.register("notes")} />
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ACTIVE: {
      label: "Ativa",
      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    },
    INACTIVE: { label: "Inativa", cls: "bg-muted text-muted-foreground" },
    LOST: { label: "Perdida", cls: "bg-destructive/15 text-destructive" },
  };
  const m = map[status] ?? map.ACTIVE;
  return <span className={`text-[10px] rounded-full px-2 py-0.5 ${m.cls}`}>{m.label}</span>;
}

function AppointmentStatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    SCHEDULED: {
      label: "Agendado",
      cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    },
    CONFIRMED: {
      label: "Confirmado",
      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    },
    COMPLETED: { label: "Concluído", cls: "bg-primary/15 text-primary" },
    CANCELLED: { label: "Cancelado", cls: "bg-destructive/15 text-destructive" },
    NO_SHOW: {
      label: "Faltou",
      cls: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    },
  };
  const m = map[status] ?? map.SCHEDULED;
  return <span className={`text-[10px] rounded-full px-2 py-0.5 ${m.cls}`}>{m.label}</span>;
}

interface MergeClientsDialogProps {
  sourceClient: any | null;
  clients: any[];
  onClose: () => void;
  onMerged: () => void;
}

function MergeClientsDialog({ sourceClient, clients, onClose, onMerged }: MergeClientsDialogProps) {
  const [search, setSearch] = useState("");
  const [targetClient, setTargetClient] = useState<any | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const merge = useServerFn(mergeClientsServer);

  useEffect(() => {
    if (sourceClient) {
      setSearch("");
      setTargetClient(null);
      setIsMerging(false);
    }
  }, [sourceClient]);

  const availableClients = useMemo(() => {
    if (!sourceClient) return [];
    return clients.filter((c) => c.id !== sourceClient.id);
  }, [clients, sourceClient]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return [];
    return availableClients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(s) ||
          (c.phone && c.phone.toLowerCase().includes(s))
      )
      .slice(0, 5);
  }, [availableClients, search]);

  const getClientOrderNumber = (clientId: string) => {
    const idx = clients.findIndex((c) => c.id === clientId);
    return idx !== -1 ? idx + 1 : "";
  };

  async function handleMerge() {
    if (!sourceClient || !targetClient) return;
    setIsMerging(true);
    try {
      await merge({
        data: {
          sourceId: sourceClient.id,
          targetId: targetClient.id,
        },
      });
      toast.success("Clientes mesclados com sucesso!");
      onMerged();
    } catch (err: any) {
      toast.error("Erro ao mesclar clientes: " + (err.message || err));
    } finally {
      setIsMerging(false);
    }
  }

  return (
    <Dialog
      open={!!sourceClient}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mesclar Ficha de Cliente</DialogTitle>
          <div className="text-sm text-muted-foreground space-y-2 mt-2">
            <p>
              Você está mesclando a ficha de <strong className="text-foreground">#{getClientOrderNumber(sourceClient?.id)} {sourceClient?.name}</strong>.
            </p>
            <p>
              Esta ação moverá todos os agendamentos, mensagens, histórico de faturamento e outras relações para o cliente de destino, e depois <span className="text-destructive font-semibold">excluirá definitivamente</span> o cadastro de <strong className="text-foreground">#{getClientOrderNumber(sourceClient?.id)} {sourceClient?.name}</strong>.
            </p>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="search-target">Buscar cliente de destino (que será mantido)</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="search-target"
                placeholder="Digite o nome ou WhatsApp..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={isMerging}
              />
            </div>
          </div>

          {search && filtered.length > 0 && (
            <div className="border rounded-md divide-y max-h-40 overflow-y-auto bg-popover text-popover-foreground">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-muted transition-colors ${
                    targetClient?.id === c.id ? "bg-muted font-medium" : ""
                  }`}
                  onClick={() => setTargetClient(c)}
                  disabled={isMerging}
                >
                  <div>
                    <div>{getClientOrderNumber(c.id)}. {c.name}</div>
                    {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                  </div>
                  {targetClient?.id === c.id && (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}

          {search && filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Nenhum cliente encontrado.
            </p>
          )}

          {targetClient && (
            <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 space-y-1">
              <span className="text-xs font-semibold text-primary uppercase tracking-wider block">
                Destino Selecionado (Será Mantido)
              </span>
              <div className="font-medium text-sm">#{getClientOrderNumber(targetClient.id)} {targetClient.name}</div>
              {targetClient.phone && (
                <div className="text-xs text-muted-foreground">{targetClient.phone}</div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isMerging}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleMerge}
            disabled={!targetClient || isMerging}
            className="gap-2"
          >
            {isMerging ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Mesclando...
              </>
            ) : (
              "Confirmar Mesclagem"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


