import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Blog — BeautyFlow" },
      {
        name: "description",
        content:
          "Conteúdo sobre retenção de clientes, gestão de salão, marketing para beleza, financeiro e tendências do setor.",
      },
      { property: "og:title", content: "Blog BeautyFlow — Retenção, gestão e marketing" },
      { property: "og:description", content: "Como crescer seu negócio de beleza." },
      { property: "og:url", content: "https://beauty-flow-retention.lovable.app/blog" },
    ],
    links: [{ rel: "canonical", href: "https://beauty-flow-retention.lovable.app/blog" }],
  }),
  component: Blog,
});

const CATEGORIES = ["Retenção de Clientes", "Gestão de Salão", "Marketing", "Beleza", "Financeiro"];

const POSTS = [
  {
    slug: "como-recuperar-clientes-inativos",
    cat: "Retenção de Clientes",
    title: "Como recuperar clientes inativos no seu salão",
    excerpt: "5 mensagens prontas de WhatsApp que trazem clientes de volta sem soar invasivo.",
  },
  {
    slug: "agenda-cheia-receita-estavel",
    cat: "Gestão de Salão",
    title: "Agenda cheia ≠ receita estável: o que ninguém te conta",
    excerpt: "Por que o ticket médio e a recorrência importam mais que o número de atendimentos.",
  },
  {
    slug: "marketing-para-designer-de-sobrancelhas",
    cat: "Marketing",
    title: "Marketing para designer de sobrancelhas: o guia prático",
    excerpt: "Como atrair, converter e reter clientes usando Instagram e WhatsApp.",
  },
  {
    slug: "precificacao-servicos-beleza",
    cat: "Financeiro",
    title: "Como precificar serviços de beleza sem perder dinheiro",
    excerpt: "Fórmula simples para calcular preço considerando custos, tempo e margem.",
  },
  {
    slug: "tendencias-lash-2026",
    cat: "Beleza",
    title: "Tendências de lash em 2026",
    excerpt: "O que está em alta e como adaptar seu portfólio de serviços.",
  },
  {
    slug: "checklist-fim-de-mes",
    cat: "Financeiro",
    title: "Checklist de fim de mês para o seu negócio de beleza",
    excerpt: "5 indicadores que você precisa olhar todo mês para crescer.",
  },
];

function Blog() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-12 text-center">
        <Badge variant="outline">Blog</Badge>
        <h1 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight">
          Cresça seu negócio de beleza
        </h1>
        <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
          Conteúdo prático sobre retenção, gestão, marketing e financeiro.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {CATEGORIES.map((c) => (
            <Badge key={c} variant="secondary" className="text-xs">
              {c}
            </Badge>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {POSTS.map((p) => (
          <Card key={p.slug} className="p-6 hover:shadow-soft transition-shadow flex flex-col">
            <div className="aspect-video rounded-lg bg-gradient-to-br from-primary/20 to-secondary mb-4" />
            <Badge variant="outline" className="self-start text-xs">
              {p.cat}
            </Badge>
            <h2 className="mt-3 text-lg font-semibold leading-tight">{p.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground flex-1">{p.excerpt}</p>
            <Link
              to="/blog"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Em breve <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Card>
        ))}
      </section>
    </MarketingShell>
  );
}
