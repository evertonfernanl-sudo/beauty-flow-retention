import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — BeautyFlow" },
      {
        name: "description",
        content:
          "Como o BeautyFlow coleta, usa, armazena e protege os dados dos seus clientes, em conformidade com a LGPD.",
      },
      { property: "og:title", content: "Política de Privacidade — BeautyFlow" },
      { property: "og:type", content: "article" },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <MarketingShell>
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-bold tracking-tight">Política de Privacidade</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: 17 de junho de 2026</p>

        <div className="prose prose-neutral mt-8 max-w-none dark:prose-invert">
          <h2>1. Controlador de dados</h2>
          <p>
            BeautyFlow é o controlador dos dados pessoais coletados na plataforma. Em conformidade com a Lei
            Geral de Proteção de Dados (Lei 13.709/2018), tratamos seus dados com transparência, finalidade e
            base legal definidas.
          </p>

          <h2>2. Dados coletados</h2>
          <ul>
            <li>Cadastro: nome, e-mail, telefone, empresa.</li>
            <li>Operacionais: clientes, serviços, agendamentos e transações financeiras que você registra.</li>
            <li>Técnicos: IP, dispositivo, logs de acesso e cookies essenciais.</li>
          </ul>

          <h2>3. Finalidade</h2>
          <p>
            Usamos os dados para operar o serviço contratado, comunicar você sobre uso e cobrança, melhorar a
            plataforma e cumprir obrigações legais. Nunca vendemos dados de clientes finais.
          </p>

          <h2>4. Compartilhamento</h2>
          <p>
            Provedores que processam dados em nosso nome: hospedagem (Cloudflare/Supabase), e-mail
            transacional, processador de pagamentos e ferramentas de analytics (somente com seu consentimento
            via banner de cookies).
          </p>

          <h2>5. Seus direitos (LGPD)</h2>
          <ul>
            <li>Confirmação e acesso aos seus dados.</li>
            <li>Correção de dados incompletos ou desatualizados.</li>
            <li>Exportação dos dados em formato legível.</li>
            <li>Exclusão dos dados (com retenção mínima exigida por lei).</li>
            <li>Revogação de consentimento.</li>
          </ul>
          <p>
            Solicite qualquer um desses direitos nas Configurações da conta ou pelo e-mail{" "}
            <a href="mailto:privacidade@beautyflow.com.br">privacidade@beautyflow.com.br</a>.
          </p>

          <h2>6. Retenção e segurança</h2>
          <p>
            Mantemos backups diários por 30 dias. Os dados são armazenados com criptografia em trânsito (HTTPS)
            e em repouso, com Row-Level Security isolando cada empresa.
          </p>

          <h2>7. Cookies</h2>
          <p>
            Usamos cookies essenciais (sessão, autenticação) e, com seu consentimento, cookies analíticos
            (PostHog, GA4, Meta Pixel, Clarity). Você pode recusar a qualquer momento pelo banner de cookies.
          </p>

          <h2>8. Contato</h2>
          <p>
            Encarregado pelo Tratamento de Dados (DPO):{" "}
            <a href="mailto:dpo@beautyflow.com.br">dpo@beautyflow.com.br</a>.
          </p>
        </div>
      </main>
    </MarketingShell>
  );
}
