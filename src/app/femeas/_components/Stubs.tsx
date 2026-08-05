// ─────────────────────────────────────────────────────────────────────────
// ESQUELETO DA FASE 3 — placeholders, não conteúdo final.
//
// Cada stub aqui existe só para a rota /femeas renderizar 200 e para a ORDEM
// das seções ficar travada antes da copy chegar. O conteúdo real vem depois:
//
//   Hero, ProvaSocial, Fecho, Footer, StickyCta → Fase 7 (seções)
//   ParaQuem, Categorias, Jornada               → Fase 7, com copy da Fase 4
//
// Nenhuma string comercial aqui é definitiva (INV-5: toda copy comercial mora
// em _lib/copy.ts, que a Fase 4 escreve do zero). O que está escrito abaixo é
// rótulo de andaime, deliberadamente seco, para ninguém confundir com copy
// aprovada e mandar para o cliente por engano.
//
// Quando cada seção for implementada, ela sai daqui e vira arquivo próprio em
// _components/, seguindo o padrão de /touros e /saogeraldo. Este arquivo morre
// no fim da Fase 7.
// ─────────────────────────────────────────────────────────────────────────
import { dark } from '../_lib/tokens'

function Stub({
  id,
  titulo,
  fase,
  nota,
}: {
  id: string
  titulo: string
  fase: string
  nota: string
}) {
  return (
    <section
      id={id}
      style={{
        background: dark.bg,
        color: dark.body,
        borderBottom: `1px solid ${dark.hairline}`,
        padding: 'clamp(28px, 6vw, 56px) clamp(16px, 5vw, 40px)',
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: dark.gold,
            fontWeight: 600,
          }}
        >
          {fase}
        </div>
        <h2
          style={{
            color: dark.text,
            fontSize: 'clamp(20px, 3.4vw, 28px)',
            margin: '8px 0 6px',
            letterSpacing: '-0.01em',
          }}
        >
          {titulo}
        </h2>
        <p style={{ margin: 0, fontSize: 14, maxWidth: '60ch' }}>{nota}</p>
      </div>
    </section>
  )
}

export function Hero() {
  return (
    <Stub
      id="topo"
      fase="Stub · Fase 7"
      titulo="Hero — a promessa do criatório próprio"
      nota="Aqui entra a promessa central (montar a própria marca de Nelore PO) e o formulário de alto atrito, dentro do card, na 1ª dobra. O formulário é um só na página inteira (INV-7) e mora em #cadastro."
    />
  )
}

export function ParaQuem() {
  return (
    <Stub
      id="para-quem"
      fase="Stub · Fase 7 · copy da Fase 4"
      titulo="Para quem é e para quem NÃO é"
      nota="A seção que existe para filtrar. Precisa dizer com todas as letras que a Bula não atende quem procura fêmea de gado comercial nem quem quer volume de 50 a 70 cabeças — foi exatamente esse público que a rodada anterior atraiu. Sem suavizar: suavizar aqui desfaz a decisão do cliente."
    />
  )
}

export function Categorias() {
  return (
    <Stub
      id="categorias"
      fase="Stub · Fase 7 · copy da Fase 4"
      titulo="Categorias para iniciar o plantel"
      nota="Embriões, bezerras, novilhas, prenhes, pacote 3 em 1 (parida + prenha) e doadoras. As mesmas seis categorias aparecem no formulário. Facilidades a exibir: 30× no boleto e frete grátis."
    />
  )
}

export function Jornada() {
  return (
    <Stub
      id="jornada"
      fase="Stub · Fase 7 · copy da Fase 4"
      titulo="Como funciona — até a reunião com o assessor"
      nota="Formulário → pré-diagnóstico manual do SDR → cadastro aprovado → reunião agendada com um dos 3 assessores. A reunião cobre fazenda, projeto e orçamento, e é ela que direciona a categoria. O KPI do funil é reunião agendada, não cadastro."
    />
  )
}

export function ProvaSocial() {
  return (
    <Stub
      id="prova"
      fase="Stub · Fase 7"
      titulo="Prova social"
      nota="Assessoria técnica gratuita e acompanhamento especializado — a 'assessoria 360' (financeiro, acasalamento e o resto). Conteúdo a definir com o cliente; nada de número inventado."
    />
  )
}

export function Fecho() {
  return (
    <Stub
      id="fecho"
      fase="Stub · Fase 7"
      titulo="Fecho"
      nota="Último convite. Devolve o lead ao formulário do hero por âncora — não instancia um segundo formulário (INV-7)."
    />
  )
}

export function Footer() {
  return (
    <Stub
      id="rodape"
      fase="Stub · Fase 7"
      titulo="Rodapé"
      nota="Marca, links legais (privacidade, termos, exclusão de dados) e contato."
    />
  )
}

export function StickyCta() {
  return null
}
