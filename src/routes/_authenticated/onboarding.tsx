import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createCompanyForCurrentUser,
  seedDefaultServices,
  completeOnboarding,
} from "@/lib/api/onboarding.functions";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Check, Loader2, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Configuração inicial · BeautyFlow" }] }),
  component: Onboarding,
});

const schema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(120),
  phone: z.string().trim().max(40).optional(),
  ownerName: z.string().trim().min(2, "Informe seu nome").max(120),
});

function Onboarding() {
  const navigate = useNavigate();
  const profileQuery = useCurrentProfile();
  const createCompany = useServerFn(createCompanyForCurrentUser);
  const seed = useServerFn(seedDefaultServices);
  const complete = useServerFn(completeOnboarding);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);

  const profile = profileQuery.data;

  useEffect(() => {
    if (profile?.company?.onboarding_completed) {
      navigate({ to: "/app" });
    } else if (profile?.company) {
      setStep(2);
    }
  }, [profile, navigate]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
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

  async function submitStep1(values: z.infer<typeof schema>) {
    setSubmitting(true);
    try {
      await createCompany({ data: { name: values.name, phone: values.phone ?? null, ownerName: values.ownerName } });
      await profileQuery.refetch();
      setStep(2);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar empresa");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitStep2() {
    setSubmitting(true);
    try {
      await seed({ data: undefined });
      setStep(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar serviços");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitStep3() {
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

  return (
    <div className="min-h-screen flex items-center justify-center p-6 gradient-warm">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2 font-semibold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg gradient-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          BeautyFlow
        </div>

        <Steps current={step} />

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
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>Continuar<ArrowRight className="ml-1 h-4 w-4" /></>)}
              </Button>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <header>
                <h2 className="text-xl font-semibold">Seus serviços</h2>
                <p className="text-sm text-muted-foreground">
                  Vamos adicionar 5 serviços comuns para você começar. Você pode editar depois.
                </p>
              </header>
              <ul className="space-y-2 text-sm">
                {["Design de Sobrancelhas", "Design com Henna", "Lash Volume Brasileiro", "Manicure", "Pedicure"].map(
                  (s) => (
                    <li key={s} className="flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2">
                      <Check className="h-4 w-4 text-primary" /> {s}
                    </li>
                  ),
                )}
              </ul>
              <Button onClick={submitStep2} className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar e continuar"}
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <header>
                <h2 className="text-xl font-semibold">Tudo pronto 🎉</h2>
                <p className="text-sm text-muted-foreground">
                  Sua conta está configurada. Agora bora começar a cadastrar clientes e recuperar receita.
                </p>
              </header>
              <Button onClick={submitStep3} className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ir para o painel"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Steps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className={`h-1.5 flex-1 rounded-full ${n <= current ? "bg-primary" : "bg-border"}`}
        />
      ))}
    </div>
  );
}
