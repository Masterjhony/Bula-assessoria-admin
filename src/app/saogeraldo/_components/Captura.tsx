'use client'

import { dark, space, typo } from '../_lib/tokens'
import { copyCatalogo } from '../_lib/copy-catalogo'
import { Container } from './ui'
import { Secao, TituloSecao } from './ui-catalogo'
import { LeadForm } from './Formulario'

// ─────────────────────────────────────────────────────────────────────────
// CAPTURA — a seção que o catálogo não tem, e o único KPI da página.
//
// POR QUE ELA É CARVÃO PROFUNDO E NÃO CLARA, contrariando o desenho de
// referência: o `LeadForm` é o formulário auditado da página anterior, com
// 577 linhas, validação espelhada no servidor, cinco eventos de funil e uma
// navegação pós-submit que NÃO pode virar SPA. Reusá-lo inteiro é a decisão
// que protege a conversão — e ele é escuro por dentro.
//
// A alternativa (seção off-white) exigiria extrair o pipeline dele para
// vesti-lo de claro, e ainda reprovaria em contraste: champagne sobre
// off-white mede 2,44:1. Sobre este carvão profundo o mesmo champagne dá
// 7,53:1.
//
// O formulário aparece UMA VEZ na página. Duas instâncias duplicariam os
// eventos de funil; todos os CTAs ancoram aqui.
// ─────────────────────────────────────────────────────────────────────────

export function Captura() {
  return (
    <Secao superficie="profundo" id="cadastro">
      <Container>
        <TituloSecao eyebrow={copyCatalogo.captura.eyebrow}>
          {copyCatalogo.captura.titulo}
        </TituloSecao>

        <p
          style={{
            ...typo.body,
            color: dark.body,
            textAlign: 'center',
            maxWidth: 540,
            margin: `-${space.md} auto ${space.xl}`,
          }}
        >
          {copyCatalogo.captura.lede}
        </p>

        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <LeadForm />
        </div>
      </Container>
    </Secao>
  )
}
