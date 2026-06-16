import { createFileRoute } from "@tanstack/react-router";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Configurações · BeautyFlow" }] }),
  component: SettingsPage,
});

const schema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(120),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

function SettingsPage() {
  const { data: profile } = useCurrentProfile();
  const queryClient = useQueryClient();
  const company = profile?.company;

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    values: { name: company?.name ?? "", email: "", phone: "" },
  });

  async function onSave(values: z.infer<typeof schema>) {
    if (!company?.id) return;
    const { error } = await supabase
      .from("companies")
      .update({
        name: values.name,
        email: values.email || null,
        phone: values.phone || null,
      })
      .eq("id", company.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Empresa atualizada");
    queryClient.invalidateQueries({ queryKey: ["current-profile"] });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie sua empresa e sua conta.</p>
      </header>

      <Card className="p-6 shadow-soft">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold text-[15px]">Empresa</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Dados visíveis para sua equipe.</p>
          </div>
          <Badge variant="secondary" className="uppercase tracking-wider text-[10px]">
            {company?.plan ?? "starter"}
          </Badge>
        </div>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Nome da empresa</Label>
            <Input id="company-name" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="company-email">E-mail de contato</Label>
              <Input id="company-email" type="email" {...form.register("email")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-phone">Telefone</Label>
              <Input id="company-phone" {...form.register("phone")} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>Salvar alterações</Button>
          </div>
        </form>
      </Card>

      <Card className="p-6 shadow-soft">
        <h2 className="font-semibold text-[15px]">Sua conta</h2>
        <div className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Nome</p>
            <p className="font-medium">{profile?.profile?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">E-mail</p>
            <p className="font-medium truncate">{profile?.email}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Papel</p>
            <p className="font-medium capitalize">{profile?.role ?? "—"}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
