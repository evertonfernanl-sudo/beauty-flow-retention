import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/planos")({
  head: () => ({
    meta: [
      { title: "Planos e preços — BeautyFlow" },
      {
        name: "description",
        content:
          "Planos do BeautyFlow a partir de R$ 49,90/mês. 14 dias grátis. Ideal para salão, designer de sobrancelhas, lash designer e estética.",
      },
      { property: "og:title", content: "Planos e preços — BeautyFlow" },
      { property: "og:description", content: "Comece grátis. Planos a partir de R$ 49,90/mês." },
      { property: "og:url", content: "https://beauty-flow-retention.lovable.app/planos" },
    ],
    links: [{ rel: "canonical", href: "https://beauty-flow-retention.lovable.app/planos" }],
  }),
  component: Planos,
});

const PLANS = [
  {
    name: "Starter",
    price: "49,90",
    desc: "Para quem está começando.",
    features: ["1 usuário", "Até 500 clientes", "Agenda", "Clientes para Retorno", "Financeiro", "Relatórios"],
  },
  {
    name: "Professional",
    price: "89,90",
    desc: "Mais popular para salões em crescimento.",
    featured: true,
    features: ["Até 5 usuários", "Até 3.000 clientes", "Tudo do Starter", "Integrações", "WhatsApp", "Suporte prioritário"],
  },
  {
    name: "Premium",
    price: "149,90",
    desc: "Para operações maiores.",
    features: ["Usuários ilimitados", "Clientes ilimitados", "Tudo do Professional", "IA (em breve)", "Recursos avançados"],
  },
];

function Planos() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-12 text-center">
        <Badge variant="outline">Planos</Badge>
        <h1 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight">Escolha o plano ideal</h1>
        <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
          14 dias grátis em qualquer plano. Sem cartão de crédito. Cancele quando quiser.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24 grid gap-6 md:grid-cols-3">
        {PLANS.map((p) => (
          <Card key={p.name} className={`relative p-6 ${p.featured ? "border-primary shadow-soft" : ""}`}>
            {p.featured && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gradient-primary text-primary-foreground border-0">
                Mais popular
              </Badge>
            )}
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-sm text-muted-foreground">R$</span>
              <span className="text-4xl font-bold">{p.price}</span>
              <span className="text-sm text-muted-foreground">/mês</span>
            </div>
            <Link to="/auth" className="mt-6 block">
              <Button className="w-full" variant={p.featured ? "default" : "outline"}>
                Começar grátis <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <ul className="mt-6 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </section>
    </MarketingShell>
  );
}
