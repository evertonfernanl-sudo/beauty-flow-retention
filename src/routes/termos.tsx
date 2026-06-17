import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — BeautyFlow" },
      {
        name: "description",
        content: "Termos de uso do BeautyFlow: regras, responsabilidades, planos, cancelamento e suporte.",
      },
      { property: "og:title", content: "Termos de Uso — BeautyFlow" },
      { property: "og:type", content: "article" },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <MarketingShell>
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-bold tracking-tight">Termos de Uso</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: 17 de junho de 2026</p>

        <div className="prose prose-neutral mt-8 max-w-none dark:prose-invert">
          <h2>1. Aceitação</h2>
          <p>
            Ao criar uma conta no BeautyFlow você concorda com estes Termos e com a Política de Privacidade.
            Se não concordar, não utilize a plataforma.
          </p>

          <h2>2. Conta</h2>
          <p>
            Você é responsável pela veracidade dos dados cadastrais e pela segurança das suas credenciais.
            Notifique-nos imediatamente em caso de acesso indevido.
          </p>

          <h2>3. Planos, trial e cobrança</h2>
          <ul>
            <li>Novas empresas têm 14 dias de teste gratuito.</li>
            <li>Após o trial, a assinatura é cobrada de forma recorrente conforme o plano contratado.</li>
            <li>Cancelamentos podem ser feitos a qualquer momento nas Configurações.</li>
          </ul>

          <h2>4. Uso permitido</h2>
          <p>
            É proibido usar a plataforma para atividades ilegais, envio de spam, engenharia reversa,
            tentativa de comprometer a segurança ou violar dados de terceiros.
          </p>

          <h2>5. Propriedade dos dados</h2>
          <p>
            Os dados de clientes, agenda e financeiro pertencem à sua empresa. Você pode exportá-los ou
            solicitar a exclusão a qualquer momento.
          </p>

          <h2>6. Limitação de responsabilidade</h2>
          <p>
            O BeautyFlow é fornecido "como está". Não nos responsabilizamos por perdas indiretas, lucros
            cessantes ou indisponibilidades causadas por terceiros (provedores de infraestrutura, internet do
            usuário, etc.).
          </p>

          <h2>7. Alterações</h2>
          <p>
            Estes Termos podem ser atualizados. Mudanças relevantes serão comunicadas com 30 dias de
            antecedência por e-mail e dentro da plataforma.
          </p>

          <h2>8. Foro</h2>
          <p>Fica eleito o foro da Comarca de São Paulo/SP para dirimir quaisquer controvérsias.</p>
        </div>
      </main>
    </MarketingShell>
  );
}
