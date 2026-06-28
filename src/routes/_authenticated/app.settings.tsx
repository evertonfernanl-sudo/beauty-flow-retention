import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { formatBRL } from "@/lib/format";
import {
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  Globe,
  Image as ImageIcon,
  Instagram,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  Phone,
  Plug,
  Plus,
  Receipt,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserCog,
  Users,
  XCircle,
  Scissors,
  Trophy,
  Repeat,
  TrendingUp,
  MoreVertical,
  Loader2,
} from "lucide-react";
import {
  createProfessionalUser,
  deleteCompanyMember,
  updateUserPermissions,
} from "@/lib/api/users.functions";
import { cancelSubscription } from "@/lib/api/billing.functions";
import { jsPDF } from "jspdf";

const settingsSearchSchema = z.object({
  tab: z.string().optional().catch("company"),
});

export const Route = createFileRoute("/_authenticated/app/settings")({
  validateSearch: (search) => settingsSearchSchema.parse(search),
  head: () => ({ meta: [{ title: "Configurações · BeautyFlow" }] }),
  component: SettingsPage,
});

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const DAYS: { key: Day; label: string }[] = [
  { key: "mon", label: "Segunda" },
  { key: "tue", label: "Terça" },
  { key: "wed", label: "Quarta" },
  { key: "thu", label: "Quinta" },
  { key: "fri", label: "Sexta" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

const INTEGRATIONS = [
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: MessageCircle,
    desc: "Mensagens e lembretes automáticos.",
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    icon: Calendar,
    desc: "Sincronize sua agenda.",
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: Instagram,
    desc: "Conecte sua conta para divulgação.",
  },
  { id: "facebook", name: "Facebook", icon: Globe, desc: "Integração com sua página." },
  { id: "pix", name: "PIX", icon: CreditCard, desc: "Receba pagamentos via PIX." },
];

function SettingsPage() {
  const { data: profile } = useCurrentProfile();
  const qc = useQueryClient();
  const companyId = profile?.company?.id;
  const isOwner = profile?.role === "owner";
  const isAdmin = profile?.role === "owner" || profile?.role === "admin";

  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  useEffect(() => {
    if (tab === "billing") {
      navigate({ search: { tab: "plan" }, replace: true });
    } else if (tab === "preferences") {
      navigate({ search: { tab: "company" }, replace: true });
    }
  }, [tab, navigate]);

  const activeTab = tab === "billing" ? "plan" : tab === "preferences" ? "company" : (tab || "company");

  const handleTabChange = (val: string) => {
    navigate({ search: { tab: val } });
  };

  return (
    <div className="space-y-6 pb-24 max-w-5xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie sua empresa, equipe e assinatura.</p>
      </header>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-5">
        <TabsList className="w-full overflow-x-auto justify-start no-scrollbar">
          <TabsTrigger value="company">
            <Building2 className="h-3.5 w-3.5 mr-1.5" /> Empresa
          </TabsTrigger>
          <TabsTrigger value="services">
            <Scissors className="h-3.5 w-3.5 mr-1.5" /> Serviços
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="h-3.5 w-3.5 mr-1.5" /> Usuários
          </TabsTrigger>
          <TabsTrigger value="plan">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Plano
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Plug className="h-3.5 w-3.5 mr-1.5" /> Integrações
          </TabsTrigger>
          <TabsTrigger value="security">
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Segurança
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-6">
          <CompanyTab companyId={companyId} canEdit={isAdmin} qc={qc} />
          <PreferencesTab companyId={companyId} qc={qc} />
        </TabsContent>
        <TabsContent value="services">
          <ServicesTab companyId={companyId} qc={qc} />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab companyId={companyId} canManage={isAdmin} qc={qc} />
        </TabsContent>
        <TabsContent value="plan" className="space-y-6">
          <PlanTab companyId={companyId} isOwner={isOwner} qc={qc} />
          <BillingTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="integrations">
          <IntegrationsTab companyId={companyId} canManage={isAdmin} qc={qc} />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab isAdmin={isAdmin} email={profile?.email} />
        </TabsContent>
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
      const { data } = await supabase
        .from("companies")
        .select("*")
        .eq("id", companyId!)
        .maybeSingle();
      return data;
    },
  });

  const form = useForm<z.infer<typeof companySchema>>({
    resolver: zodResolver(companySchema),
    values: {
      name: company?.name ?? "",
      email: company?.email ?? "",
      phone: company?.phone ?? "",
      whatsapp: (company as any)?.whatsapp ?? "",
      instagram: (company as any)?.instagram ?? "",
      address: (company as any)?.address ?? "",
      city: (company as any)?.city ?? "",
      state: (company as any)?.state ?? "",
    },
  });

  const [hours, setHours] = useState<Record<Day, { open: string; close: string; closed: boolean }>>(
    (company as any)?.business_hours ?? {
      mon: { open: "09:00", close: "18:00", closed: false },
      tue: { open: "09:00", close: "18:00", closed: false },
      wed: { open: "09:00", close: "18:00", closed: false },
      thu: { open: "09:00", close: "18:00", closed: false },
      fri: { open: "09:00", close: "18:00", closed: false },
      sat: { open: "09:00", close: "14:00", closed: false },
      sun: { open: "09:00", close: "18:00", closed: true },
    },
  );
  useEffect(() => {
    if ((company as any)?.business_hours) setHours((company as any).business_hours);
  }, [company]);

  async function onSave(values: z.infer<typeof companySchema>) {
    if (!companyId) return;
    const { error } = await supabase
      .from("companies")
      .update({
        name: values.name,
        email: values.email || null,
        phone: values.phone || null,
        whatsapp: values.whatsapp || null,
        instagram: values.instagram || null,
        address: values.address || null,
        city: values.city || null,
        state: values.state || null,
        business_hours: hours,
      } as any)
      .eq("id", companyId);
    if (error) return toast.error(error.message);
    toast.success("Empresa atualizada");
    qc.invalidateQueries({ queryKey: ["company-full", companyId] });
    qc.invalidateQueries({ queryKey: ["current-profile"] });
  }

  async function uploadLogo(file: File) {
    if (!companyId) return;
    if (!/(png|jpe?g|webp)/i.test(file.type))
      return toast.error("Formato inválido. Use PNG, JPG ou WEBP.");
    if (file.size > 2 * 1024 * 1024) return toast.error("Arquivo muito grande (máx 2MB).");
    const ext = file.name.split(".").pop();
    const path = `${companyId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("company-assets")
      .upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data: signed } = await supabase.storage
      .from("company-assets")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    await supabase
      .from("companies")
      .update({ logo_url: signed?.signedUrl ?? path })
      .eq("id", companyId);
    toast.success("Logo atualizado");
    qc.invalidateQueries({ queryKey: ["company-full", companyId] });
  }

  return (
    <Card className="p-6 shadow-soft space-y-6">
      {/* Logo */}
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-xl border bg-muted/30 grid place-items-center overflow-hidden">
          {(company as any)?.logo_url ? (
            <img
              src={(company as any).logo_url}
              alt="Logo"
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Logo da empresa</h3>
          <p className="text-xs text-muted-foreground mb-2">PNG, JPG ou WEBP até 2MB.</p>
          <label className="inline-flex">
            <input
              type="file"
              hidden
              accept=".png,.jpg,.jpeg,.webp"
              disabled={!canEdit}
              onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
            />
            <Button type="button" variant="outline" size="sm" disabled={!canEdit} asChild>
              <span>
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Fazer upload
              </span>
            </Button>
          </label>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Nome" error={form.formState.errors.name?.message}>
            <Input {...form.register("name")} disabled={!canEdit} />
          </Field>
          <Field label="E-mail">
            <Input type="email" {...form.register("email")} disabled={!canEdit} />
          </Field>
          <Field label="Telefone">
            <Input {...form.register("phone")} disabled={!canEdit} />
          </Field>
          <Field label="WhatsApp">
            <Input {...form.register("whatsapp")} placeholder="+55..." disabled={!canEdit} />
          </Field>
          <Field label="Instagram">
            <Input {...form.register("instagram")} placeholder="@suaempresa" disabled={!canEdit} />
          </Field>
          <Field label="Endereço">
            <Input {...form.register("address")} disabled={!canEdit} />
          </Field>
          <Field label="Cidade">
            <Input {...form.register("city")} disabled={!canEdit} />
          </Field>
          <Field label="Estado">
            <Input {...form.register("state")} disabled={!canEdit} />
          </Field>
        </div>

        {/* Business hours */}
        <div className="space-y-2">
          <h3 className="font-semibold text-sm pt-2">Horário de funcionamento</h3>
          <div className="space-y-2">
            {DAYS.map((d) => (
              <div key={d.key} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                <span className="text-sm w-24 font-medium">{d.label}</span>
                <Switch
                  checked={!hours[d.key]?.closed}
                  disabled={!canEdit}
                  onCheckedChange={(v) =>
                    setHours((h) => ({ ...h, [d.key]: { ...h[d.key], closed: !v } }))
                  }
                />
                {hours[d.key]?.closed ? (
                  <span className="text-xs text-muted-foreground">Fechado</span>
                ) : (
                  <>
                    <Input
                      type="time"
                      className="w-28 h-8"
                      value={hours[d.key]?.open}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setHours((h) => ({ ...h, [d.key]: { ...h[d.key], open: e.target.value } }))
                      }
                    />
                    <span className="text-xs text-muted-foreground">até</span>
                    <Input
                      type="time"
                      className="w-28 h-8"
                      value={hours[d.key]?.close}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setHours((h) => ({ ...h, [d.key]: { ...h[d.key], close: e.target.value } }))
                      }
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Salvar alterações
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

// ========================== USERS ==========================
function UsersTab({
  companyId,
  canManage,
  qc,
}: {
  companyId?: string;
  canManage: boolean;
  qc: any;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "employee">("employee");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({
    view_dashboard: false,
    view_clients: false,
    view_financial: false,
    view_imports: false,
    view_settings: false,
    view_other_professionals_agenda: false,
    view_all_recurrence: false,
  });

  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Edit Permissions Dialog state
  const [editUser, setEditUser] = useState<any>(null);
  const [editPermissionsOpen, setEditPermissionsOpen] = useState(false);
  const [editPermissions, setEditPermissions] = useState<Record<string, boolean>>({});
  const [updatingPermissions, setUpdatingPermissions] = useState(false);

  // Credentials dialog state
  const [credsModalOpen, setCredsModalOpen] = useState(false);
  const [creds, setCreds] = useState<{
    name: string;
    email: string;
    password: string;
    link: string;
  } | null>(null);

  const { data: currentProfile } = useCurrentProfile();

  const members = useQuery({
    enabled: !!companyId,
    queryKey: ["members", companyId],
    queryFn: async () => {
      const rolesRes = await supabase
        .from("user_roles")
        .select("user_id, role, permissions")
        .eq("company_id", companyId!);

      const roles = rolesRes.data;
      if (!roles?.length) return [];
      const ids = roles.map((r) => r.user_id);

      const [profsRes, professionalsRes, companyRes] = await Promise.all([
        supabase.from("profiles").select("id, name, email").in("id", ids),
        supabase.from("professionals").select("id, user_id, active").in("user_id", ids),
        supabase.from("companies").select("email").eq("id", companyId!).maybeSingle(),
      ]);

      const profs = profsRes.data;
      const professionalsList = professionalsRes.data;
      const companyEmail = companyRes.data?.email;

      return roles.map((r) => {
        const profile = profs?.find((p) => p.id === r.user_id);
        const assocProfessional = professionalsList?.find((p) => p.user_id === r.user_id);
        let finalRole = r.role;

        if (companyEmail && profile?.email?.toLowerCase() === companyEmail.toLowerCase()) {
          finalRole = "owner";
        }

        return {
          ...r,
          role: finalRole,
          profile,
          activeProfessional: assocProfessional ? assocProfessional.active : false,
          professionalId: assocProfessional?.id,
        };
      });
    },
  });

  useEffect(() => {
    if (members.data && members.data.length === 1 && companyId) {
      const singleMember = members.data[0];
      if (!singleMember.activeProfessional) {
        (async () => {
          const { data: existingProf } = await supabase
            .from("professionals")
            .select("id")
            .eq("user_id", singleMember.user_id)
            .maybeSingle();

          if (existingProf) {
            await supabase
              .from("professionals")
              .update({ active: true })
              .eq("id", existingProf.id);
          } else {
            await supabase.from("professionals").insert({
              company_id: companyId,
              user_id: singleMember.user_id,
              name: singleMember.profile?.name || "Administrador",
              email: singleMember.profile?.email ?? null,
              active: true,
            });
          }
          qc.invalidateQueries({ queryKey: ["members", companyId] });
          qc.invalidateQueries({ queryKey: ["professionals-options", companyId] });
        })();
      }
    }
  }, [members.data, companyId, qc]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      return toast.error("Preencha todos os campos obrigatórios.");
    }
    if (password.length < 6) {
      return toast.error("A senha deve ter pelo menos 6 caracteres.");
    }
    setLoading(true);
    try {
      const res = await createProfessionalUser({
        data: {
          name: name.trim(),
          email: email.trim(),
          password: password,
          role: role,
          permissions: role === "employee" ? permissions : {},
        },
      });

      if (!res.ok) {
        throw new Error("Erro desconhecido ao criar usuário");
      }

      toast.success("Usuário criado com sucesso!");
      const accessLink = `${window.location.origin}/auth`;
      setCreds({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: password,
        link: accessLink,
      });
      setCredsModalOpen(true);

      // Reset form
      setName("");
      setEmail("");
      setPassword("");
      setRole("employee");
      setPermissions({
        view_dashboard: false,
        view_clients: false,
        view_financial: false,
        view_imports: false,
        view_settings: false,
        view_other_professionals_agenda: false,
        view_all_recurrence: false,
      });
      setOpen(false);

      qc.invalidateQueries({ queryKey: ["members", companyId] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar usuário.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteUser(userIdToDelete: string) {
    if (
      !confirm(
        "Tem certeza que deseja excluir a conta deste profissional? Todo o acesso dele será removido imediatamente e de forma definitiva.",
      )
    ) {
      return;
    }
    setDeletingId(userIdToDelete);
    try {
      await deleteCompanyMember({ data: { targetUserId: userIdToDelete } });
      toast.success("Usuário excluído com sucesso.");
      qc.invalidateQueries({ queryKey: ["members", companyId] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir usuário.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleUpdatePermissions() {
    if (!editUser) return;
    setUpdatingPermissions(true);
    try {
      await updateUserPermissions({
        data: {
          targetUserId: editUser.user_id,
          permissions: editPermissions,
        },
      });
      toast.success("Permissões atualizadas com sucesso!");
      setEditPermissionsOpen(false);
      qc.invalidateQueries({ queryKey: ["members", companyId] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar permissões.");
    } finally {
      setUpdatingPermissions(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-[15px]">Membros da equipe</h2>
            <p className="text-xs text-muted-foreground">
              Gerencie o acesso dos profissionais ao BeautyFlow.
            </p>
          </div>
          {canManage && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Criar Usuário
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Criar usuário do profissional</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateUser} className="space-y-3 pt-2">
                  <Field label="Nome completo *">
                    <Input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Patrícia Silva"
                      required
                    />
                  </Field>
                  <Field label="E-mail de login *">
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Ex: patricia@salao.com"
                      required
                    />
                  </Field>
                  <Field label="Senha de acesso *">
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                    />
                  </Field>
                  <Field label="Perfil / Permissões *">
                    <Select value={role} onValueChange={(v) => setRole(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">
                          Profissional (employee) · Acesso Personalizado
                        </SelectItem>
                        <SelectItem value="admin">
                          Administrador (admin) · Operação completa
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  {role === "employee" && (
                    <div className="space-y-3 pt-2 border-t mt-2">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Permissões adicionais (Por padrão, tudo bloqueado)
                      </Label>
                      <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                        {Object.entries({
                          view_dashboard: "Visão Geral (Dashboard)",
                          view_clients: "Clientes",
                          view_financial: "Financeiro",
                          view_imports: "Importar Dados",
                          view_settings: "Configurações",
                          view_other_professionals_agenda: "Ver agenda de outros profissionais",
                          view_all_recurrence: "Ver todos os clientes na recorrência",
                        }).map(([key, label]) => (
                          <div key={key} className="flex items-center justify-between">
                            <Label
                              htmlFor={`create-${key}`}
                              className="text-xs font-medium cursor-pointer flex-1 py-1"
                            >
                              {label}
                            </Label>
                            <Switch
                              id={`create-${key}`}
                              checked={!!permissions[key]}
                              onCheckedChange={(checked) =>
                                setPermissions((prev) => ({ ...prev, [key]: checked }))
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <DialogFooter className="pt-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Criar Acesso
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
        {!members.data?.length ? (
          <Empty text="Nenhum membro cadastrado." />
        ) : (
          <ul className="divide-y">
            {members.data.map((m: any) => (
              <li key={m.user_id} className="py-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-secondary grid place-items-center text-sm font-semibold text-primary">
                  {(m.profile?.name ?? "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.profile?.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.profile?.email ?? "—"}
                  </p>
                </div>
                <Badge
                  variant={m.role === "owner" ? "default" : "secondary"}
                  className="capitalize mr-2"
                >
                  {m.role}
                </Badge>
                <div className="flex items-center gap-1.5 mr-2">
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {members.data?.length <= 1
                      ? "Presta atendimento (obrigatório para único usuário)"
                      : "Presta atendimento?"}
                  </span>
                  <Switch
                    checked={members.data?.length <= 1 ? true : m.activeProfessional}
                    disabled={members.data?.length <= 1}
                    onCheckedChange={async (checked) => {
                      if (members.data?.length <= 1) return;
                      const { data: existingProf } = await supabase
                        .from("professionals")
                        .select("id")
                        .eq("user_id", m.user_id)
                        .maybeSingle();

                      if (existingProf) {
                        const { error } = await supabase
                          .from("professionals")
                          .update({ active: checked })
                          .eq("id", existingProf.id);
                        if (error) {
                          toast.error(error.message);
                        } else {
                          toast.success("Status de atendimento atualizado!");
                          qc.invalidateQueries({ queryKey: ["members", companyId] });
                          qc.invalidateQueries({ queryKey: ["professionals-options", companyId] });
                        }
                      } else {
                        const { error } = await supabase.from("professionals").insert({
                          company_id: companyId!,
                          user_id: m.user_id,
                          name: m.profile?.name || "Profissional",
                          email: m.profile?.email ?? null,
                          active: checked,
                        });
                        if (error) {
                          toast.error(error.message);
                        } else {
                          toast.success("Profissional registrado e ativado!");
                          qc.invalidateQueries({ queryKey: ["members", companyId] });
                          qc.invalidateQueries({ queryKey: ["professionals-options", companyId] });
                        }
                      }
                    }}
                  />
                </div>
                {canManage && m.role === "employee" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-primary hover:bg-primary/10 h-8 w-8 mr-1"
                    onClick={() => {
                      setEditUser(m);
                      setEditPermissions(
                        m.permissions ?? {
                          view_dashboard: false,
                          view_clients: false,
                          view_financial: false,
                          view_imports: false,
                          view_settings: false,
                          view_other_professionals_agenda: false,
                          view_all_recurrence: false,
                        },
                      );
                      setEditPermissionsOpen(true);
                    }}
                    title="Editar Permissões"
                  >
                    <ShieldCheck className="h-4 w-4" />
                  </Button>
                )}
                {canManage && m.user_id !== currentProfile?.userId && m.role !== "owner" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 h-8 w-8"
                    disabled={deletingId === m.user_id}
                    onClick={() => handleDeleteUser(m.user_id)}
                    title="Excluir profissional e remover acesso"
                  >
                    {deletingId === m.user_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Edit Permissions Dialog */}
      <Dialog open={editPermissionsOpen} onOpenChange={setEditPermissionsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar permissões de {editUser?.profile?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Ative ou desative as telas e recursos que este profissional pode acessar.
            </p>
            <div className="space-y-3.5 border rounded-lg p-4 bg-muted/20">
              {Object.entries({
                view_dashboard: "Visão Geral (Dashboard)",
                view_clients: "Clientes",
                view_financial: "Financeiro",
                view_imports: "Importar Dados",
                view_settings: "Configurações",
                view_other_professionals_agenda: "Ver agenda de outros profissionais",
                view_all_recurrence: "Ver todos os clientes na recorrência",
              }).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between">
                  <Label
                    htmlFor={`edit-${key}`}
                    className="text-sm font-medium leading-none cursor-pointer flex-1 py-1"
                  >
                    {label}
                  </Label>
                  <Switch
                    id={`edit-${key}`}
                    checked={!!editPermissions[key]}
                    onCheckedChange={(checked) =>
                      setEditPermissions((prev) => ({ ...prev, [key]: checked }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPermissionsOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdatePermissions} disabled={updatingPermissions}>
              {updatingPermissions && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Salvar Permissões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials Presentation Modal */}
      <Dialog open={credsModalOpen} onOpenChange={setCredsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary font-semibold">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" /> Acesso Criado!
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <p className="text-sm text-muted-foreground">
              O profissional {creds?.name} foi cadastrado. Copie as credenciais abaixo e envie para
              ele realizar o login por senha:
            </p>
            <div className="space-y-3 rounded-lg bg-muted/50 p-4 text-sm font-medium">
              <div className="flex justify-between items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground uppercase">Link de Login</p>
                  <p className="font-mono text-xs truncate">{creds?.link}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2 shrink-0"
                  onClick={() => copyToClipboard(creds?.link ?? "", "Link de login")}
                >
                  Copiar
                </Button>
              </div>
              <div className="flex justify-between items-center gap-2 border-t pt-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground uppercase">E-mail</p>
                  <p className="font-mono text-xs truncate">{creds?.email}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2 shrink-0"
                  onClick={() => copyToClipboard(creds?.email ?? "", "E-mail")}
                >
                  Copiar
                </Button>
              </div>
              <div className="flex justify-between items-center gap-2 border-t pt-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground uppercase">Senha de Acesso</p>
                  <p className="font-mono text-xs truncate">{creds?.password}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2 shrink-0"
                  onClick={() => copyToClipboard(creds?.password ?? "", "Senha")}
                >
                  Copiar
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={() => setCredsModalOpen(false)}>
              Fechar e Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ========================== PLAN ==========================
function PlanTab({ companyId, isOwner, qc }: { companyId?: string; isOwner: boolean; qc: any }) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("preco");
  const [cancelFeedback, setCancelFeedback] = useState("");
  const [canceling, setCanceling] = useState(false);

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
      const { data } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      return data;
    },
  });

  const clientsCount = useQuery({
    enabled: !!companyId,
    queryKey: ["clients-count", companyId],
    queryFn: async () => {
      const { count } = await supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!);
      return count ?? 0;
    },
  });

  const currentPlan = (plans.data ?? []).find((p: any) => p.id === sub.data?.plan_id);
  const usagePct = currentPlan?.max_clients
    ? Math.min(100, ((clientsCount.data ?? 0) / currentPlan.max_clients) * 100)
    : 0;

  async function upgrade(_planId: string) {
    toast.info("Checkout em breve. Entre em contato com o suporte para alterar seu plano.");
  }

  const handleCancelSubscription = async () => {
    if (!companyId) return;
    setCanceling(true);
    try {
      // 1. Carregar lista de clientes
      const { data: clients, error: clientsErr } = await supabase
        .from("clients")
        .select("name, phone, email")
        .eq("company_id", companyId);

      if (clientsErr) throw new Error(`Erro ao exportar clientes: ${clientsErr.message}`);

      // 2. Carregar agenda em aberto (agendamentos futuros)
      const { data: appointments, error: appErr } = await supabase
        .from("appointments")
        .select(`
          start_datetime, 
          status, 
          price, 
          notes, 
          clients (name, phone), 
          services (name), 
          professionals (name)
        `)
        .eq("company_id", companyId)
        .in("status", ["SCHEDULED", "CONFIRMED"])
        .gte("start_datetime", new Date().toISOString())
        .order("start_datetime", { ascending: true });

      if (appErr) throw new Error(`Erro ao exportar agendamentos: ${appErr.message}`);

      // 3. Gerar PDF de backup usando jsPDF
      const doc = new jsPDF();
      let y = 20;

      // Cabeçalho Principal
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(156, 39, 176); // Roxo do BeautyFlow
      doc.text("BACKUP DE DADOS - BEAUTYFLOW", 14, y);
      y += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text("Relatório gerado em decorrência do cancelamento da assinatura.", 14, y);
      y += 6;
      doc.text(`Data de geração: ${new Date().toLocaleString("pt-BR")}`, 14, y);
      y += 12;

      // Seção 1: Lista de Clientes
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text(`1. Clientes Cadastrados (${clients?.length ?? 0})`, 14, y);
      y += 8;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Nome", 14, y);
      doc.text("Telefone", 90, y);
      doc.text("E-mail", 140, y);
      y += 4;
      doc.line(14, y, 196, y);
      y += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      
      const clientList = clients ?? [];
      if (clientList.length === 0) {
        doc.text("Nenhum cliente cadastrado.", 14, y);
        y += 10;
      } else {
        for (const c of clientList) {
          if (y > 275) {
            doc.addPage();
            y = 20;
            // Cabeçalho da página nova para tabela de clientes
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.text("Nome", 14, y);
            doc.text("Telefone", 90, y);
            doc.text("E-mail", 140, y);
            y += 4;
            doc.line(14, y, 196, y);
            y += 6;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
          }
          
          const emailStr = c.email || "—";
          const phoneStr = c.phone || "—";
          const nameTrunc = c.name.length > 35 ? c.name.substring(0, 32) + "..." : c.name;
          const emailTrunc = emailStr.length > 30 ? emailStr.substring(0, 27) + "..." : emailStr;

          doc.text(nameTrunc, 14, y);
          doc.text(phoneStr, 90, y);
          doc.text(emailTrunc, 140, y);
          y += 6;
        }
      }

      y += 10;

      // Seção 2: Agenda em Aberto (Nova Página)
      doc.addPage();
      y = 20;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text(`2. Agenda em Aberto - Próximos Agendamentos (${appointments?.length ?? 0})`, 14, y);
      y += 8;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Data/Hora", 14, y);
      doc.text("Cliente", 48, y);
      doc.text("Serviço", 100, y);
      doc.text("Profissional", 145, y);
      doc.text("Valor", 180, y);
      y += 4;
      doc.line(14, y, 196, y);
      y += 6;

      doc.setFont("helvetica", "normal");
      
      const appList = appointments ?? [];
      if (appList.length === 0) {
        doc.setFontSize(9);
        doc.text("Nenhum agendamento futuro em aberto encontrado.", 14, y);
      } else {
        for (const app of appList) {
          if (y > 275) {
            doc.addPage();
            y = 20;
            // Cabeçalho da página nova para tabela de agendamentos
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.text("Data/Hora", 14, y);
            doc.text("Cliente", 48, y);
            doc.text("Serviço", 100, y);
            doc.text("Profissional", 145, y);
            doc.text("Valor", 180, y);
            y += 4;
            doc.line(14, y, 196, y);
            y += 6;
            doc.setFont("helvetica", "normal");
          }

          const clientName = (app.clients as any)?.name || "—";
          const serviceName = (app.services as any)?.name || "—";
          const profName = (app.professionals as any)?.name || "—";
          const dateStr = new Date(app.start_datetime).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          });

          const clientTrunc = clientName.length > 25 ? clientName.substring(0, 22) + "..." : clientName;
          const serviceTrunc = serviceName.length > 22 ? serviceName.substring(0, 19) + "..." : serviceName;
          const profTrunc = profName.length > 18 ? profName.substring(0, 15) + "..." : profName;
          const priceStr = app.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

          doc.setFontSize(8);
          doc.text(dateStr, 14, y);
          doc.text(clientTrunc, 48, y);
          doc.text(serviceTrunc, 100, y);
          doc.text(profTrunc, 145, y);
          doc.text(priceStr, 180, y);
          y += 6;
        }
      }

      doc.save("backup_beautyflow_dados.pdf");

      // 4. Executar cancelamento via Server Function
      const mappedReason = {
        preco: "Preço muito alto",
        recursos: "Falta de recursos necessários",
        dificuldade: "Dificuldade para configurar / usar",
        migracao: "Migrando para outro sistema",
        outros: "Outro motivo"
      }[cancelReason] || "Cancelamento";

      const finalReasonText = `${mappedReason}. Observações: ${cancelFeedback.trim() || "Nenhuma"}`;
      await cancelSubscription({ data: { reason: finalReasonText } });

      toast.success("Assinatura cancelada com sucesso. Seu backup de clientes e agenda foi baixado!");
      setCancelDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["subscription", companyId] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao realizar o cancelamento.");
    } finally {
      setCanceling(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-5 shadow-soft bg-gradient-to-br from-card to-accent/20 border-primary/20">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Seu plano atual
            </p>
            <p className="text-2xl font-bold mt-1">{currentPlan?.name ?? "—"}</p>
            <p className="text-sm text-muted-foreground">
              {sub.data?.status === "TRIAL"
                ? `Trial até ${new Date(sub.data.trial_ends_at ?? sub.data.current_period_end).toLocaleDateString("pt-BR")}`
                : sub.data?.status === "ACTIVE"
                  ? `Próxima cobrança: ${new Date(sub.data.current_period_end).toLocaleDateString("pt-BR")}`
                  : sub.data?.status === "CANCELED"
                    ? "Assinatura cancelada"
                    : "—"}
            </p>
          </div>
          <Badge
            variant={sub.data?.status === "ACTIVE" ? "default" : "secondary"}
            className="uppercase"
          >
            {sub.data?.status ?? "—"}
          </Badge>
        </div>
        {currentPlan?.max_clients && (
          <div className="mt-4">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Clientes</span>
              <span className="tabular-nums">
                {clientsCount.data ?? 0} / {currentPlan.max_clients}
              </span>
            </div>
            <Progress value={usagePct} className="h-1.5" />
            {usagePct >= 85 && (
              <p className="text-xs text-warning mt-2">
                Você utilizou {Math.round(usagePct)}% do seu plano.
              </p>
            )}
          </div>
        )}

        {sub.data && (sub.data.status === "ACTIVE" || sub.data.status === "TRIAL") && isOwner && (
          <div className="mt-5 border-t pt-4 flex justify-end">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setCancelDialogOpen(true)}
            >
              Cancelar Assinatura
            </Button>
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {(plans.data ?? []).map((p: any) => {
          const features = p.features as Record<string, boolean>;
          const isCurrent = p.id === sub.data?.plan_id;
          return (
            <Card
              key={p.id}
              className={`p-5 shadow-soft flex flex-col ${isCurrent ? "border-2 border-primary" : ""}`}
            >
              {isCurrent && <Badge className="self-start mb-2">Plano atual</Badge>}
              <h3 className="font-semibold text-lg">{p.name}</h3>
              <p className="text-xs text-muted-foreground mb-3">{p.description}</p>
              <p className="text-3xl font-bold tabular-nums">
                {formatBRL(Number(p.monthly_price))}
                <span className="text-sm font-normal text-muted-foreground">/mês</span>
              </p>
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
              <Button
                className="mt-4"
                disabled={isCurrent || !isOwner || sub.data?.status === "CANCELED"}
                onClick={() => upgrade(p.id)}
              >
                {isCurrent ? "Plano atual" : "Fazer upgrade"}
              </Button>
            </Card>
          );
        })}
      </div>

      {/* Cancel Subscription Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive font-semibold">Cancelar Assinatura BeautyFlow</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <p className="text-muted-foreground leading-relaxed">
              Sentimos muito em ver você partir. Por favor, selecione abaixo o principal motivo do cancelamento para que possamos melhorar a plataforma:
            </p>
            <div className="space-y-3">
              <div>
                <Label htmlFor="cancel-reason">Motivo do cancelamento *</Label>
                <Select value={cancelReason} onValueChange={setCancelReason}>
                  <SelectTrigger className="w-full mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preco">Preço muito alto / Custo benefício</SelectItem>
                    <SelectItem value="recursos">Falta de recursos necessários</SelectItem>
                    <SelectItem value="dificuldade">Dificuldade para configurar / usar</SelectItem>
                    <SelectItem value="migracao">Migrando para outro sistema</SelectItem>
                    <SelectItem value="outros">Outros motivos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="cancel-feedback">Observações adicionais (opcional)</Label>
                <Textarea
                  id="cancel-feedback"
                  className="mt-1.5 min-h-[80px]"
                  placeholder="Escreva aqui seu feedback..."
                  value={cancelFeedback}
                  onChange={(e) => setCancelFeedback(e.target.value)}
                />
              </div>
            </div>

            <div className="p-3 bg-muted/60 rounded-lg border border-primary/10 text-xs leading-relaxed text-muted-foreground">
              ⚠️ **Importante**: Ao confirmar, sua assinatura será cancelada. O BeautyFlow gerará automaticamente um arquivo PDF para download contendo todos os seus **clientes cadastrados** e **agendamentos futuros em aberto** como backup dos seus dados.
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)} disabled={canceling}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelSubscription}
              disabled={canceling}
            >
              {canceling ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Cancelando...
                </>
              ) : (
                "Confirmar Cancelamento e Baixar Backup"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ========================== BILLING ==========================
function BillingTab({ companyId }: { companyId?: string }) {
  const sub = useQuery({
    enabled: !!companyId,
    queryKey: ["subscription", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("*, plans(name)")
        .eq("company_id", companyId!)
        .maybeSingle();
      return data;
    },
  });

  const invoices = useQuery({
    enabled: !!companyId,
    queryKey: ["invoices", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const isTrial = sub.data?.status === "TRIAL";
  const trialDaysLeft = sub.data?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(sub.data.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <div className="space-y-5">
      <Card className="p-5 shadow-soft">
        <h2 className="font-semibold text-[15px] mb-4">Assinatura</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <Info label="Plano" value={(sub.data as any)?.plans?.name ?? "—"} />
          <Info label="Valor" value={formatBRL(Number(sub.data?.amount ?? 0)) + "/mês"} />
          <Info
            label="Próxima cobrança"
            value={
              sub.data?.current_period_end
                ? new Date(sub.data.current_period_end).toLocaleDateString("pt-BR")
                : "—"
            }
          />
          <Info
            label="Status"
            value={
              <Badge
                variant={sub.data?.status === "ACTIVE" ? "default" : "secondary"}
                className="uppercase"
              >
                {sub.data?.status ?? "—"}
              </Badge>
            }
          />
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
        {!invoices.data?.length ? (
          <Empty text="Sem faturas ainda. Suas cobranças aparecerão aqui." />
        ) : (
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
                    <td className="py-2 px-2">
                      {new Date(inv.due_date).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {formatBRL(Number(inv.amount))}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <Badge
                        variant={
                          inv.status === "PAID"
                            ? "default"
                            : inv.status === "PAST_DUE"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {inv.status}
                      </Badge>
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
function IntegrationsTab({
  companyId,
  canManage,
  qc,
}: {
  companyId?: string;
  canManage: boolean;
  qc: any;
}) {
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
    await supabase.from("integrations").upsert(
      {
        company_id: companyId,
        provider,
        status: newStatus,
        connected_at: currentlyConnected ? null : new Date().toISOString(),
      } as any,
      { onConflict: "company_id,provider" },
    );
    toast.success(currentlyConnected ? "Integração desconectada" : "Integração conectada");
    qc.invalidateQueries({ queryKey: ["integrations", companyId] });
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {INTEGRATIONS.map((I) => {
        const row = list.data?.find((r: any) => r.provider === I.id);
        const connected = row?.status === "CONNECTED";
        return (
          <Card key={I.id} className="p-4 shadow-soft flex items-center gap-3">
            <div
              className={`grid h-10 w-10 place-items-center rounded-lg ${connected ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"}`}
            >
              <I.icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{I.name}</p>
              <p className="text-xs text-muted-foreground">{I.desc}</p>
            </div>
            <Button
              size="sm"
              variant={connected ? "outline" : "default"}
              disabled={!canManage}
              onClick={() => toggle(I.id, connected)}
            >
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
    queryFn: async () =>
      (await supabase.from("companies").select("preferences").eq("id", companyId!).maybeSingle())
        .data,
  });
  const prefs = (company as any)?.preferences ?? {
    language: "pt-BR",
    timezone: "America/Sao_Paulo",
    currency: "BRL",
    date_format: "DD/MM/YYYY",
  };
  const [local, setLocal] = useState(prefs);
  useEffect(() => {
    if (prefs) setLocal(prefs);
  }, [company]);

  async function save() {
    if (!companyId) return;
    const { error } = await supabase
      .from("companies")
      .update({ preferences: local } as any)
      .eq("id", companyId);
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
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
              <SelectItem value="en-US">English (US)</SelectItem>
              <SelectItem value="es-ES">Español</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Fuso horário">
          <Select value={local.timezone} onValueChange={(v) => setLocal({ ...local, timezone: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="America/Sao_Paulo">São Paulo (GMT-3)</SelectItem>
              <SelectItem value="America/Manaus">Manaus (GMT-4)</SelectItem>
              <SelectItem value="America/Rio_Branco">Rio Branco (GMT-5)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Moeda">
          <Select value={local.currency} onValueChange={(v) => setLocal({ ...local, currency: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BRL">Real (R$)</SelectItem>
              <SelectItem value="USD">Dólar (US$)</SelectItem>
              <SelectItem value="EUR">Euro (€)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Formato de data">
          <Select
            value={local.date_format}
            onValueChange={(v) => setLocal({ ...local, date_format: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DD/MM/YYYY">DD/MM/AAAA</SelectItem>
              <SelectItem value="MM/DD/YYYY">MM/DD/AAAA</SelectItem>
              <SelectItem value="YYYY-MM-DD">AAAA-MM-DD</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="flex justify-end">
        <Button onClick={save}>Salvar preferências</Button>
      </div>
    </Card>
  );
}

// ========================== SECURITY ==========================
function SecurityTab({ isAdmin, email }: { isAdmin: boolean; email?: string }) {
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");

  // States for system reset
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  const qc = useQueryClient();

  async function changePassword() {
    if (pwd.length < 8) return toast.error("Senha deve ter pelo menos 8 caracteres.");
    if (pwd !== pwd2) return toast.error("Senhas não conferem.");
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) return toast.error(error.message);
    toast.success("Senha alterada com sucesso.");
    setPwd("");
    setPwd2("");
  }

  async function signOutAll() {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) return toast.error(error.message);
    toast.success("Você foi desconectado de todos os dispositivos.");
  }

  async function handleStartReset() {
    try {
      setRequestingCode(true);
      setVerificationCode("");

      const { requestSystemResetCode } = await import("@/lib/api/security.functions");
      const res = await requestSystemResetCode();

      if (res.ok) {
        toast.success(`Código de verificação enviado para ${email || "seu e-mail"}!`);
        setResetDialogOpen(true);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao solicitar código de verificação.");
    } finally {
      setRequestingCode(false);
    }
  }

  async function handleConfirmReset() {
    if (verificationCode.trim().length !== 6) {
      return toast.error("Por favor, digite o código de 6 dígitos.");
    }

    try {
      setResetting(true);
      const { verifyAndResetSystem } = await import("@/lib/api/security.functions");
      const res = await verifyAndResetSystem({ data: { code: verificationCode.trim() } });

      if (res.ok) {
        toast.success("Sistema zerado com sucesso!");
        setResetDialogOpen(false);
        setVerificationCode("");

        // Invalidate queries to refresh UI and show empty state
        qc.invalidateQueries();
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao zerar o sistema.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-6 shadow-soft space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-[15px]">Alterar senha</h2>
        </div>
        <Field label="Nova senha">
          <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        </Field>
        <Field label="Confirmar nova senha">
          <Input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button onClick={changePassword}>
            <Lock className="h-3.5 w-3.5 mr-1.5" /> Alterar senha
          </Button>
        </div>
      </Card>

      <Card className="p-6 shadow-soft space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-[15px]">Sessões ativas</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Encerre todas as sessões em outros dispositivos.
        </p>
        <div className="flex justify-end">
          <Button variant="outline" onClick={signOutAll}>
            <LogOut className="h-3.5 w-3.5 mr-1.5" /> Sair de todos os dispositivos
          </Button>
        </div>
      </Card>

      <Card className="p-6 shadow-soft">
        <div className="flex items-center gap-2 mb-2">
          <UserCog className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-[15px]">Autenticação em 2 fatores</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Em breve. Adicione uma camada extra de segurança à sua conta.
        </p>
      </Card>

      {isAdmin && (
        <Card className="p-6 shadow-soft border border-destructive/20 bg-destructive/5 space-y-4">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            <h2 className="font-semibold text-[15px] text-destructive">
              Zerar Sistema (Reset de Testes)
            </h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Apague de forma definitiva todos os dados transacionais e de configuração (clientes,
            agendamentos, serviços, profissionais, lançamentos financeiros e outros usuários). A sua
            conta e dados de empresa serão mantidos.
          </p>
          <div className="flex justify-end">
            <Button variant="destructive" onClick={handleStartReset} disabled={requestingCode}>
              {requestingCode ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Solicitando código...
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Zerar Sistema
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* Dialog para Zerar Sistema */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Zerar Todo o Sistema
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Um código de segurança de 6 dígitos foi enviado para o e-mail cadastrado{" "}
              <strong>{email}</strong>.
            </p>
            <p className="text-sm text-destructive font-medium">
              Esta ação apagará permanentemente todos os clientes, agendamentos, serviços,
              profissionais, lançamentos financeiros e outros usuários.
            </p>

            <div className="space-y-2">
              <Label htmlFor="verification-code" className="text-xs">
                Código de Segurança
              </Label>
              <Input
                id="verification-code"
                placeholder="Ex: 123456"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                className="text-center tracking-widest font-mono text-lg text-black dark:text-white"
              />
            </div>


          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setResetDialogOpen(false)}
              disabled={resetting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmReset}
              disabled={resetting || verificationCode.trim().length !== 6}
            >
              {resetting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Limpando dados...
                </>
              ) : (
                "Confirmar Exclusão"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
      )}
      <span className={ok ? "" : "text-muted-foreground line-through"}>{children}</span>
    </li>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-6 text-center">{text}</p>;
}

// ========================== SERVICES TAB ==========================
const CATEGORIES = [
  "Sobrancelhas",
  "Lash",
  "Cabelo",
  "Barba",
  "Massagem",
  "Depilação",
  "Estética",
  "Unhas",
  "Outros",
];

const COLORS = [
  "#EC4899",
  "#A855F7",
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#6B7280",
  "#14B8A6",
];

const servicesSchema = z.object({
  name: z.string().trim().min(2, "Nome é obrigatório").max(120),
  price: z.coerce.number().min(0).max(100000),
  duration_minutes: z.coerce.number().int().min(5).max(600),
  return_days: z.coerce.number().int().min(1).max(365),
  category: z.string().optional().or(z.literal("")),
  color: z.string().optional().or(z.literal("")),
  description: z.string().max(500).optional().or(z.literal("")),
});
type ServicesFormVals = z.infer<typeof servicesSchema>;

function ServicesTab({ companyId, qc }: { companyId?: string; qc: any }) {
  const [editing, setEditing] = useState<any | null>(null);
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

  const metrics = useQuery({
    enabled: !!companyId,
    queryKey: ["service_metrics", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_metrics")
        .select("*")
        .eq("company_id", companyId!);
      return data ?? [];
    },
  });

  const top = useMemo(() => {
    const m = (metrics.data ?? []) as any[];
    const bySold = [...m].sort(
      (a, b) => Number(b.total_completed ?? 0) - Number(a.total_completed ?? 0),
    )[0];
    const byRev = [...m].sort(
      (a, b) => Number(b.total_revenue ?? 0) - Number(a.total_revenue ?? 0),
    )[0];
    const byRec = [...m].sort(
      (a, b) => Number(b.recurrence_ratio ?? 0) - Number(a.recurrence_ratio ?? 0),
    )[0];
    return { bySold, byRev, byRec };
  }, [metrics.data]);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(s: any) {
    setEditing(s);
    setOpen(true);
  }

  async function duplicateService(s: any) {
    if (!companyId) return;
    const { error } = await supabase.from("services").insert({
      company_id: companyId,
      name: `${s.name} (cópia)`,
      price: s.price,
      duration_minutes: s.duration_minutes,
      return_days: s.return_days,
      category: s.category,
      color: s.color,
      description: s.description,
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg tracking-tight">Serviços</h2>
          <p className="text-sm text-muted-foreground">
            A base de todo agendamento. O retorno ideal define quando contatar o cliente novamente.
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Novo serviço
        </Button>
      </header>

      {/* Top metrics */}
      <section className="grid gap-3 sm:grid-cols-3">
        <ServicesMetricCard
          icon={Trophy}
          label="Mais vendido"
          title={top.bySold?.name ?? null}
          hint={top.bySold ? `${Number(top.bySold.total_completed ?? 0)} atendimentos` : "—"}
        />
        <ServicesMetricCard
          icon={TrendingUp}
          label="Maior faturamento"
          title={top.byRev?.name ?? null}
          hint={top.byRev ? formatBRL(Number(top.byRev.total_revenue ?? 0)) : "—"}
        />
        <ServicesMetricCard
          icon={Repeat}
          label="Maior recorrência"
          title={top.byRec?.name ?? null}
          hint={
            top.byRec ? `${Number(top.byRec.recurrence_ratio ?? 0).toFixed(1)}× por cliente` : "—"
          }
        />
      </section>

      <Card className="p-4 shadow-soft">
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>
        ) : !list.data?.length ? (
          <div className="py-16 text-center">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
              <Scissors className="h-5 w-5" />
            </div>
            <p className="mt-3 font-medium">Nenhum serviço cadastrado</p>
            <Button className="mt-3" onClick={openCreate}>
              Criar primeiro serviço
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {list.data.map((s: any) => (
              <li key={s.id} className="py-3 flex items-center gap-3">
                <span
                  className="h-9 w-1.5 rounded-full shrink-0"
                  style={{ background: s.color ?? "hsl(var(--primary))" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate text-sm">{s.name}</p>
                    {s.category && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5">
                        {s.category}
                      </Badge>
                    )}
                    {!s.active && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0.5">
                        Inativo
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {s.duration_minutes}min · retorno em {s.return_days} dias
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums">{formatBRL(Number(s.price))}</p>
                <Switch checked={s.active} onCheckedChange={(v) => toggleActive(s.id, v)} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(s)}>Editar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => duplicateService(s)}>
                      Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleActive(s.id, !s.active)}>
                      {s.active ? "Desativar" : "Ativar"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => removeService(s.id)}
                    >
                      Excluir
                    </DropdownMenuItem>
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

function ServicesMetricCard({
  icon: Icon,
  label,
  title,
  hint,
}: {
  icon: any;
  label: string;
  title?: string | null;
  hint: string;
}) {
  return (
    <Card className="p-4 shadow-soft">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-primary">
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-2 font-semibold truncate text-sm">{title ?? "—"}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

function ServiceDialog({
  open,
  onOpenChange,
  editing,
  companyId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: any;
  companyId?: string;
  onSaved: () => void;
}) {
  const form = useForm<ServicesFormVals>({
    resolver: zodResolver(servicesSchema),
    values: editing
      ? {
          name: editing.name,
          price: Number(editing.price),
          duration_minutes: editing.duration_minutes,
          return_days: editing.return_days,
          category: editing.category ?? "",
          color: editing.color ?? "",
          description: editing.description ?? "",
        }
      : {
          name: "",
          price: 0,
          duration_minutes: 60,
          return_days: 30,
          category: "",
          color: COLORS[0],
          description: "",
        },
  });

  async function onSubmit(v: ServicesFormVals) {
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
        <DialogHeader>
          <DialogTitle>{editing ? "Editar serviço" : "Novo serviço"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input {...form.register("name")} placeholder="Ex: Design de Sobrancelhas" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Preço (R$) *</Label>
              <Input type="number" step="0.01" {...form.register("price")} />
            </div>
            <div className="space-y-2">
              <Label>Duração (min) *</Label>
              <Input type="number" {...form.register("duration_minutes")} />
            </div>
            <div className="space-y-2">
              <Label>Retorno (dias) *</Label>
              <Input type="number" {...form.register("return_days")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Controller
                control={form.control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <Controller
                control={form.control}
                name="color"
                render={({ field }) => (
                  <div className="flex gap-1.5 pt-1">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => field.onChange(c)}
                        className={`h-7 w-7 rounded-full border-2 ${field.value === c ? "border-foreground" : "border-transparent"}`}
                        style={{ background: c }}
                        aria-label={c}
                      />
                    ))}
                  </div>
                )}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea {...form.register("description")} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
