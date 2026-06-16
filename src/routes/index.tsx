import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, Calendar, Heart, Sparkles, TrendingUp, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BeautyFlow — Recupere clientes e aumente seu faturamento" },
      {
        name: "description",
        content:
          "Plataforma de retenção para profissionais da beleza. Agenda, clientes e o módulo Retornos que recupera receita perdida.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg gradient-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            BeautyFlow
          </div>
          <div className="flex items-center gap-2">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Entrar</Button>
            </Link>
            <Link to="/auth">
              <Button size="sm">
                Começar grátis
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium text-secondary-foreground">
            <Heart className="h-3 w-3 text-primary" />
            Feito para profissionais da beleza
          </div>
          <h1 className="mt-6 text-balance text-4xl md:text-6xl font-bold tracking-tight">
            Recupere clientes.
            <br />
            <span className="bg-gradient-to-r from-primary to-[oklch(0.7_0.2_20)] bg-clip-text text-transparent">
              Aumente seu faturamento.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            O BeautyFlow avisa quando seu cliente está atrasado para voltar — antes que ele suma de
            vez. Simples como sua agenda, poderoso como um time de marketing.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="shadow-soft">
                Criar minha conta
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: TrendingUp,
              title: "Módulo Retornos",
              desc: "Veja quem está atrasado para voltar e a receita que pode recuperar hoje.",
            },
            {
              icon: Users,
              title: "Clientes em um lugar",
              desc: "Histórico, próximos retornos e total gasto, sem planilha.",
            },
            {
              icon: Calendar,
              title: "Agenda simples",
              desc: "Marque em segundos, no celular, sem complicação.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-card p-6 shadow-soft"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} BeautyFlow
      </footer>
    </div>
  );
}
