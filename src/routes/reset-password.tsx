import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Definir Nova Senha · BeautyFlow" },
      { name: "description", content: "Crie uma nova senha de acesso segura para a sua conta." },
    ],
  }),
  component: ResetPasswordPage,
});

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "A senha deve ter pelo menos 8 caracteres")
      .refine((val) => /[A-Z]/.test(val), "A senha deve ter pelo menos uma letra maiúscula")
      .refine((val) => /[0-9]/.test(val), "A senha deve ter pelo menos um número"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

function ResetPasswordPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const passwordVal = form.watch("password") || "";

  useEffect(() => {
    let mounted = true;

    async function checkUser() {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;

      if (error || !data.user) {
        toast.error("Sua sessão expirou ou é inválida. Por favor, faça login.");
        navigate({ to: "/auth", replace: true });
        return;
      }

      setCheckingAuth(false);
    }

    checkUser();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  async function onSubmit(values: ResetPasswordInput) {
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: values.password,
        data: { password_reset_required: null }, // clear reset flag in user metadata
      });

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      toast.success("Senha atualizada com sucesso!");

      // Invalidate queries and router context
      await queryClient.invalidateQueries();
      router.invalidate();

      // Redirect to dashboard
      navigate({ to: "/app", replace: true });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar a senha");
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Verificando acesso…</p>
      </div>
    );
  }

  // Basic password checklist
  const hasMinLen = passwordVal.length >= 8;
  const hasUpper = /[A-Z]/.test(passwordVal);
  const hasNumber = /[0-9]/.test(passwordVal);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 lg:p-8">
      <div className="w-full max-w-md bg-card border shadow-xl rounded-2xl overflow-hidden relative">
        <div className="gradient-warm p-6 text-center text-foreground border-b relative">
          <div className="flex justify-center mb-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl gradient-primary text-primary-foreground shadow-glow">
              <Lock className="h-6 w-6" />
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Criar Nova Senha</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Por motivos de segurança, você deve definir uma senha definitiva para continuar.
          </p>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Nova Senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPwd ? "text" : "password"}
                placeholder="Mínimo de 8 caracteres"
                className="pr-10"
                {...form.register("password")}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPwd(!showPwd)}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {form.formState.errors.password && (
              <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showPwd2 ? "text" : "password"}
                placeholder="Digite a senha novamente"
                className="pr-10"
                {...form.register("confirmPassword")}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPwd2(!showPwd2)}
              >
                {showPwd2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {form.formState.errors.confirmPassword && (
              <p className="text-xs text-destructive">
                {form.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          {/* Password complexity checklist */}
          <div className="p-3 bg-muted/50 rounded-lg text-xs space-y-1.5 border">
            <p className="font-semibold text-muted-foreground">Requisitos da senha:</p>
            <div className="flex items-center gap-1.5">
              <CheckCircle2
                className={`h-3.5 w-3.5 ${hasMinLen ? "text-emerald-500" : "text-muted-foreground/50"}`}
              />
              <span className={hasMinLen ? "text-emerald-700" : "text-muted-foreground"}>
                Pelo menos 8 caracteres
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2
                className={`h-3.5 w-3.5 ${hasUpper ? "text-emerald-500" : "text-muted-foreground/50"}`}
              />
              <span className={hasUpper ? "text-emerald-700" : "text-muted-foreground"}>
                Pelo menos uma letra maiúscula
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2
                className={`h-3.5 w-3.5 ${hasNumber ? "text-emerald-500" : "text-muted-foreground/50"}`}
              />
              <span className={hasNumber ? "text-emerald-700" : "text-muted-foreground"}>
                Pelo menos um número
              </span>
            </div>
          </div>

          <Button type="submit" className="w-full shadow-glow" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar Senha e Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}
