import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { formatBRL } from "@/lib/format";
import {
  Building2, Calendar, CheckCircle2, CreditCard, Globe, Image as ImageIcon, Instagram, KeyRound,
  Lock, LogOut, Mail, MessageCircle, Phone, Plug, Plus, Receipt, Send, Settings, ShieldCheck,
  Sparkles, Trash2, Upload, UserCog, Users, XCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Configurações · BeautyFlow" }] }),
  component: SettingsPage,
});

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const DAYS: { key: Day; label: string }[] = [
  { key: "mon", label: "Segunda" }, { key: "tue", label: "Terça" }, { key: "wed", label: "Quarta" },
  { key: "thu", label: "Quinta" }, { key: "fri", label: "Sexta" }, { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

const INTEGRATIONS = [
  { id: "whatsapp",        name: "WhatsApp",        icon: MessageCircle, desc: "Mensagens e lembretes automáticos." },
  { id: "google_calendar", name: "Google Calendar", icon: Calendar,      desc: "Sincronize sua agenda." },
  { id: "instagram",       name: "Instagram",       icon: Instagram,     desc: "Conecte sua conta para divulgação." },
  { id: "facebook",        name: "Facebook",        icon: Globe,         desc: "Integração com sua página." },
  { id: "pix",             name: "PIX",             icon: CreditCard,    desc: "Receba pagamentos via PIX." },
];

function SettingsPage() {
  const { data: profile } = useCurrentProfile();
  const qc = useQueryClient();
  const companyId = profile?.company?.id;
  const isOwner   = profile?.role === "owner";
  const isAdmin   = profile?.role === "owner" || profile?.role === "admin";

  return (
    <div className="space-y-6 pb-24 max-w-5xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie sua empresa, equipe e assinatura.</p>
      </header>

      <Tabs defaultValue="company" className="space-y-5">
        <TabsList className="w-full overflow-x-auto justify-start no-scrollbar">
          <TabsTrigger value="company"><Building2 className="h-3.5 w-3.5 mr-1.5" /> Empresa</TabsTrigger>
          <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1.5" /> Usuários</TabsTrigger>
          <TabsTrigger value="plan"><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Plano</TabsTrigger>
          <TabsTrigger value="billing"><Receipt className="h-3.5 w-3.5 mr-1.5" /> Assinatura</TabsTrigger>
          <TabsTrigger value="integrations"><Plug className="h-3.5 w-3.5 mr-1.5" /> Integrações</TabsTrigger>
          <TabsTrigger value="preferences"><Settings className="h-3.5 w-3.5 mr-1.5" /> Preferências</TabsTrigger>
          <TabsTrigger value="security"><ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Segurança</TabsTrigger>
        </TabsList>

        <TabsContent value="company"><CompanyTab companyId={companyId} canEdit={isAdmin} qc={qc} /></TabsContent>
        <TabsContent value="users"><UsersTab companyId={companyId} canManage={isAdmin} qc={qc} /></TabsContent>
        <TabsContent value="plan"><PlanTab companyId={companyId} isOwner={isOwner} qc={qc} /></TabsContent>
        <TabsContent value="billing"><BillingTab companyId={companyId} /></TabsContent>
        <TabsContent value="integrations"><IntegrationsTab companyId={companyId} canManage={isAdmin} qc={qc} /></TabsContent>
        <TabsContent value="preferences"><PreferencesTab companyId={companyId} qc={qc} /></TabsContent>
        <TabsContent value="security"><SecurityTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ========================== COMPANY ==========================
const companySchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(120),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(40).optional().or(z.literal("")),
  instagram: z.string().trim().max(60).optional().or(z.literal("")),
  address: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(40).optional().or(z.literal("")),
});

function CompanyTab({ companyId, canEdit, qc }: { companyId?: string; canEdit: boolean; qc: any }) {
  const { data: company } = useQuery({
    enabled: !!companyId,
    queryKey: ["company-full", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("*").eq("id", companyId!).maybeSingle();
      return data;
    },
  });

  const form = useForm<z.infer<typeof companySchema>>({
    resolver: zodResolver(companySchema),
    values: {
      name: company?.name ?? "", email: company?.email ?? "", phone: company?.phone ?? "",
      whatsapp: (company as any)?.whatsapp ?? "", instagram: (company as any)?.instagram ?? "",
      address: (company as any)?.address ?? "", city: (company as any)?.city ?? "", state: (company as any)?.state ?? "",
    },
  });

  const [hours, setHours] = useState<Record<Day, { open: string; close: string; closed: boolean }>>(
    (company as any)?.business_hours ?? {
      mon: { open: "09:00", close: "18:00", closed: false }, tue: { open: "09:00", close: "18:00", closed: false },
      wed: { open: "09:00", close: "18:00", closed: false }, thu: { open: "09:00", close: "18:00", closed: false },
      fri: { open: "09:00", close: "18:00", closed: false }, sat: { open: "09:00", close: "14:00", closed: false },
      sun: { open: "09:00", close: "18:00", closed: true  },
    }
  );
  useEffect(() => { if ((company as any)?.business_hours) setHours((company as any).business_hours); }, [company]);

  async function onSave(values: z.infer<typeof companySchema>) {
    if (!companyId) return;
    const { error } = await supabase.from("companies").update({
      name: values.name,
      email: values.email || null, phone: values.phone || null,
      whatsapp: values.whatsapp || null, instagram: values.instagram || null,
      address: values.address || null, city: values.city || null, state: values.state || null,
      business_hours: hours,
    } as any).eq("id", companyId);
    if (error) return toast.error(error.message);
    toast.success("Empresa atualizada");
    qc.invalidateQueries({ queryKey: ["company-full", companyId] });
    qc.invalidateQueries({ queryKey: ["current-profile"] });
  }

  async function uploadLogo(file: File) {
    if (!companyId) return;
    if (!/(png|jpe?g|webp)/i.test(file.type)) return toast.error("Formato inválido. Use PNG, JPG ou WEBP.");
    if (file.size > 2 * 1024 * 1024) return toast.error("Arquivo muito grande (máx 2MB).");
    const ext = file.name.split(".").pop();
    const path = `${companyId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data: signed } = await supabase.storage.from("company-assets").createSignedUrl(path, 60 * 60 * 24 * 365);
    await supabase.from("companies").update({ logo_url: signed?.signedUrl ?? path }).eq("id", companyId);
    toast.success("Logo atualizado");
    qc.invalidateQueries({ queryKey: ["company-full", companyId] });
  }

  return (
    <Card className="p-6 shadow-soft space-y-6">
      {/* Logo */}
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-xl border bg-muted/30 grid place-items-center overflow-hidden">
          {(company as any)?.logo_url ? (
            <img src={(company as any).logo_url} alt="Logo" className="h-full w-full object-cover" />
          ) : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Logo da empresa</h3>
          <p className="text-xs text-muted-foreground mb-2">PNG, JPG ou WEBP até 2MB.</p>
          <label className="inline-flex">
            <input type="file" hidden accept=".png,.jpg,.jpeg,.webp" disabled={!canEdit}
              onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            <Button type="button" variant="outline" size="sm" disabled={!canEdit} asChild>
              <span><Upload className="h-3.5 w-3.5 mr-1.5" /> Fazer upload</span>
            </Button>
          </label>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Nome" error={form.formState.errors.name?.message}><Input {...form.register("name")} disabled={!canEdit} /></Field>
          <Field label="E-mail"><Input type="email" {...form.register("email")} disabled={!canEdit} /></Field>
          <Field label="Telefone"><Input {...form.register("phone")} disabled={!canEdit} /></Field>
          <Field label="WhatsApp"><Input {...form.register("whatsapp")} placeholder="+55..." disabled={!canEdit} /></Field>
          <Field label="Instagram"><Input {...form.register("instagram")} placeholder="@suaempresa" disabled={!canEdit} /></Field>
          <Field label="Endereço"><Input {...form.register("address")} disabled={!canEdit} /></Field>
          <Field label="Cidade"><Input {...form.register("city")} disabled={!canEdit} /></Field>
          <Field label="Estado"><Input {...form.register("state")} disabled={!canEdit} /></Field>
        </div>

        {/* Business hours */}
        <div className="space-y-2">
          <h3 className="font-semibold text-sm pt-2">Horário de funcionamento</h3>
          <div className="space-y-2">
            {DAYS.map(d => (
              <div key={d.key} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                <span className="text-sm w-24 font-medium">{d.label}</span>
                <Switch checked={!hours[d.key]?.closed} disabled={!canEdit}
                  onCheckedChange={(v) => setHours(h => ({ ...h, [d.key]: { ...h[d.key], closed: !v } }))} />
                {hours[d.key]?.closed ? (
                  <span className="text-xs text-muted-foreground">Fechado</span>
                ) : (
                  <>
                    <Input type="time" className="w-28 h-8" value={hours[d.key]?.open} disabled={!canEdit}
                      onChange={(e) => setHours(h => ({ ...h, [d.key]: { ...h[d.key], open: e.target.value } }))} />
                    <span className="text-xs text-muted-foreground">até</span>
                    <Input type="time" className="w-28 h-8" value={hours[d.key]?.close} disabled={!canEdit}
                      onChange={(e) => setHours(h => ({ ...h, [d.key]: { ...h[d.key], close: e.target.value } }))} />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>Salvar alterações</Button>
          </div>
        )}
      </form>
    </Card>
  );
}

// ========================== USERS ==========================
function UsersTab({ companyId, canManage, qc }: { companyId?: string; canManage: boolean; qc: any }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(""); const [role, setRole] = useState<"admin" | "employee">("employee");

  const members = useQuery({
    enabled: !!companyId,
    queryKey: ["members", companyId],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").eq("company_id", companyId!);
      if (!roles?.length) return [];
      const ids = roles.map(r => r.user_id);
      const { data: profs } = await supabase.from("profiles").select("id, name, email").in("id", ids);
      return roles.map(r => ({ ...r, profile: profs?.find(p => p.id === r.user_id) }));
    },
  });

  const invites = useQuery({
    enabled: !!companyId,
    queryKey: ["invitations", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("invitations")
        .select("id, company_id, email, role, status, invited_by, expires_at, accepted_at, created_at, updated_at")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function sendInvite() {
    if (!companyId || !email) return;
    const { error } = await supabase.from("invitations").insert({
      company_id: companyId, email: email.trim().toLowerCase(), role,
    } as any);
    if (error) return toast.error(error.message);
    toast.success("Convite criado. Compartilhe o link com o usuário.");
    setOpen(false); setEmail("");
    qc.invalidateQueries({ queryKey: ["invitations", companyId] });
  }

  async function cancelInvite(id: string) {
    await supabase.from("invitations").update({ status: "CANCELED" } as any).eq("id", id);
    qc.invalidateQueries({ queryKey: ["invitations", companyId] });
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-[15px]">Membros da equipe</h2>
            <p className="text-xs text-muted-foreground">Quem tem acesso a este BeautyFlow.</p>
          </div>
          {canManage && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> Convidar</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Convidar usuário</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com" /></Field>
                  <Field label="Perfil">
                    <Select value={role} onValueChange={(v) => setRole(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin · Operação completa</SelectItem>
                        <SelectItem value="employee">Employee · Agenda e clientes</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={sendInvite}><Send className="h-3.5 w-3.5 mr-1.5" /> Enviar convite</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        {!members.data?.length ? <Empty text="Nenhum membro." /> : (
          <ul className="divide-y">
            {members.data.map((m: any) => (
              <li key={m.user_id} className="py-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-secondary grid place-items-center text-sm font-semibold text-primary">
                  {(m.profile?.name ?? "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.profile?.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.profile?.email ?? "—"}</p>
                </div>
                <Badge variant={m.role === "owner" ? "default" : "secondary"} className="capitalize">{m.role}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5 shadow-soft">
        <h2 className="font-semibold text-[15px] mb-3">Convites pendentes</h2>
        {!invites.data?.length ? <Empty text="Sem convites." /> : (
          <ul className="divide-y">
            {invites.data.map((i: any) => (
              <li key={i.id} className="py-3 flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{i.email}</p>
                  <p className="text-xs text-muted-foreground">Perfil: {i.role} · Expira em {new Date(i.expires_at).toLocaleDateString("pt-BR")}</p>
                </div>
                <Badge variant={i.status === "PENDING" ? "secondary" : i.status === "ACCEPTED" ? "default" : "outline"} className="capitalize">
                  {i.status.toLowerCase()}
                </Badge>
                {canManage && i.status === "PENDING" && (
                  <Button size="icon" variant="ghost" onClick={() => cancelInvite(i.id)}><Trash2 className="h-4 w-4" /></Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ========================== PLAN ==========================
function PlanTab({ companyId, isOwner, qc }: { companyId?: string; isOwner: boolean; qc: any }) {
  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("*").order("sort_order");
      return data ?? [];
    },
  });

  const sub = useQuery({
    enabled: !!companyId,
    queryKey: ["subscription", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("subscriptions").select("*").eq("company_id", companyId!).maybeSingle();
      return data;
    },
  });

  const clientsCount = useQuery({
    enabled: !!companyId,
    queryKey: ["clients-count", companyId],
    queryFn: async () => {
      const { count } = await supabase.from("clients").select("id", { count: "exact", head: true }).eq("company_id", companyId!);
      return count ?? 0;
    },
  });

  const currentPlan = (plans.data ?? []).find((p: any) => p.id === sub.data?.plan_id);
  const usagePct = currentPlan?.max_clients ? Math.min(100, ((clientsCount.data ?? 0) / currentPlan.max_clients) * 100) : 0;

  async function upgrade(_planId: string) {
    // Plan changes must go through a verified server-side billing flow.
    // Direct client writes to subscriptions / companies.plan are blocked by RLS
    // and a database trigger. Wire this button to your checkout / billing webhook.
    toast.info("Checkout em breve. Entre em contato com o suporte para alterar seu plano.");
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 shadow-soft bg-gradient-to-br from-card to-accent/20 border-primary/20">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Seu plano atual</p>
            <p className="text-2xl font-bold mt-1">{currentPlan?.name ?? "—"}</p>
            <p className="text-sm text-muted-foreground">
              {sub.data?.status === "TRIAL" ? `Trial até ${new Date(sub.data.trial_ends_at ?? sub.data.current_period_end).toLocaleDateString("pt-BR")}` :
               sub.data ? `Próxima cobrança: ${new Date(sub.data.current_period_end).toLocaleDateString("pt-BR")}` : "—"}
            </p>
          </div>
          <Badge variant={sub.data?.status === "ACTIVE" ? "default" : "secondary"} className="uppercase">{sub.data?.status ?? "—"}</Badge>
        </div>
        {currentPlan?.max_clients && (
          <div className="mt-4">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Clientes</span>
              <span className="tabular-nums">{clientsCount.data ?? 0} / {currentPlan.max_clients}</span>
            </div>
            <Progress value={usagePct} className="h-1.5" />
            {usagePct >= 85 && <p className="text-xs text-warning mt-2">Você utilizou {Math.round(usagePct)}% do seu plano.</p>}
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {(plans.data ?? []).map((p: any) => {
          const features = p.features as Record<string, boolean>;
          const isCurrent = p.id === sub.data?.plan_id;
          return (
            <Card key={p.id} className={`p-5 shadow-soft flex flex-col ${isCurrent ? "border-2 border-primary" : ""}`}>
              {isCurrent && <Badge className="self-start mb-2">Plano atual</Badge>}
              <h3 className="font-semibold text-lg">{p.name}</h3>
              <p className="text-xs text-muted-foreground mb-3">{p.description}</p>
              <p className="text-3xl font-bold tabular-nums">{formatBRL(Number(p.monthly_price))}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
              <ul className="mt-4 space-y-1.5 text-sm flex-1">
                <Feature ok>Até {p.max_clients ?? "∞"} clientes</Feature>
                <Feature ok>Até {p.max_users ?? "∞"} usuários</Feature>
                <Feature ok={features?.agenda}>Agenda</Feature>
                <Feature ok={features?.returns}>Clientes para Retorno</Feature>
                <Feature ok={features?.financial}>Financeiro</Feature>
                <Feature ok={features?.reports}>Relatórios</Feature>
                <Feature ok={features?.integrations}>Integrações</Feature>
                <Feature ok={features?.ai}>IA (BeautyFlow Insights)</Feature>
              </ul>
              <Button className="mt-4" disabled={isCurrent || !isOwner} onClick={() => upgrade(p.id)}>
                {isCurrent ? "Plano atual" : "Fazer upgrade"}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ========================== BILLING ==========================
function BillingTab({ companyId }: { companyId?: string }) {
  const sub = useQuery({
    enabled: !!companyId,
    queryKey: ["subscription", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("subscriptions").select("*, plans(name)").eq("company_id", companyId!).maybeSingle();
      return data;
    },
  });

  const invoices = useQuery({
    enabled: !!companyId,
    queryKey: ["invoices", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("invoices").select("*").eq("company_id", companyId!)
        .order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  const isTrial = sub.data?.status === "TRIAL";
  const trialDaysLeft = sub.data?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(sub.data.trial_ends_at).getTime() - Date.now()) / 86400000)) : 0;

  return (
    <div className="space-y-5">
      <Card className="p-5 shadow-soft">
        <h2 className="font-semibold text-[15px] mb-4">Assinatura</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <Info label="Plano" value={(sub.data as any)?.plans?.name ?? "—"} />
          <Info label="Valor" value={formatBRL(Number(sub.data?.amount ?? 0)) + "/mês"} />
          <Info label="Próxima cobrança" value={sub.data?.current_period_end ? new Date(sub.data.current_period_end).toLocaleDateString("pt-BR") : "—"} />
          <Info label="Status" value={
            <Badge variant={sub.data?.status === "ACTIVE" ? "default" : "secondary"} className="uppercase">{sub.data?.status ?? "—"}</Badge>
          } />
        </div>
        {isTrial && (
          <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/30">
            <p className="text-sm font-medium">🎁 Você está em período de teste</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {trialDaysLeft} dia(s) restantes. Faça upgrade para continuar com todos os recursos.
            </p>
          </div>
        )}
      </Card>

      <Card className="p-5 shadow-soft">
        <h2 className="font-semibold text-[15px] mb-3">Histórico de faturas</h2>
        {!invoices.data?.length ? <Empty text="Sem faturas ainda. Suas cobranças aparecerão aqui." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase tracking-wider">
                <tr className="border-b">
                  <th className="text-left py-2 px-2">Número</th>
                  <th className="text-left py-2 px-2">Vencimento</th>
                  <th className="text-right py-2 px-2">Valor</th>
                  <th className="text-right py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.data.map((inv: any) => (
                  <tr key={inv.id} className="border-b last:border-0">
                    <td className="py-2 px-2 font-mono text-xs">{inv.number}</td>
                    <td className="py-2 px-2">{new Date(inv.due_date).toLocaleDateString("pt-BR")}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{formatBRL(Number(inv.amount))}</td>
                    <td className="py-2 px-2 text-right">
                      <Badge variant={inv.status === "PAID" ? "default" : inv.status === "PAST_DUE" ? "destructive" : "secondary"}>{inv.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ========================== INTEGRATIONS ==========================
function IntegrationsTab({ companyId, canManage, qc }: { companyId?: string; canManage: boolean; qc: any }) {
  const list = useQuery({
    enabled: !!companyId,
    queryKey: ["integrations", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("integrations").select("*").eq("company_id", companyId!);
      return data ?? [];
    },
  });

  async function toggle(provider: string, currentlyConnected: boolean) {
    if (!companyId) return;
    const newStatus = currentlyConnected ? "DISCONNECTED" : "CONNECTED";
    await supabase.from("integrations").upsert({
      company_id: companyId, provider, status: newStatus,
      connected_at: currentlyConnected ? null : new Date().toISOString(),
    } as any, { onConflict: "company_id,provider" });
    toast.success(currentlyConnected ? "Integração desconectada" : "Integração conectada");
    qc.invalidateQueries({ queryKey: ["integrations", companyId] });
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {INTEGRATIONS.map(I => {
        const row = list.data?.find((r: any) => r.provider === I.id);
        const connected = row?.status === "CONNECTED";
        return (
          <Card key={I.id} className="p-4 shadow-soft flex items-center gap-3">
            <div className={`grid h-10 w-10 place-items-center rounded-lg ${connected ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"}`}>
              <I.icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{I.name}</p>
              <p className="text-xs text-muted-foreground">{I.desc}</p>
            </div>
            <Button size="sm" variant={connected ? "outline" : "default"} disabled={!canManage}
              onClick={() => toggle(I.id, connected)}>
              {connected ? "Desconectar" : "Conectar"}
            </Button>
          </Card>
        );
      })}
    </div>
  );
}

