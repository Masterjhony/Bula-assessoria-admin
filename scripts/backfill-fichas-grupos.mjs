/**
 * BACKFILL das fichas postadas manualmente nos grupos das leiloeiras.
 *
 * A ingestão em tempo real (parseFichaManual em leiloeira-whatsapp-cadastro.ts,
 * 18/08/2026) só vale daqui pra frente. Este script aplica o MESMO critério
 * conservador (mensagem com CPF + nome identificável) ao histórico já gravado
 * em whatsapp_messages (origin group-inbound) e cria as submissões que
 * faltam em cliente_leiloeira_cadastro.
 *
 * Se depois da ficha alguém escreveu "aprovado"/"Fulano - ok"/"Apto" no grupo,
 * o status já entra como aprovado (com decidido_at = data da mensagem).
 *
 * Dry-run por padrão; --apply grava.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')

const matchKey = nome => String(nome ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const fmtCpf = d => d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d

// espelho do parser de src/lib/leiloeira-whatsapp-cadastro.ts
const SAUDACAO_RE = /^(bom dia|boa tarde|boa noite|ol[áa]\b|oi\b|segue\b|seguem\b|ficha\b|cadastro\b|por favor|pfv\b|favor\b|dados\b|novo cadastro)/i
function parseFichaManual(text) {
  const t = String(text ?? '').trim()
  if (t.length < 10) return null
  const cpfM = /(\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/.exec(t)
  if (!cpfM) return null
  let nome = (/(?:^|\n)\s*(?:nome(?:\s+completo)?|cliente|comprador)\s*[:\-]\s*(.{3,90})/i.exec(t)?.[1] ?? '').trim()
  if (!nome) {
    for (const linhaRaw of t.split('\n')) {
      const linha = linhaRaw.trim()
      if (!linha || SAUDACAO_RE.test(linha)) continue
      const soLetras = /^[\p{L}][\p{L} '.\-]{5,89}$/u.test(linha)
      if (soLetras && linha.split(/\s+/).length >= 2 && !/\d/.test(linha)) { nome = linha; break }
      break
    }
  }
  if (!nome || matchKey(nome).split(' ').length < 2) return null
  const telM = /\(?\b(\d{2})\)?[\s.]?(9?\d{4})[-\s.]?(\d{4})\b/.exec(t.replace(cpfM[1], ''))
  const cidadeM = /([\p{L}][\p{L} .']{2,40})\s*[\/\-]\s*([A-Z]{2})\b/u.exec(t)
  return { nome, cpf: cpfM[1].replace(/\D/g, ''), telefone: telM ? `${telM[1]}${telM[2]}${telM[3]}` : null,
    cidade: cidadeM ? cidadeM[1].trim() : null, uf: cidadeM ? cidadeM[2] : null }
}
function parseDecisaoSimples(t) {
  if (/\b(reprovad\w*|recusad\w*|negad\w*|n[ãa]o\s+aprovad\w*|n[ãa]o\s+autorizad\w*)\b/i.test(t)) return 'recusado'
  if (/\baprovad\w*\b/i.test(t)) return 'aprovado'
  if (/(^|\n)\s*apt[oa]\s*[.!]?\s*(\n|$)/i.test(t)) return 'aprovado'
  const m = /^(.{3,120}?)\s*[-–—:]\s*(ok|okay|liberad\w*|autorizad\w*)\s*[.!]?$/i.exec(t.trim())
  if (m) return 'aprovado'
  return null
}

const { data: leiloeiras } = await sb.from('leiloeiras').select('id,nome,whatsapp_group_id').not('whatsapp_group_id', 'is', null)
const { data: existentes } = await sb.from('cliente_leiloeira_cadastro').select('leiloeira_id,cliente_key')
const jaTem = new Set((existentes || []).map(r => `${r.leiloeira_id}|${r.cliente_key}`))

let criadas = 0
for (const lei of leiloeiras || []) {
  // histórico completo do grupo, em ordem
  const msgs = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('whatsapp_messages')
      .select('id,body,name,created_at')
      .eq('phone', lei.whatsapp_group_id).eq('direction', 'inbound')
      .order('created_at', { ascending: true }).range(from, from + 999)
    msgs.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  console.log(`\n${lei.nome}: ${msgs.length} mensagens no histórico`)

  for (let i = 0; i < msgs.length; i++) {
    const ficha = parseFichaManual(msgs[i].body)
    if (!ficha) continue
    const key = matchKey(ficha.nome)
    const dedupe = `${lei.id}|${key}`
    if (jaTem.has(dedupe)) continue
    jaTem.add(dedupe)

    // procura decisão posterior no grupo que cite o nome (ou "aprovado" citando)
    let decisao = null, decisaoMsg = null, decisaoAt = null, decisaoPor = null
    for (let j = i + 1; j < msgs.length && j <= i + 400; j++) {
      const d = parseDecisaoSimples(msgs[j].body || '')
      if (!d) continue
      const hay = matchKey(msgs[j].body)
      const primeiroUltimo = key.split(' ')
      const citaNome = hay.includes(key) || (primeiroUltimo.length >= 2 && hay.includes(primeiroUltimo[0]) && hay.includes(primeiroUltimo[primeiroUltimo.length - 1]))
      if (citaNome) { decisao = d; decisaoMsg = msgs[j].body.slice(0, 500); decisaoAt = msgs[j].created_at; decisaoPor = msgs[j].name; break }
    }

    // lead por CPF > nome
    let leadId = null
    {
      const { data } = await sb.from('crm_leads').select('id').or(`cpf.eq.${ficha.cpf},cpf.eq.${fmtCpf(ficha.cpf)}`).limit(1)
      leadId = data?.[0]?.id ?? null
      if (!leadId) {
        const { data: d2 } = await sb.from('crm_leads').select('id').ilike('nome', ficha.nome).eq('arquivado', false).limit(1)
        leadId = d2?.[0]?.id ?? null
      }
    }

    criadas++
    console.log(`+ ${ficha.nome} (${ficha.uf || '?'}) · ${decisao ? decisao.toUpperCase() : 'enviado'}${leadId ? ' · lead ok' : ''} · postada ${String(msgs[i].created_at).slice(0, 10)}`)
    if (APPLY) {
      const { error } = await sb.from('cliente_leiloeira_cadastro').insert({
        cliente_key: key,
        leiloeira_id: lei.id,
        status: decisao || 'enviado',
        canal: 'whatsapp',
        enviado_at: msgs[i].created_at,
        crm_lead_id: leadId,
        ...(decisao ? { decidido_at: decisaoAt, decidido_por: (decisaoPor || '').slice(0, 120), decisao_msg: decisaoMsg } : {}),
        ...(decisao === 'aprovado' ? { aprovado_at: decisaoAt } : {}),
        observacoes: [
          `Backfill 18/08/2026: ficha postada manualmente no grupo por ${msgs[i].name || 'participante'} em ${String(msgs[i].created_at).slice(0, 10)}.`,
          ficha.cpf ? `CPF ${fmtCpf(ficha.cpf)}` : '', ficha.telefone ? `Fone ${ficha.telefone}` : '',
          ficha.cidade ? `${ficha.cidade}${ficha.uf ? '/' + ficha.uf : ''}` : '',
        ].filter(Boolean).join(' · '),
      })
      if (error) console.error('  ERRO: ' + error.message)
    }
  }
}
console.log(`\n-> ${criadas} submissões novas`)
console.log(APPLY ? 'APLICADO.' : 'DRY-RUN. Use --apply para gravar.')
