/**
 * DIAGNÓSTICO DO PASSIVO DE ATENDIMENTO — somente leitura, não envia nada.
 *
 * Responde, com número, três perguntas que decidem se vale construir a camada
 * de campanha contínua / ontologia:
 *
 *   1. A base fria tem atributo suficiente para ser segmentada? (ou é só nome+telefone)
 *   2. Qual o tamanho do passivo morno — gente que já falou com a gente e ficou
 *      sem próximo passo, prometeu documento e sumiu, ou teve o callback
 *      apagado pelo bug do concierge (whatsapp-concierge.ts: followup_due_at
 *      é zerado a cada resposta do lead e só reabre se a IA reemitir a promessa)?
 *   3. Quanta pendência é NOSSA (não precisa mandar mensagem nenhuma para
 *      resolver): cliente sem assessor, lead aprovado que não saiu do Kanban,
 *      ficha submetida sem decisão registrada.
 *
 * O resultado alimenta a decisão de prioridade dos ~250 envios/dia (tier da Meta).
 *
 *   node scripts/diagnostico-passivo-atendimento.mjs
 *   node scripts/diagnostico-passivo-atendimento.mjs --csv outputs/passivo.csv
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

// ── env ──────────────────────────────────────────────────────────────────────
const ROOT = process.cwd()
for (const file of ['.env.local', '.env']) {
  const p = path.join(ROOT, file)
  if (!fs.existsSync(p)) continue
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
}
const CSV = (() => { const i = process.argv.indexOf('--csv'); return i >= 0 ? process.argv[i + 1] : null })()
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const NOW = Date.now()
const DIA = 86_400_000
const dias = (iso) => (iso ? Math.floor((NOW - new Date(iso).getTime()) / DIA) : null)
const str = (v) => String(v ?? '').trim()
const pct = (n, total) => total > 0 ? `${(100 * n / total).toFixed(1)}%` : '—'

/** Espelha whatsapp-central.phoneVariants. */
function phoneVariants(phone) {
  const v = new Set(); const d = String(phone ?? '').replace(/\D/g, ''); if (!d) return []
  v.add(d); if (d.startsWith('55')) v.add(d.slice(2)); else v.add(`55${d}`)
  const wo = d.startsWith('55') ? d.slice(2) : d
  if (wo.length === 11 && wo[2] === '9') { const x = wo.slice(0, 2) + wo.slice(3); v.add(x); v.add(`55${x}`) }
  else if (wo.length === 10) { const x = wo.slice(0, 2) + '9' + wo.slice(2); v.add(x); v.add(`55${x}`) }
  return [...v]
}
/** Número obviamente inválido (pouca variação de dígitos). */
function junkPhone(phone) {
  const d = String(phone ?? '').replace(/\D/g, '')
  if (!d) return true
  const nat = d.startsWith('55') ? d.slice(2) : d
  if (nat.length < 10 || nat.length > 11) return true
  return new Set(nat.split('')).size <= 2
}
function normStatus(s) {
  const k = str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (!k || k === 'lead' || k === 'sem status') return 'ENTRADA'
  return str(s).toUpperCase()
}

async function fetchAll(table, cols) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(cols).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

console.log('coletando…')
const [leads, msgs, docs, clientes, cadastros] = await Promise.all([
  fetchAll('crm_leads', 'id, nome, telefone, celular, status, arquivado, optout_whatsapp, handoff_humano, cpf, inscricao_estadual, tem_inscricao_estadual, estado, cidade, quantidade_animais, momento_pecuaria, interesse_principal, o_que_busca, origem, responsavel, last_whatsapp_at, created_at, extra_data'),
  fetchAll('whatsapp_messages', 'lead_id, phone, direction, created_at, intent, bot_step, origin'),
  fetchAll('crm_lead_documentos', 'lead_id, tipo, created_at'),
  fetchAll('clientes', 'match_key, nome, uf, responsavel, status, crm_lead_id'),
  fetchAll('cliente_leiloeira_cadastro', 'cliente_key, leiloeira_id, status, enviado_at, aprovado_at, created_at'),
])

