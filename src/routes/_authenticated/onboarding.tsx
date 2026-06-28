import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createCompanyForCurrentUser,
  setCompanyVertical,
  seedDefaultServices,
  addProfessionals,
  updateWhatsappTemplate,
  completeOnboarding,
  registerCardAndPayInitial,
} from "@/lib/api/onboarding.functions";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles,
  Check,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Scissors,
  ShoppingBag,
  Dumbbell,
  Plus,
  Trash2,
  CreditCard,
  Lock,
  ShieldCheck,
  Briefcase,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Configuração inicial · BeautyFlow" }] }),
  component: Onboarding,
});

type Vertical = "BEAUTY" | "SALES" | "GYM" | "SERVICE" | "FINANCE";
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const TOTAL_STEPS = 7;

const VERTICALS: { id: Vertical; label: string; sub: string; Icon: typeof Scissors }[] = [
  {
    id: "BEAUTY",
    label: "Beleza & Estética",
    sub: "Sobrancelhas, lash, manicure, barbearia, clínica",
    Icon: Scissors,
  },
  {
    id: "SALES",
    label: "Vendas & Revenda",
    sub: "Cosméticos, perfumaria, skincare, suplementos",
    Icon: ShoppingBag,
  },
  {
    id: "GYM",
    label: "Academia & Estúdio",
    sub: "Academia, pilates, funcional, dança",
    Icon: Dumbbell,
  },
  {
    id: "SERVICE",
    label: "Service (Serviços)",
    sub: "Consultoria, assistência técnica, aulas, reformas",
    Icon: Briefcase,
  },
  {
    id: "FINANCE",
    label: "Organize sua Vida Financeira",
    sub: "Planejamento, investimentos, controle de contas",
    Icon: TrendingUp,
  },
];

const companySchema = z.object({
  ownerName: z.string().trim().min(2, "Informe seu nome").max(120),
  name: z.string().trim().min(2, "Nome muito curto").max(120),
  phone: z.string().trim().max(40).optional(),
});

