import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Users, Bell, DollarSign, BarChart3, Wallet, Settings, Scissors, ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/funcionalidades")({
  head: () => ({
    meta: [
      { title: "Funcionalidades — BeautyFlow" },
      {
        name: "description",
        content:
          "Agenda, CRM de clientes, retornos automáticos, financeiro e relatórios. Tudo o que profissionais da beleza precisam em um só lugar.",
      },
      { property: "og:title", content: "Funcionalidades — BeautyFlow" },
      { property: "og:description", content: "Tudo o que profissionais da beleza precisam em um só lugar." },
      { property: "og:url", content: "https://beauty-flow-retention.lovable.app/funcionalidades" },
    ],
    links: [{ rel: "canonical", href: "https://beauty-flow-retention.lovable.app/funcionalidades" }],
  }),
  component: Funcionalidades,
});

const FEATURES = [
  { icon: Calendar, title: "Agenda Inteligente", desc: "Crie, edite, conclua e cancele atendimentos em segundos. Visualização por dia, semana e mês." },
  { icon: Users, title: "CRM de Clientes", desc: "Histórico completo, preferências, ticket médio e total gasto por cliente." },
  { icon: Bell, title: "Clientes para Retorno", desc: "Identificação automática de quem está atrasado. Lista priorizada por potencial de receita." },
  { icon: DollarSign, title: "Receita Recuperável", desc: "Veja quanto dinheiro está parado esperando uma mensagem sua." },
  { icon: Scissors, title: "Catálogo de Serviços", desc: "Preço, duração, retorno ideal e categoria. Tudo organizado." },
  { icon: Wallet, title: "Financeiro Simplificado", desc: "Receitas, despesas, lucro real e fluxo de caixa em uma tela." },
  { icon: BarChart3, title: "Indicadores", desc: "Saúde do negócio, top clientes, top serviços e funil de recuperação." },
  { icon: Settings, title: "Multi-empresa & Equipe", desc: "Gerencie equipe, papéis e várias unidades sem dor de cabeça." },
];

function Funcionalidades() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-12 text-center">
        <Badge variant="outline">Funcionalidades</Badge>
        <h1 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight">
          Tudo o que você precisa, sem complicação.
        </h1>
        <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
          O BeautyFlow reúne agenda, CRM, retornos automáticos e financeiro em uma plataforma feita
          para profissionais da beleza.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <Card key={f.title} className="p-6">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
          </Card>
        ))}
      </section>

      <section className="border-t border-border/60 bg-secondary/30 py-16 text-center">
        <h2 className="text-2xl md:text-3xl font-bold">Comece grátis hoje</h2>
        <Link to="/auth" className="mt-6 inline-block">
          <Button size="lg">Criar conta grátis <ArrowRight className="ml-1 h-4 w-4" /></Button>
        </Link>
      </section>
    </MarketingShell>
  );
}