// ── índice de mensagens por lead (por lead_id e por variante de telefone) ────
const porLead = new Map()   // leadId -> { in, out, lastIn, lastOut }
const porFone = new Map()   // variante -> mesmo shape
const bump = (map, key, m) => {
  if (!key) return
  let a = map.get(key)
  if (!a) { a = { in: 0, out: 0, lastIn: null, lastOut: null }; map.set(key, a) }
  if (m.direction === 'inbound') { a.in++; if (!a.lastIn || m.created_at > a.lastIn) a.lastIn = m.created_at }
  else { a.out++; if (!a.lastOut || m.created_at > a.lastOut) a.lastOut = m.created_at }
}
for (const m of msgs) {
  bump(porLead, m.lead_id, m)
  const d = String(m.phone ?? '').replace(/\D/g, '')
  if (d) bump(porFone, d, m)
}
function atividade(lead) {
  const base = porLead.get(lead.id)
  const acc = { in: base?.in ?? 0, out: base?.out ?? 0, lastIn: base?.lastIn ?? null, lastOut: base?.lastOut ?? null }
  for (const v of phoneVariants(lead.celular || lead.telefone)) {
    const a = porFone.get(v); if (!a) continue
    acc.in += a.in; acc.out += a.out
    if (a.lastIn && (!acc.lastIn || a.lastIn > acc.lastIn)) acc.lastIn = a.lastIn
    if (a.lastOut && (!acc.lastOut || a.lastOut > acc.lastOut)) acc.lastOut = a.lastOut
  }
  return acc
}

const docsPorLead = new Map()
for (const d of docs) {
  if (!d.lead_id) continue
  if (!docsPorLead.has(d.lead_id)) docsPorLead.set(d.lead_id, new Set())
  docsPorLead.get(d.lead_id).add(str(d.tipo) || 'outro')
}

const ativos = leads.filter(l => !l.arquivado)
const H = (t) => console.log(`\n${'═'.repeat(74)}\n${t}\n${'═'.repeat(74)}`)
const L = (rot, n, base) => console.log(`  ${String(n).padStart(6)}  ${base ? pct(n, base).padStart(6) : '      '}  ${rot}`)

// ── 1. anatomia da base ──────────────────────────────────────────────────────
H('1 · ANATOMIA DA BASE — dá para segmentar?')
console.log(`  total ${leads.length} | arquivados ${leads.length - ativos.length} | ATIVOS ${ativos.length}`)
const T = ativos.length
console.log('')
const porEtapa = {}
for (const l of ativos) { const e = normStatus(l.status); porEtapa[e] = (porEtapa[e] ?? 0) + 1 }
for (const [e, n] of Object.entries(porEtapa).sort((a, b) => b[1] - a[1])) L(`etapa ${e}`, n, T)

console.log('')
const temAtributo = (l) => !!(str(l.cpf) || str(l.inscricao_estadual) || str(l.estado) ||
  str(l.quantidade_animais) || str(l.momento_pecuaria) || str(l.o_que_busca))
const comAtrib = ativos.filter(temAtributo)
const foneRuim = ativos.filter(l => junkPhone(l.celular || l.telefone))
L('com ALGUM atributo de qualificação', comAtrib.length, T)
L('SÓ nome + telefone (insegmentável)', T - comAtrib.length, T)
L('telefone ausente/inválido', foneRuim.length, T)
L('opt-out', ativos.filter(l => l.optout_whatsapp).length, T)
L('com CPF', ativos.filter(l => str(l.cpf)).length, T)
L('com I.E. preenchida', ativos.filter(l => str(l.inscricao_estadual)).length, T)
L('com UF', ativos.filter(l => str(l.estado)).length, T)

console.log('\n  origem (top 8):')
const porOrigem = {}
for (const l of ativos) { const o = str(l.origem) || '(sem origem)'; porOrigem[o] = (porOrigem[o] ?? 0) + 1 }
for (const [o, n] of Object.entries(porOrigem).sort((a, b) => b[1] - a[1]).slice(0, 8)) L(o.slice(0, 58), n, T)

