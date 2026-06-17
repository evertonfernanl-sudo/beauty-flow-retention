import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Calendar,
  Heart,
  Sparkles,
  TrendingUp,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  BarChart3,
  Wallet,
  Bell,
  Scissors,
  Eye,
  Hand,
  Flower2,
  ChevronRight,
  Quote,
  Star,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarketingShell } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BeautyFlow — Recupere clientes e aumente seu faturamento" },
      {
        name: "description",
        content:
          "Sistema para salão, designer de sobrancelhas, lash designer e estética. Veja quem deveria voltar hoje e quanto você pode recuperar. Teste 14 dias grátis.",
      },
      { property: "og:title", content: "BeautyFlow — Pare de perder clientes sem perceber" },
      {
        property: "og:description",
        content:
          "O BeautyFlow mostra quem deveria voltar, quem está atrasado e quanto dinheiro você pode recuperar.",
      },
      { property: "og:url", content: "https://beauty-flow-retention.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://beauty-flow-retention.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "BeautyFlow",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          offers: {
            "@type": "Offer",
            price: "49.90",
            priceCurrency: "BRL",
          },
          description:
            "Plataforma de retenção e recuperação de clientes para profissionais da beleza.",
        }),
      },
    ],
  }),
  component: Landing,
});

const PROFESSIONS = [
  { icon: Eye, label: "Designer de sobrancelhas" },
  { icon: Sparkles, label: "Lash designer" },
  { icon: Hand, label: "Manicure" },
  { icon: Hand, label: "Pedicure" },
  { icon: Flower2, label: "Depiladora" },
  { icon: Scissors, label: "Barbearia" },
  { icon: Scissors, label: "Salão" },
  { icon: Flower2, label: "Estética" },
];

