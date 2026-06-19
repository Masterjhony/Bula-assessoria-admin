// ─────────────────────────────────────────────────────────────────────────────
// Submissão de cadastro do cliente para as LEILOEIRAS parceiras (via e-mail).
// Quando um cliente fica pronto (vindo do CRM aprovado, ou manualmente pela aba
// Leiloeiras), envia um e-mail para o `email_cadastro` de cada leiloeira elegível
// com os dados do cliente + links dos documentos, e registra o envio em
// `cliente_leiloeira_cadastro` (status 'enviado'). Idempotente: não reenvia para
// quem já está 'enviado'/'aprovado'.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendMail } from '@/lib/email'
import { fmtCpf } from '@/lib/clientes'
import { coerceRequisitos, type LeiloeiraRequisitos } from '@/lib/leiloeiras'

const DOCS_BUCKET = 'cliente-documentos'

type ClienteRow = {
  match_key: string; nome: string; responsavel: string | null; telefone: string | null
  email: string | null; cidade: string | null; uf: string | null
  cpf: string | null; inscricao_estadual: string | null; tem_inscricao_estadual: string | null
  score_credito: number | null; score_faixa: string | null
  momento_pecuaria: string | null; operacao_pecuaria: string | null
}

type LeiloeiraRow = {
  id: string; nome: string; email_cadastro: string | null; requisitos: unknown; ativo: boolean | null
}

function meetsRequisitos(cli: ClienteRow, req: LeiloeiraRequisitos): boolean {
  if (req.requireIe && String(cli.tem_inscricao_estadual || '').toLowerCase() !== 'sim') return false
  if (req.scoreMin > 0 && (cli.score_credito ?? 0) < req.scoreMin) return false
  return true
}

function buildHtml(cli: ClienteRow, leiloeiraNome: string, docs: { nome: string; url: string }[]): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#666;font-size:13px">${label}</td><td style="padding:4px 0;font-size:13px"><b>${value || '—'}</b></td></tr>`
  const docsHtml = docs.length
    ? `<p style="margin:16px 0 6px;font-size:13px;color:#666">Documentos:</p><ul style="font-size:13px">${docs
        .map((d) => `<li><a href="${d.url}">${d.nome}</a></li>`)
        .join('')}</ul>`
    : '<p style="font-size:13px;color:#999">Nenhum documento anexado.</p>'

  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px">Solicitação de cadastro — ${leiloeiraNome}</h2>
    <p style="font-size:13px;color:#444">Segue abaixo a ficha do cliente indicado pela Bula Assessoria para cadastro em leilões.</p>
    <table style="border-collapse:collapse;margin-top:8px">
      ${row('Nome / Fazenda', cli.nome)}
      ${row('Responsável', cli.responsavel || '')}
      ${row('CPF', fmtCpf(cli.cpf || ''))}
      ${row('Inscrição Estadual', cli.inscricao_estadual || '')}
      ${row('Telefone', cli.telefone || '')}
      ${row('E-mail', cli.email || '')}
      ${row('Cidade/UF', `${cli.cidade || ''}${cli.uf ? '/' + cli.uf : ''}`)}
      ${row('Score de crédito', cli.score_credito != null ? String(cli.score_credito) : '')}
      ${row('Momento na pecuária', cli.momento_pecuaria || '')}
    </table>
    ${docsHtml}
    <p style="font-size:12px;color:#999;margin-top:20px">Enviado automaticamente pelo sistema da Bula Assessoria.</p>
  </div>`
}

export interface SubmissionResult {
  attempted: number
  sent: number
  skipped: { leiloeira: string; reason: string }[]
}

/**
 * Envia o cadastro do cliente para as leiloeiras.
 * @param leiloeiraIds limita a estas leiloeiras; se omitido, usa todas as ativas.
 */
export async function submitClienteToLeiloeiras(
  supabase: SupabaseClient,
  matchKey: string,
  leiloeiraIds?: string[],
): Promise<SubmissionResult> {
  const result: SubmissionResult = { attempted: 0, sent: 0, skipped: [] }
  if (!matchKey) return result

  const { data: cliData } = await supabase
    .from('clientes')
    .select('match_key, nome, responsavel, telefone, email, cidade, uf, cpf, inscricao_estadual, tem_inscricao_estadual, score_credito, score_faixa, momento_pecuaria, operacao_pecuaria')
    .eq('match_key', matchKey)
    .maybeSingle()
  const cli = cliData as ClienteRow | null
  if (!cli) return result

  let leiloeiraQuery = supabase
    .from('leiloeiras')
    .select('id, nome, email_cadastro, requisitos, ativo')
    .eq('ativo', true)
  if (leiloeiraIds?.length) leiloeiraQuery = leiloeiraQuery.in('id', leiloeiraIds)
  const { data: leiloeirasData } = await leiloeiraQuery
  const leiloeiras = (leiloeirasData ?? []) as LeiloeiraRow[]
  if (!leiloeiras.length) return result

  // estados já enviados/aprovados (idempotência)
  const { data: statusData } = await supabase
    .from('cliente_leiloeira_cadastro')
    .select('leiloeira_id, status')
    .eq('cliente_key', matchKey)
  const jaEnviado = new Set(
    (statusData ?? [])
      .filter((s: { status: string | null }) => s.status === 'enviado' || s.status === 'aprovado')
      .map((s: { leiloeira_id: string }) => s.leiloeira_id),
  )

  // links de documentos (signed URLs)
  const { data: docsData } = await supabase
    .from('cliente_documentos')
    .select('nome_arquivo, path')
    .eq('cliente_key', matchKey)
  const docs: { nome: string; url: string }[] = []
  for (const d of (docsData ?? []) as { nome_arquivo: string; path: string }[]) {
    const { data: signed } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(d.path, 7 * 86400)
    if (signed?.signedUrl) docs.push({ nome: d.nome_arquivo, url: signed.signedUrl })
  }

  for (const leiloeira of leiloeiras) {
    const req = coerceRequisitos(leiloeira.requisitos)
    if (jaEnviado.has(leiloeira.id) && !leiloeiraIds) {
      continue // já enviado e não foi um reenvio manual explícito
    }
    if (!leiloeira.email_cadastro) {
      result.skipped.push({ leiloeira: leiloeira.nome, reason: 'sem e-mail de cadastro' })
      continue
    }
    if (!meetsRequisitos(cli, req)) {
      result.skipped.push({ leiloeira: leiloeira.nome, reason: 'cliente não atende aos requisitos' })
      continue
    }

    result.attempted++
    try {
      const info = await sendMail({
        to: leiloeira.email_cadastro,
        subject: `Cadastro de cliente — ${cli.nome}`,
        html: buildHtml(cli, leiloeira.nome, docs),
      })
      await supabase.from('cliente_leiloeira_cadastro').upsert(
        {
          cliente_key: matchKey,
          leiloeira_id: leiloeira.id,
          status: 'enviado',
          enviado_at: new Date().toISOString(),
          email_message_id: (info as { messageId?: string })?.messageId || '',
        },
        { onConflict: 'cliente_key,leiloeira_id' },
      )
      result.sent++
    } catch (e) {
      result.skipped.push({
        leiloeira: leiloeira.nome,
        reason: `falha no envio: ${e instanceof Error ? e.message : 'erro'}`,
      })
    }
  }

  return result
}