// ── 2. relacionamento ────────────────────────────────────────────────────────
H('2 · RELACIONAMENTO — quem já falou com a gente')
const at = new Map(ativos.map(l => [l.id, atividade(l)]))
const nunca = ativos.filter(l => at.get(l.id).out === 0 && at.get(l.id).in === 0)
const semResposta = ativos.filter(l => at.get(l.id).out > 0 && at.get(l.id).in === 0)
const responderam = ativos.filter(l => at.get(l.id).in > 0)
L('NUNCA contatados (backlog frio)', nunca.length, T)
L('contatados e NUNCA responderam', semResposta.length, T)
L('JÁ RESPONDERAM ao menos uma vez', responderam.length, T)
const R = responderam.length
console.log(`\n  dentro dos ${R} que responderam:`)
const dSince = (l, campo) => dias(at.get(l.id)[campo])
L('falaram nos últimos 7 dias', responderam.filter(l => dSince(l, 'lastIn') <= 7).length, R)
L('últimos 8–30 dias', responderam.filter(l => { const d = dSince(l, 'lastIn'); return d > 7 && d <= 30 }).length, R)
L('31–90 dias', responderam.filter(l => { const d = dSince(l, 'lastIn'); return d > 30 && d <= 90 }).length, R)
L('mais de 90 dias', responderam.filter(l => dSince(l, 'lastIn') > 90).length, R)

// ── 3. o passivo ─────────────────────────────────────────────────────────────
H('3 · O PASSIVO — promessas e conversas sem próximo passo')
const xd = (l) => (l.extra_data ?? {})
const elegivel = (l) => !l.optout_whatsapp && !junkPhone(l.celular || l.telefone)

const promessaEvaporada = ativos.filter(l => {
  const x = xd(l)
  return x.retomada_combinada_at && !x.followup_due_at && !x.followup_sent_at && elegivel(l)
})
const desistenciaSilenciosa = ativos.filter(l => xd(l).followup_failed_at && elegivel(l))
const callbackVencido = ativos.filter(l => {
  const d = xd(l).followup_due_at
  return d && new Date(d).getTime() < NOW && elegivel(l)
})
L('A · prometeu retomar e o agendamento EVAPOROU', promessaEvaporada.length)
console.log('       (retomada_combinada_at existe, followup_due_at nulo, nunca disparou — o bug do :1209)')
L('B · desistência silenciosa (followup_failed_at)', desistenciaSilenciosa.length)
L('C · callback vencido e não disparado', callbackVencido.length)

const aceitouSemDoc = ativos.filter(l => {
  const x = xd(l)
  return (x.aceitou_assessoria === true || x.aceitou_assessoria_at) && !docsPorLead.has(l.id) && elegivel(l)
})
const docParcial = ativos.filter(l => {
  const n = docsPorLead.get(l.id)?.size ?? 0
  return n > 0 && n < 4 && elegivel(l)
})
L('D · aceitou a assessoria e NÃO enviou nenhum documento', aceitouSemDoc.length)
L('E · dossiê parcial (1–3 dos 4 documentos)', docParcial.length)

console.log('\n  F · responderam e estão sem NENHUMA mensagem nossa há:')
const ETAPAS_VIVAS = new Set(['CONEXÃO', 'CONEXAO', 'QUALIFICAÇÃO', 'QUALIFICACAO', 'INFORMAÇÕES CAPTADAS', 'INFORMACOES CAPTADAS', 'CADASTRO'])
const vivos = responderam.filter(l => ETAPAS_VIVAS.has(normStatus(l.status)) && elegivel(l) && !l.handoff_humano)
for (const corte of [7, 14, 30, 60]) {
  const n = vivos.filter(l => { const d = dSince(l, 'lastOut'); return d != null && d > corte }).length
  L(`  > ${corte} dias`, n, vivos.length)
}
console.log(`       (universo: ${vivos.length} leads em etapa viva, sem opt-out, sem handoff humano)`)