function Landing() {
  return (
    <MarketingShell>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background" />
        <div className="mx-auto max-w-6xl px-6 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium">
            <Heart className="h-3 w-3 text-primary" />
            Feito para profissionais da beleza
          </div>
          <h1 className="mt-6 text-balance text-4xl md:text-6xl font-bold tracking-tight">
            Pare de perder clientes
            <br />
            <span className="bg-gradient-to-r from-primary to-[oklch(0.7_0.2_20)] bg-clip-text text-transparent">
              sem perceber.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            O BeautyFlow mostra quem deveria voltar, quem está atrasado e quanto dinheiro você pode
            recuperar — em uma única tela.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="shadow-soft">
                Começar Teste Grátis
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <a href="#demo">
              <Button size="lg" variant="outline">
                <Play className="mr-1 h-4 w-4" />
                Ver Demonstração
              </Button>
            </a>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            14 dias grátis · Sem cartão · Cancele quando quiser
          </p>

          {/* MOCKUPS PREVIEW */}
          <div className="mt-14 grid gap-4 md:grid-cols-3 text-left">
            <DashboardMockup />
            <ReturnsMockup />
            <AgendaMockup />
          </div>
        </div>
      </section>

      {/* PROVA SOCIAL */}
      <section className="border-y border-border/60 bg-secondary/30 py-12">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-center text-sm font-medium text-muted-foreground">
            Feito para profissionais da beleza
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-8">
            {PROFESSIONS.map((p) => (
              <div
                key={p.label}
                className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-3 text-center text-xs"
              >
                <p.icon className="h-5 w-5 text-primary" />
                <span className="text-muted-foreground">{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROBLEMA */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="text-destructive border-destructive/30">O problema</Badge>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight text-balance">
            Você trabalha duro para conquistar clientes.
            <br />
            <span className="text-muted-foreground">Mas quantos deles nunca voltam?</span>
          </h2>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-4">
          {[
            { icon: Clock, title: "Cliente esquece de voltar", desc: "Sem lembretes, sem retorno." },
            { icon: Calendar, title: "Agenda fica vazia", desc: "Horários parados é receita parada." },
            { icon: TrendingUp, title: "Faturamento oscila", desc: "Mês bom, mês ruim, sem padrão." },
            { icon: DollarSign, title: "Você perde dinheiro", desc: "Sem perceber, todo mês." },
          ].map((p) => (
            <Card key={p.title} className="p-6">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <p.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{p.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* SOLUÇÃO */}
      <section className="bg-secondary/30 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <Badge>A solução</Badge>
            <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight">
              O BeautyFlow acompanha seus clientes automaticamente.
            </h2>
          </div>
          <div className="mt-12 grid gap-3 md:grid-cols-6">
            {[
              "Atendimento",
              "Próximo retorno calculado",
              "Entra na lista de retorno",
              "Contato automático",
              "Novo agendamento",
              "Receita recuperada",
            ].map((step, i) => (
              <div key={step} className="relative">
                <Card className="h-full p-5">
                  <div className="text-xs font-medium text-primary">Etapa {i + 1}</div>
                  <p className="mt-2 text-sm font-semibold">{step}</p>
                </Card>
                {i < 5 && (
                  <ChevronRight className="hidden md:block absolute top-1/2 -right-3 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DIFERENCIAL */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Mais do que uma agenda.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Um sistema completo para gerenciar e fazer crescer seu negócio.
          </p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            { icon: Calendar, title: "Agenda Inteligente", desc: "Marque, edite e conclua atendimentos em segundos." },
            { icon: Users, title: "CRM de Clientes", desc: "Histórico completo, preferências e ticket médio." },
            { icon: Bell, title: "Clientes para Retorno", desc: "Veja quem deveria voltar hoje." },
            { icon: DollarSign, title: "Receita Recuperável", desc: "Saiba exatamente quanto pode recuperar." },
            { icon: BarChart3, title: "Relatórios", desc: "Indicadores que ajudam a decidir." },
            { icon: Wallet, title: "Financeiro Simplificado", desc: "Quanto entrou, saiu e sobrou." },
          ].map((d) => (
            <Card key={d.title} className="p-6 hover:shadow-soft transition-shadow">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <d.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{d.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* CLIENTES PARA RETORNO - DESTAQUE */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-background py-24">
        <div className="mx-auto max-w-6xl px-6 grid gap-12 md:grid-cols-2 items-center">
          <div>
            <Badge className="gradient-primary text-primary-foreground border-0">Diferencial</Badge>
            <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight text-balance">
              Descubra quem deveria voltar hoje.
            </h2>
            <p className="mt-4 text-muted-foreground">
              O BeautyFlow identifica automaticamente clientes atrasados e mostra quanto dinheiro
              você pode recuperar — sem você precisar fazer planilha, lembrete ou caderno.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Lista priorizada por potencial de receita",
                "WhatsApp em um clique com mensagem pronta",
                "Histórico de contatos e tentativas",
                "Acompanhamento da receita recuperada",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                  {b}
                </li>
              ))}
            </ul>
            <Link to="/auth" className="mt-8 inline-block">
              <Button size="lg">
                Começar agora <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <ReturnsHighlightMockup />
        </div>
      </section>

      {/* DEMO */}
      <section id="demo" className="mx-auto max-w-5xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline">Demonstração</Badge>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight">
            Veja o BeautyFlow em ação.
          </h2>
          <p className="mt-3 text-muted-foreground">
            90 segundos para entender como funciona.
          </p>
        </div>
        <div className="mt-10 aspect-video rounded-2xl border border-border bg-gradient-to-br from-secondary to-secondary/50 flex items-center justify-center shadow-soft">
          <button className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform">
            <Play className="h-6 w-6 ml-1" />
          </button>
        </div>
      </section>

      {/* BENEFÍCIOS */}
      <section className="bg-secondary/30 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-balance">
              Menos controle manual.
              <br />
              <span className="text-primary">Mais faturamento.</span>
            </h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              { t: "Organização", d: "Tudo num só lugar, sem caderno e sem planilha." },
              { t: "Mais retornos", d: "Identifica quem deveria voltar automaticamente." },
              { t: "Menos faltas", d: "Lembretes e confirmação para a cliente." },
              { t: "Histórico completo", d: "Atendimentos, valores e preferências." },
              { t: "Indicadores simples", d: "Entenda seu negócio em 30 segundos." },
              { t: "Controle financeiro", d: "Receitas, despesas e lucro real." },
            ].map((b) => (
              <Card key={b.t} className="p-6">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-semibold">{b.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{b.d}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARAÇÃO */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            BeautyFlow vs. métodos tradicionais
          </h2>
        </div>
        <div className="mt-10 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Recurso</th>
                <th className="px-4 py-3 text-center font-semibold">Caderno</th>
                <th className="px-4 py-3 text-center font-semibold">Excel</th>
                <th className="px-4 py-3 text-center font-semibold">WhatsApp</th>
                <th className="px-4 py-3 text-center font-semibold text-primary">BeautyFlow</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {["Agenda", "Clientes", "Retornos automáticos", "Financeiro", "Relatórios"].map((r) => (
                <tr key={r}>
                  <td className="px-4 py-3 font-medium">{r}</td>
                  <td className="px-4 py-3 text-center"><XCircle className="mx-auto h-4 w-4 text-muted-foreground" /></td>
                  <td className="px-4 py-3 text-center">{r === "Agenda" ? <XCircle className="mx-auto h-4 w-4 text-muted-foreground" /> : <XCircle className="mx-auto h-4 w-4 text-muted-foreground" />}</td>
                  <td className="px-4 py-3 text-center"><XCircle className="mx-auto h-4 w-4 text-muted-foreground" /></td>
                  <td className="px-4 py-3 text-center"><CheckCircle2 className="mx-auto h-4 w-4 text-primary" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* DEPOIMENTOS */}
      <section className="bg-secondary/30 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Quem usa, recomenda.
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { name: "Mariana Costa", role: "Designer de sobrancelhas", text: "Recuperei 12 clientes no primeiro mês. Pagou o ano inteiro do sistema." },
              { name: "Juliana Alves", role: "Lash designer", text: "Antes anotava em caderno e esquecia. Agora o BeautyFlow me avisa." },
              { name: "Patrícia Souza", role: "Salão de beleza", text: "Meu faturamento subiu 18% em 3 meses sem trabalhar mais." },
            ].map((t) => (
              <Card key={t.name} className="p-6">
                <Quote className="h-6 w-6 text-primary/40" />
                <p className="mt-3 text-sm">{t.text}</p>
                <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/30 to-primary/10" />
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                  <div className="ml-auto flex">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-3 w-3 fill-primary text-primary" />
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* PLANOS */}
      <section id="planos" className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Escolha o plano ideal.
          </h2>
          <p className="mt-3 text-muted-foreground">
            14 dias grátis em qualquer plano. Sem cartão de crédito.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <PlanCard
            name="Starter"
            price="49,90"
            features={["Agenda", "Clientes", "Serviços", "Retornos", "Financeiro", "Relatórios"]}
          />
          <PlanCard
            name="Professional"
            price="89,90"
            featured
            features={["Tudo do Starter", "Até 5 usuários", "Integrações", "Mais capacidade"]}
          />
          <PlanCard
            name="Premium"
            price="149,90"
            features={["Tudo do Professional", "IA (em breve)", "Recursos avançados", "Suporte prioritário"]}
          />
        </div>
      </section>

      {/* GARANTIA */}
      <section className="bg-secondary/30 py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Heart className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-2xl md:text-3xl font-bold tracking-tight">
            Teste grátis por 14 dias.
          </h2>
          <p className="mt-2 text-muted-foreground">
            Sem cartão. Sem compromisso. Sem letras miúdas.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-24">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Perguntas frequentes</h2>
        </div>
        <div className="mt-10 space-y-3">
          {[
            { q: "Posso cancelar quando quiser?", a: "Sim. Sem multa e sem fidelidade. Você cancela em um clique." },
            { q: "Preciso instalar algo?", a: "Não. Funciona direto no navegador, no celular ou computador." },
            { q: "Funciona no celular?", a: "Sim. O BeautyFlow é 100% responsivo e otimizado para mobile." },
            { q: "Posso importar meus clientes?", a: "Sim. Você pode importar de planilha ou cadastrar manualmente." },
            { q: "Meus dados estão seguros?", a: "Sim. Criptografia, backup automático e isolamento por empresa." },
          ].map((f) => (
            <details key={f.q} className="group rounded-xl border border-border bg-card p-5">
              <summary className="flex cursor-pointer items-center justify-between font-semibold">
                {f.q}
                <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="border-t border-border/60 bg-gradient-to-br from-primary/10 via-background to-background py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-balance">
            Comece a recuperar clientes hoje.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            14 dias grátis. Sem cartão. Sem complicação.
          </p>
          <Link to="/auth" className="mt-8 inline-block">
            <Button size="lg" className="shadow-soft">
              Criar Conta Grátis
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}

/* MOCKUPS */

function MockFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-soft overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border bg-secondary/50 px-3 py-2">
        <div className="h-2 w-2 rounded-full bg-destructive/60" />
        <div className="h-2 w-2 rounded-full bg-primary/40" />
        <div className="h-2 w-2 rounded-full bg-primary/60" />
        <span className="ml-2 text-xs text-muted-foreground">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function DashboardMockup() {
  return (
    <MockFrame title="Dashboard">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-primary/10 p-3">
            <p className="text-[10px] text-muted-foreground">Faturamento</p>
            <p className="text-base font-bold">R$ 8.420</p>
          </div>
          <div className="rounded-lg bg-secondary p-3">
            <p className="text-[10px] text-muted-foreground">Recuperável</p>
            <p className="text-base font-bold text-primary">R$ 2.350</p>
          </div>
        </div>
        <div className="flex items-end gap-1 h-16">
          {[40, 65, 50, 80, 70, 90, 75].map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-primary/60" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </MockFrame>
  );
}

function ReturnsMockup() {
  return (
    <MockFrame title="Clientes para Retorno">
      <div className="space-y-2">
        {[
          { n: "Maria", d: "45 dias", v: "R$ 80" },
          { n: "Ana", d: "60 dias", v: "R$ 120" },
          { n: "Carla", d: "38 dias", v: "R$ 95" },
        ].map((c) => (
          <div key={c.n} className="flex items-center gap-2 rounded-lg border border-border p-2">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary/40 to-primary/20" />
            <div className="flex-1">
              <p className="text-xs font-semibold">{c.n}</p>
              <p className="text-[10px] text-muted-foreground">Última: {c.d}</p>
            </div>
            <span className="text-xs font-bold text-primary">{c.v}</span>
          </div>
        ))}
      </div>
    </MockFrame>
  );
}

function AgendaMockup() {
  return (
    <MockFrame title="Agenda">
      <div className="space-y-2">
        {[
          { h: "09:00", c: "Júlia · Sobrancelha" },
          { h: "10:30", c: "Beatriz · Lash" },
          { h: "14:00", c: "Renata · Manicure" },
        ].map((a) => (
          <div key={a.h} className="flex items-center gap-3 rounded-lg bg-secondary/50 p-2">
            <span className="text-xs font-bold text-primary">{a.h}</span>
            <span className="text-xs">{a.c}</span>
          </div>
        ))}
      </div>
    </MockFrame>
  );
}

function ReturnsHighlightMockup() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Receita recuperável</p>
          <p className="text-3xl font-bold text-primary">R$ 2.350</p>
        </div>
        <Badge className="bg-primary/10 text-primary border-0">Este mês</Badge>
      </div>
      <div className="mt-5 space-y-2">
        {[
          { n: "Maria Silva", d: "Última visita há 45 dias", v: "R$ 80", urgent: false },
          { n: "Ana Costa", d: "Última visita há 60 dias", v: "R$ 120", urgent: true },
          { n: "Carla Mendes", d: "Última visita há 38 dias", v: "R$ 95", urgent: false },
          { n: "Beatriz Lima", d: "Última visita há 72 dias", v: "R$ 150", urgent: true },
        ].map((c) => (
          <div key={c.n} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/40 to-primary/10" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{c.n}</p>
              <p className="text-xs text-muted-foreground truncate">{c.d}</p>
            </div>
            {c.urgent && <Badge variant="outline" className="text-destructive border-destructive/40">Urgente</Badge>}
            <span className="text-sm font-bold text-primary">{c.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  features,
  featured,
}: {
  name: string;
  price: string;
  features: string[];
  featured?: boolean;
}) {
  return (
    <Card className={`relative p-6 ${featured ? "border-primary shadow-soft scale-[1.02]" : ""}`}>
      {featured && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gradient-primary text-primary-foreground border-0">
          Mais popular
        </Badge>
      )}
      <h3 className="text-lg font-semibold">{name}</h3>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-sm text-muted-foreground">R$</span>
        <span className="text-4xl font-bold tracking-tight">{price}</span>
        <span className="text-sm text-muted-foreground">/mês</span>
      </div>
      <Link to="/auth" className="mt-6 block">
        <Button className="w-full" variant={featured ? "default" : "outline"}>
          Começar grátis
        </Button>
      </Link>
      <ul className="mt-6 space-y-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            {f}
          </li>
        ))}
      </ul>
    </Card>
  );
}