// ========================== PREFERENCES ==========================
function PreferencesTab({ companyId, qc }: { companyId?: string; qc: any }) {
  const { data: company } = useQuery({
    enabled: !!companyId,
    queryKey: ["company-full", companyId],
    queryFn: async () => (await supabase.from("companies").select("preferences").eq("id", companyId!).maybeSingle()).data,
  });
  const prefs = (company as any)?.preferences ?? { language: "pt-BR", timezone: "America/Sao_Paulo", currency: "BRL", date_format: "DD/MM/YYYY" };
  const [local, setLocal] = useState(prefs);
  useEffect(() => { if (prefs) setLocal(prefs); }, [company]);

  async function save() {
    if (!companyId) return;
    const { error } = await supabase.from("companies").update({ preferences: local } as any).eq("id", companyId);
    if (error) return toast.error(error.message);
    toast.success("Preferências salvas");
    qc.invalidateQueries({ queryKey: ["company-full", companyId] });
  }

  return (
    <Card className="p-6 shadow-soft space-y-4">
      <h2 className="font-semibold text-[15px]">Preferências</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Idioma">
          <Select value={local.language} onValueChange={(v) => setLocal({ ...local, language: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
              <SelectItem value="en-US">English (US)</SelectItem>
              <SelectItem value="es-ES">Español</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Fuso horário">
          <Select value={local.timezone} onValueChange={(v) => setLocal({ ...local, timezone: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="America/Sao_Paulo">São Paulo (GMT-3)</SelectItem>
              <SelectItem value="America/Manaus">Manaus (GMT-4)</SelectItem>
              <SelectItem value="America/Rio_Branco">Rio Branco (GMT-5)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Moeda">
          <Select value={local.currency} onValueChange={(v) => setLocal({ ...local, currency: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BRL">Real (R$)</SelectItem>
              <SelectItem value="USD">Dólar (US$)</SelectItem>
              <SelectItem value="EUR">Euro (€)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Formato de data">
          <Select value={local.date_format} onValueChange={(v) => setLocal({ ...local, date_format: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="DD/MM/YYYY">DD/MM/AAAA</SelectItem>
              <SelectItem value="MM/DD/YYYY">MM/DD/AAAA</SelectItem>
              <SelectItem value="YYYY-MM-DD">AAAA-MM-DD</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="flex justify-end"><Button onClick={save}>Salvar preferências</Button></div>
    </Card>
  );
}

// ========================== SECURITY ==========================
function SecurityTab() {
  const [pwd, setPwd] = useState(""); const [pwd2, setPwd2] = useState("");

  async function changePassword() {
    if (pwd.length < 8) return toast.error("Senha deve ter pelo menos 8 caracteres.");
    if (pwd !== pwd2)    return toast.error("Senhas não conferem.");
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) return toast.error(error.message);
    toast.success("Senha alterada com sucesso.");
    setPwd(""); setPwd2("");
  }

  async function signOutAll() {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) return toast.error(error.message);
    toast.success("Você foi desconectado de todos os dispositivos.");
  }

  return (
    <div className="space-y-5">
      <Card className="p-6 shadow-soft space-y-4">
        <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /><h2 className="font-semibold text-[15px]">Alterar senha</h2></div>
        <Field label="Nova senha"><Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} /></Field>
        <Field label="Confirmar nova senha"><Input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} /></Field>
        <div className="flex justify-end"><Button onClick={changePassword}><Lock className="h-3.5 w-3.5 mr-1.5" /> Alterar senha</Button></div>
      </Card>

      <Card className="p-6 shadow-soft space-y-3">
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="font-semibold text-[15px]">Sessões ativas</h2></div>
        <p className="text-sm text-muted-foreground">Encerre todas as sessões em outros dispositivos.</p>
        <div className="flex justify-end">
          <Button variant="outline" onClick={signOutAll}><LogOut className="h-3.5 w-3.5 mr-1.5" /> Sair de todos os dispositivos</Button>
        </div>
      </Card>

      <Card className="p-6 shadow-soft">
        <div className="flex items-center gap-2 mb-2"><UserCog className="h-4 w-4 text-muted-foreground" /><h2 className="font-semibold text-[15px]">Autenticação em 2 fatores</h2></div>
        <p className="text-sm text-muted-foreground">Em breve. Adicione uma camada extra de segurança à sua conta.</p>
      </Card>
    </div>
  );
}

// ========================== HELPERS ==========================
function Field({ label, children, error }: { label: string; children: any; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="font-semibold mt-0.5">{value}</p>
    </div>
  );
}
function Feature({ ok, children }: { ok?: boolean; children: any }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" /> : <XCircle className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
      <span className={ok ? "" : "text-muted-foreground line-through"}>{children}</span>
    </li>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-6 text-center">{text}</p>;
}
