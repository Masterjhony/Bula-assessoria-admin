export const metadata = {
  title: 'Termos de Servico | Bula Assessoria',
  description: 'Termos de uso dos servicos digitais da Bula Assessoria.',
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-900">
      <h1 className="text-3xl font-bold">Termos de Servico</h1>
      <p className="mt-4 text-sm text-slate-600">Ultima atualizacao: 12 de junho de 2026</p>

      <section className="mt-8 space-y-4 leading-7">
        <p>
          Ao utilizar os sites, formularios, paineis e canais de comunicacao da Bula Assessoria,
          voce concorda com estes termos e com o uso adequado das informacoes enviadas.
        </p>
        <p>
          As comunicacoes por WhatsApp, e-mail ou outros canais podem ser usadas para atendimento,
          relacionamento comercial, informativos e campanhas relacionadas aos servicos da Bula
          Assessoria. O usuario pode solicitar interrupcao do contato a qualquer momento.
        </p>
        <p>
          O acesso a areas administrativas e sistemas internos e restrito a usuarios autorizados.
          Qualquer uso indevido, tentativa de acesso nao autorizado ou compartilhamento indevido de
          credenciais pode resultar em bloqueio de acesso.
        </p>
        <p>
          Duvidas sobre estes termos podem ser enviadas para
          <a className="font-semibold text-emerald-700" href="mailto:joaoeduardo.lp1@gmail.com"> joaoeduardo.lp1@gmail.com</a>.
        </p>
      </section>
    </main>
  )
}
