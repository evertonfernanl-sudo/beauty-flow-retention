import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageCircle, MapPin } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/contato")({
  head: () => ({
    meta: [
      { title: "Contato — BeautyFlow" },
      { name: "description", content: "Fale com o time do BeautyFlow. Tire suas dúvidas sobre planos, integrações e como recuperar clientes." },
      { property: "og:title", content: "Contato — BeautyFlow" },
      { property: "og:description", content: "Fale com nosso time. Respondemos rápido." },
      { property: "og:url", content: "https://beauty-flow-retention.lovable.app/contato" },
    ],
    links: [{ rel: "canonical", href: "https://beauty-flow-retention.lovable.app/contato" }],
  }),
  component: Contato,
});

const schema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(100),
  email: z.string().trim().email("Email inválido").max(255),
  phone: z.string().trim().min(8, "Telefone inválido").max(20),
  profession: z.string().trim().min(2).max(100),
  message: z.string().trim().min(5).max(1000),
});

function Contato() {
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Verifique os campos");
      return;
    }
    setLoading(true);
    // TODO: integrar com captação de leads / email marketing
    await new Promise((r) => setTimeout(r, 600));
    toast.success("Recebemos sua mensagem! Em breve entraremos em contato.");
    e.currentTarget.reset();
    setLoading(false);
  }

  return (
    <MarketingShell>
      <section className="mx-auto max-w-5xl px-6 pt-20 pb-16">
        <div className="text-center">
          <Badge variant="outline">Contato</Badge>
          <h1 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight">Vamos conversar</h1>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Conte para a gente sobre seu negócio. Respondemos rápido.
          </p>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          <div className="space-y-4 md:col-span-1">
            <Card className="p-4">
              <Mail className="h-5 w-5 text-primary" />
              <p className="mt-2 text-sm font-semibold">Email</p>
              <p className="text-sm text-muted-foreground">contato@beautyflow.app</p>
            </Card>
            <Card className="p-4">
              <MessageCircle className="h-5 w-5 text-primary" />
              <p className="mt-2 text-sm font-semibold">WhatsApp</p>
              <p className="text-sm text-muted-foreground">Resposta em até 1 dia útil</p>
            </Card>
            <Card className="p-4">
              <MapPin className="h-5 w-5 text-primary" />
              <p className="mt-2 text-sm font-semibold">Atendimento</p>
              <p className="text-sm text-muted-foreground">100% online · Brasil</p>
            </Card>
          </div>

          <Card className="p-6 md:col-span-2">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" name="name" required maxLength={100} />
                </div>
                <div>
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" name="phone" required maxLength={20} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required maxLength={255} />
                </div>
                <div>
                  <Label htmlFor="profession">Profissão</Label>
                  <Input id="profession" name="profession" required maxLength={100} placeholder="Ex: Lash designer" />
                </div>
              </div>
              <div>
                <Label htmlFor="message">Mensagem</Label>
                <Textarea id="message" name="message" required maxLength={1000} rows={5} />
              </div>
              <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                {loading ? "Enviando..." : "Enviar mensagem"}
              </Button>
            </form>
          </Card>
        </div>
      </section>
    </MarketingShell>
  );
}