// ── 4. pendência nossa ───────────────────────────────────────────────────────
H('4 · PENDÊNCIA NOSSA — resolve sem mandar mensagem nenhuma')
const cliSemResp = clientes.filter(c => !str(c.responsavel))
const leadsCadastroAtivos = ativos.filter(l => normStatus(l.status) === 'CADASTRO')
const keysComCadastro = new Set(cadastros.map(c => c.cliente_key))
const cliSemCadastro = clientes.filter(c => !keysComCadastro.has(c.match_key))
const submetidoSemDecisao = cadastros.filter(c => c.status === 'enviado')
const decisoesReais = cadastros.filter(c => c.status !== 'enviado' && c.enviado_at)
L('clientes SEM assessor definido', cliSemResp.length, clientes.length)
L('leads em CADASTRO ainda no Kanban', leadsCadastroAtivos.length)
L('clientes sem NENHUM registro de cadastro em leiloeira', cliSemCadastro.length, clientes.length)
L('fichas submetidas aguardando decisão', submetidoSemDecisao.length)
L('decisões REAIS registradas (têm enviado_at)', decisoesReais.length, cadastros.length)
console.log(`       (${cadastros.length - decisoesReais.length} são backfill em lote, sem envio real)`)

// ── 5. filas priorizadas ─────────────────────────────────────────────────────
H('5 · FILAS PARA OS ~250 ENVIOS/DIA')
const ids = new Set()
const fila = (rot, arr) => {
  const novos = arr.filter(l => !ids.has(l.id))
  novos.forEach(l => ids.add(l.id))
  console.log(`  ${String(novos.length).padStart(6)}  ${rot}`)
  return novos
}
fila('1. promessa evaporada / callback vencido', [...promessaEvaporada, ...callbackVencido, ...desistenciaSilenciosa])
fila('2. dossiê parcial (falta documento específico)', docParcial)
fila('3. aceitou e nunca enviou documento', aceitouSemDoc)
fila('4. respondeu e está sem contato há >14d (etapa viva)', vivos.filter(l => { const d = dSince(l, 'lastOut'); return d != null && d > 14 }))
fila('5. dormentes: responderam, >30d, fora de etapa viva', responderam.filter(l => dSince(l, 'lastIn') > 30 && elegivel(l)))
fila('6. frio COM atributo (segmentável)', nunca.filter(l => temAtributo(l) && elegivel(l)))
fila('7. frio SEM atributo nenhum', nunca.filter(l => !temAtributo(l) && elegivel(l)))
console.log(`\n  total elegível acumulado: ${ids.size}`)
const mornos = promessaEvaporada.length + callbackVencido.length + desistenciaSilenciosa.length +
  docParcial.length + aceitouSemDoc.length +
  vivos.filter(l => { const d = dSince(l, 'lastOut'); return d != null && d > 14 }).length
console.log(`  filas 1–4 (o passivo MORNO): ~${mornos} pessoas → ${(mornos / 250).toFixed(1)} dias de cota`)

// ── CSV opcional ─────────────────────────────────────────────────────────────
if (CSV) {
  const marca = (l) => {
    const m = []
    if (promessaEvaporada.includes(l)) m.push('promessa_evaporada')
    if (callbackVencido.includes(l)) m.push('callback_vencido')
    if (desistenciaSilenciosa.includes(l)) m.push('desistencia_silenciosa')
    if (docParcial.includes(l)) m.push('dossie_parcial')
    if (aceitouSemDoc.includes(l)) m.push('aceitou_sem_doc')
    return m
  }
  const alvo = ativos.filter(l => marca(l).length)
  const linhas = [['id', 'nome', 'telefone', 'etapa', 'uf', 'motivos', 'dias_sem_resposta', 'dias_sem_contato_nosso', 'docs'].join(';')]
  for (const l of alvo) {
    const a = at.get(l.id)
    linhas.push([l.id, str(l.nome).replace(/;/g, ','), l.celular || l.telefone || '', normStatus(l.status),
      str(l.estado), marca(l).join('|'), dias(a.lastIn) ?? '', dias(a.lastOut) ?? '', docsPorLead.get(l.id)?.size ?? 0].join(';'))
  }
  fs.mkdirSync(path.dirname(CSV), { recursive: true })
  fs.writeFileSync(CSV, linhas.join('\n'), 'utf8')
  console.log(`\nCSV: ${CSV} (${alvo.length} linhas)`)
}
console.log('')
