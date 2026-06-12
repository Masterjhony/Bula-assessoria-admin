export const metadata = {
  title: 'Politica de Privacidade | Bula Assessoria',
  description: 'Politica de privacidade da Bula Assessoria.',
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-900">
      <h1 className="text-3xl font-bold">Politica de Privacidade</h1>
      <p className="mt-4 text-sm text-slate-600">Ultima atualizacao: 12 de junho de 2026</p>

      <section className="mt-8 space-y-4 leading-7">
        <p>
          A Bula Assessoria utiliza dados fornecidos voluntariamente por clientes e leads para
          prestar atendimento, organizar campanhas, enviar comunicacoes comerciais solicitadas e
          administrar seus servicos digitais.
        </p>
        <p>
          Podemos coletar nome, telefone, e-mail, informacoes de interesse, origem do cadastro e
          historico de interacoes com nossos canais. Esses dados sao usados apenas para fins
          relacionados ao relacionamento comercial e operacional com a Bula Assessoria.
        </p>
        <p>
          Nao vendemos dados pessoais. Podemos compartilhar informacoes somente com fornecedores
          essenciais para hospedagem, automacao, mensageria, analise e seguranca, sempre no limite
          necessario para executar os servicos.
        </p>
        <p>
          O titular pode solicitar acesso, correcao ou exclusao de seus dados pelo e-mail
          <a className="font-semibold text-emerald-700" href="mailto:joaoeduardo.lp1@gmail.com"> joaoeduardo.lp1@gmail.com</a>.
        </p>
      </section>
    </main>
  )
}