function Onboarding() {
  const navigate = useNavigate();
  const profileQuery = useCurrentProfile();
  const profile = profileQuery.data;

  const createCompany = useServerFn(createCompanyForCurrentUser);
  const setVertical = useServerFn(setCompanyVertical);
  const seed = useServerFn(seedDefaultServices);
  const addPros = useServerFn(addProfessionals);
  const setWhats = useServerFn(updateWhatsappTemplate);
  const complete = useServerFn(completeOnboarding);
  const payInitial = useServerFn(registerCardAndPayInitial);

  const [step, setStep] = useState<Step>(1);
  const [vertical, setVerticalState] = useState<Vertical>("BEAUTY");
  const [submitting, setSubmitting] = useState(false);
  
  // Card registration states
  const [holderName, setHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");

  const handleCardNumberChange = (value: string) => {
    const clean = value.replace(/\D/g, "");
    const formatted = clean.match(/.{1,4}/g)?.join(" ") || "";
    setCardNumber(formatted.substring(0, 19));
  };

  const handleExpiryChange = (value: string) => {
    const clean = value.replace(/\D/g, "");
    if (clean.length <= 2) {
      setExpiry(clean);
    } else {
      setExpiry(`${clean.slice(0, 2)}/${clean.slice(2, 4)}`);
    }
  };

  const handleCvvChange = (value: string) => {
    const clean = value.replace(/\D/g, "");
    setCvv(clean.slice(0, 4));
  };

  async function submitCardPayment() {
    if (!holderName.trim()) return toast.error("Informe o nome do titular");
    if (cardNumber.replace(/\s+/g, "").length < 13) return toast.error("Informe um número de cartão válido");
    if (!expiry.match(/^\d{2}\/\d{2}$/)) return toast.error("Informe a validade no formato MM/AA");
    if (cvv.length < 3) return toast.error("Informe um CVV válido");

    setSubmitting(true);
    try {
      await payInitial({
        data: {
          holderName,
          cardNumber: cardNumber.replace(/\s+/g, ""),
          expiry,
          cvv,
        },
      });
      toast.success("Pagamento inicial de teste (R$ 0,01) processado! Cartão validado com sucesso.");
      setStep(7);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao processar pagamento");
    } finally {
      setSubmitting(false);
    }
  }

  const [pros, setPros] = useState<{ name: string; specialty: string; phone: string }[]>([
    { name: "", specialty: "", phone: "" },
  ]);
  const [waPhone, setWaPhone] = useState("");
  const [template, setTemplate] = useState(
    "Olá {{nome}}! Já faz um tempinho que você não aparece. Vamos marcar seu próximo horário?",
  );

  useEffect(() => {
    if (profile?.company?.onboarding_completed) {
      navigate({ to: "/app" });
    } else if (profile?.company) {
      // Already created — jump to vertical step if not chosen
      setStep(2);
      setVerticalState((profile.company.vertical as Vertical) ?? "BEAUTY");
      if (profile.company.whatsapp) setWaPhone(profile.company.whatsapp);
      if (profile.company.whatsapp_template) setTemplate(profile.company.whatsapp_template);
    }
  }, [profile, navigate]);

  const form = useForm<z.infer<typeof companySchema>>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: "",
      phone: "",
      ownerName: profile?.profile?.name ?? profile?.email?.split("@")[0] ?? "",
    },
  });

  useEffect(() => {
    if (profile?.profile?.name && !form.getValues("ownerName")) {
      form.setValue("ownerName", profile.profile.name);
    }
  }, [profile, form]);

  async function submitStep1(values: z.infer<typeof companySchema>) {
    setSubmitting(true);
    try {
      await createCompany({ data: { ...values, phone: values.phone ?? null, vertical } });
      await profileQuery.refetch();
      setStep(2);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar empresa");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitVertical() {
    setSubmitting(true);
    try {
      await setVertical({ data: { vertical } });
      await profileQuery.refetch();
      setStep(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitSeed() {
    setSubmitting(true);
    try {
      await seed({ data: undefined });
      setStep(4);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar ofertas");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPros() {
    setSubmitting(true);
    try {
      const valid = pros.filter((p) => p.name.trim().length >= 2);
      if (valid.length > 0) {
        await addPros({ data: { professionals: valid } });
      }
      setStep(5);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitWhats() {
    setSubmitting(true);
    try {
      await setWhats({ data: { whatsapp: waPhone, template } });
      setStep(6);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitFinish() {
    setSubmitting(true);
    try {
      await complete({ data: undefined });
      toast.success("Tudo pronto! 🎉");
      await profileQuery.refetch();
      navigate({ to: "/app" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSubmitting(false);
    }
  }

  const offeringLabel =
    vertical === "SALES"
      ? "produtos"
      : vertical === "GYM"
        ? "planos"
        : "serviços";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 gradient-warm">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center gap-2 font-semibold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg gradient-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          BeautyFlow
          <span className="ml-auto text-xs text-muted-foreground">
            Passo {step} de {TOTAL_STEPS}
          </span>
        </div>

        <StepBar current={step} total={TOTAL_STEPS} />

        <div className="mt-6 rounded-2xl border bg-card p-6 shadow-card">
          {step === 1 && (
            <form onSubmit={form.handleSubmit(submitStep1)} className="space-y-4">
              <header>
                <h2 className="text-xl font-semibold">Sua empresa</h2>
                <p className="text-sm text-muted-foreground">Como devemos chamar seu negócio?</p>
              </header>
              <div className="space-y-2">
                <Label htmlFor="ownerName">Seu nome</Label>
                <Input id="ownerName" {...form.register("ownerName")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nome do negócio</Label>
                <Input id="name" placeholder="Ex: Studio Luna" {...form.register("name")} />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">WhatsApp (opcional)</Label>
                <Input id="phone" placeholder="(11) 99999-9999" {...form.register("phone")} />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Continuar <ArrowRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <header>
                <h2 className="text-xl font-semibold">Qual o seu segmento?</h2>
                <p className="text-sm text-muted-foreground">
                  Isso ajusta tudo: ofertas, recorrência e relatórios.
                </p>
              </header>
              <div className="grid gap-3">
                {VERTICALS.map(({ id, label, sub, Icon }) => {
                  const active = vertical === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setVerticalState(id)}
                      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                        active
                          ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <span
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${active ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="flex-1">
                        <div className="font-medium">{label}</div>
                        <div className="text-xs text-muted-foreground">{sub}</div>
                      </div>
                      {active && <Check className="h-5 w-5 text-primary" />}
                    </button>
                  );
                })}
              </div>
              <NavRow onBack={() => setStep(1)} onNext={submitVertical} submitting={submitting} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <header>
                <h2 className="text-xl font-semibold">Suas {offeringLabel}</h2>
                <p className="text-sm text-muted-foreground">
                  Vamos adicionar uma lista inicial — você pode editar depois.
                </p>
              </header>
              <SeedPreview vertical={vertical} />
              <NavRow onBack={() => setStep(2)} onNext={submitSeed} submitting={submitting} />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <header>
                <h2 className="text-xl font-semibold">Profissionais</h2>
                <p className="text-sm text-muted-foreground">
                  Opcional. Adicione quem atende. Você pode pular se atende sozinho(a).
                </p>
              </header>
              <div className="space-y-3">
                {pros.map((p, i) => (
                  <div
                    key={i}
                    className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <Input
                      placeholder="Nome"
                      value={p.name}
                      onChange={(e) =>
                        setPros((prev) =>
                          prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)),
                        )
                      }
                    />
                    <Input
                      placeholder="Especialidade"
                      value={p.specialty}
                      onChange={(e) =>
                        setPros((prev) =>
                          prev.map((x, idx) =>
                            idx === i ? { ...x, specialty: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setPros((prev) => prev.filter((_, idx) => idx !== i))}
                      disabled={pros.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPros((prev) => [...prev, { name: "", specialty: "", phone: "" }])
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> Adicionar profissional
                </Button>
              </div>
              <NavRow
                onBack={() => setStep(3)}
                onNext={submitPros}
                submitting={submitting}
                nextLabel="Continuar"
              />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <header>
                <h2 className="text-xl font-semibold">WhatsApp</h2>
                <p className="text-sm text-muted-foreground">
                  Usamos seu número para abrir conversas com clientes via wa.me. Sem custo.
                </p>
              </header>
              <div className="space-y-2">
                <Label htmlFor="waPhone">Seu WhatsApp</Label>
                <Input
                  id="waPhone"
                  placeholder="(11) 99999-9999"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tmpl">Mensagem padrão de retorno</Label>
                <Textarea
                  id="tmpl"
                  rows={4}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use <code>{"{{nome}}"}</code> para inserir o nome do cliente.
                </p>
              </div>
              <NavRow onBack={() => setStep(4)} onNext={submitWhats} submitting={submitting} />
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <header>
                <h2 className="text-xl font-semibold">Ativação da Conta 💳</h2>
                <p className="text-sm text-muted-foreground">
                  Cadastre seu cartão para validar a cobrança inicial e ativar a conta.
                </p>
              </header>

              {/* Premium card preview */}
              <div className="relative overflow-hidden w-full h-44 rounded-xl bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-900 text-white p-5 shadow-lg mb-6 transition-all duration-300">
                <div className="flex justify-between items-start">
                  <div className="w-10 h-8 bg-amber-400/80 rounded-md flex items-center justify-center overflow-hidden">
                    <div className="w-8 h-6 border border-indigo-950/40 rounded flex flex-wrap" />
                  </div>
                  <div className="flex items-center gap-1 opacity-85">
                    <CreditCard className="h-4 w-4" />
                    <span className="text-xs font-mono font-bold">MOCK GATEWAY</span>
                  </div>
                </div>
                
                <div className="mt-8 text-lg font-mono tracking-widest text-center">
                  {cardNumber || "•••• •••• •••• ••••"}
                </div>
                
                <div className="mt-6 flex justify-between items-end">
                  <div>
                    <p className="text-[9px] text-indigo-200 uppercase tracking-wider">Titular</p>
                    <p className="text-xs font-semibold tracking-wide uppercase truncate max-w-[200px]">
                      {holderName || "NOME DO TITULAR"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-indigo-200 uppercase tracking-wider">Validade</p>
                    <p className="text-xs font-semibold tracking-wide font-mono">
                      {expiry || "MM/AA"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-muted rounded-lg border border-border flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-foreground">Pagamento inicial de teste (R$ 0,01)</p>
                  <p className="text-muted-foreground">
                    Para validar o funcionamento da cobrança, seu cartão será cobrado no valor de <strong>R$ 0,01</strong> (um centavo). Cobranças futuras do plano serão aplicadas apenas conforme configurado.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="cardHolder">Nome no Cartão</Label>
                  <Input
                    id="cardHolder"
                    placeholder="Ex: MARIA S SILVA"
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value.toUpperCase())}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="cardNum">Número do Cartão</Label>
                  <Input
                    id="cardNum"
                    placeholder="0000 0000 0000 0000"
                    value={cardNumber}
                    onChange={(e) => handleCardNumberChange(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="cardExpiry">Validade</Label>
                    <Input
                      id="cardExpiry"
                      placeholder="MM/AA"
                      value={expiry}
                      onChange={(e) => handleExpiryChange(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cardCvv">CVV</Label>
                    <Input
                      id="cardCvv"
                      placeholder="123"
                      value={cvv}
                      onChange={(e) => handleCvvChange(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <Button 
                  onClick={submitCardPayment} 
                  className="w-full flex items-center justify-center gap-2" 
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Validando cartão e cobrando R$ 0,01...
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      Confirmar Cartão e Pagar R$ 0,01
                    </>
                  )}
                </Button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline py-1 self-center"
                  onClick={() => setStep(5)}
                  disabled={submitting}
                >
                  Voltar para WhatsApp
                </button>
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4">
              <header>
                <h2 className="text-xl font-semibold">Tudo pronto 🎉</h2>
                <p className="text-sm text-muted-foreground">
                  Sua conta está configurada e ativada. Bora começar a recuperar clientes.
                </p>
              </header>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" /> Empresa criada
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" /> Segmento definido
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" /> {offeringLabel} adicionados
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" /> WhatsApp configurado
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" /> Cartão validado & Assinatura ativa (R$ 0,01 pagos)
                </li>
              </ul>
              <Button onClick={submitFinish} className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ir para o painel"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          className={`h-1.5 flex-1 rounded-full ${n <= current ? "bg-primary" : "bg-border"}`}
        />
      ))}
    </div>
  );
}

function NavRow({
  onBack,
  onNext,
  submitting,
  nextLabel = "Continuar",
}: {
  onBack: () => void;
  onNext: () => void;
  submitting: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="flex gap-2 pt-2">
      <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
      </Button>
      <Button type="button" className="flex-1" onClick={onNext} disabled={submitting}>
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            {nextLabel} <ArrowRight className="ml-1 h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}

function SeedPreview({ vertical }: { vertical: Vertical }) {
  const items: Record<Vertical, string[]> = {
    BEAUTY: [
      "Design de Sobrancelhas",
      "Design com Henna",
      "Lash Volume Brasileiro",
      "Manicure",
      "Pedicure",
    ],
    SALES: ["Perfume 100ml", "Hidratante Corporal", "Sérum Facial", "Kit Skincare", "Batom Matte"],
    GYM: ["Plano Mensal", "Plano Trimestral", "Plano Semestral", "Plano Anual"],
    SERVICE: ["Consultoria Geral", "Atendimento Técnico", "Suporte Especializado"],
    FINANCE: ["Planejamento Financeiro", "Análise de Investimentos", "Assessoria de Orçamento"],
  };
  return (
    <ul className="space-y-2 text-sm">
      {items[vertical].map((s) => (
        <li key={s} className="flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2">
          <Check className="h-4 w-4 text-primary" /> {s}
        </li>
      ))}
    </ul>
  );
}
