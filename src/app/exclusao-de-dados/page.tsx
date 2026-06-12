export const metadata = {
  title: 'Exclusao de Dados | Bula Assessoria',
  description: 'Instrucao para solicitar exclusao de dados pessoais.',
}

export default function DataDeletionPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-900">
      <h1 className="text-3xl font-bold">Exclusao de Dados</h1>
      <p className="mt-4 text-sm text-slate-600">Ultima atualizacao: 12 de junho de 2026</p>

      <section className="mt-8 space-y-4 leading-7">
        <p>
          Para solicitar a exclusao de dados pessoais tratados pela Bula Assessoria, envie uma
          mensagem para
          <a className="font-semibold text-emerald-700" href="mailto:joaoeduardo.lp1@gmail.com"> joaoeduardo.lp1@gmail.com</a>
          {' '}com o assunto "Exclusao de dados".
        </p>
        <p>
          Inclua no pedido o nome, telefone e e-mail usados no cadastro para que possamos localizar
          os registros. A solicitacao sera analisada e atendida conforme as obrigacoes legais e
          operacionais aplicaveis.
        </p>
        <p>
          Caso existam dados que precisem ser mantidos por obrigacao legal, contratual, fiscal ou
          de seguranca, eles serao preservados apenas pelo prazo necessario.
        </p>
      </section>
    </main>
  )
}
