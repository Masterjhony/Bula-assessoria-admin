import { NavCatalogo } from './_components/NavCatalogo'
import { HeroCatalogo } from './_components/HeroCatalogo'
import { Captura } from './_components/Captura'
import { Pagamento } from './_components/Pagamento'
import { Frete } from './_components/Frete'
import { RodapeCatalogo } from './_components/RodapeCatalogo'

// ─────────────────────────────────────────────────────────────────────────
// Landing do Leilão Touros São Geraldo e 7P — servida em
// saogeraldo.bulaassessoria.com.
//
// Único KPI: cadastro qualificado antes do leilão.
//
// REDESENHO DE 28/07. A página passou a reproduzir as TRÊS PRIMEIRAS PÁGINAS
// DO CATÁLOGO, com o formulário inserido entre a capa e as condições:
//
//   Nav ─ Hero (capa, pág. 1) ─ Captura ─ Pagamento (pág. 2) ─ Frete (pág. 3) ─ Rodapé
//
// O que saiu da composição, e por quê: `Pista`, `SubHero`, `ProvaSocial`,
// `Fecho` e `StickyCta` contavam uma narrativa de assessoria (o que se vende
// → como se compra → quem te ajuda → aja agora). O pedido agora é fidelidade
// ao impresso, e o impresso tem três páginas, não seis seções. Os arquivos
// continuam no repositório — não estão importados, então não entram no
// bundle — e o histórico do git guarda a versão que os usava.
//
// O QUE NÃO MUDOU, e é o que protege a conversão: o formulário é o mesmo
// `LeadForm` auditado, apontando para o mesmo `/api/saogeraldo/lead`, com os
// mesmos cinco eventos de funil, as mesmas UTMs e a mesma navegação hard para
// as páginas de obrigado. O redesenho é de superfície; o funil é o de antes.
//
// O formulário aparece UMA VEZ, em #cadastro. Todos os CTAs ancoram lá —
// duas instâncias duplicariam os eventos de funil.
// ─────────────────────────────────────────────────────────────────────────
export default function SaoGeraldoPage() {
  return (
    <>
      <NavCatalogo />
      <main>
        <HeroCatalogo />
        <Captura />
        <Pagamento />
        <Frete />
      </main>
      <RodapeCatalogo />
    </>
  )
}
