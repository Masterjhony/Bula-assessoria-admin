// Enriquece em lote os leads avançados (não recusados) por CPF — score, renda
// presumida, restrição (protestos) e imóveis rurais (CAFIR) — grava no CRM e
// manda a ficha (texto) no grupo de teste. Uso: node scripts/enriquece-fichas-lote.mjs
import { readFileSync } from 'node:fs'
import pg from 'pg'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const DD = 'https://apiv3.directd.com.br/api', TOK = env.DIRECTD_TOKEN
const FAPI = 'https://api.fiscalapi.com.br', FKEY = env.FISCALAPI_API_KEY
const GRUPO = '120363426815790951@g.us' // Workflows e Validações
const digits = v => String(v || '').replace(/\D/g, '')
const fmtCpf = c => { const d = digits(c); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : c }
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function dd(svc, p) { try { const u = new URL(`${DD}/${svc}`); for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v); u.searchParams.set('TOKEN', TOK); const r = await fetch(u, { signal: AbortSignal.timeout(60000) }); const j = await r.json().catch(() => null); return { msg: j?.metaDados?.mensagem, ret: j?.retorno } } catch (e) { return { msg: 'erro:' + e.message, ret: null } } }
async function cnir(cpf) { try { const u = new URL('/api/consultar-cnir', FAPI); u.searchParams.set('cpf', cpf); const r = await fetch(u, { headers: { 'X-API-Key': FKEY }, signal: AbortSignal.timeout(30000) }); return { http: r.status, body: JSON.parse(await r.text()) } } catch (e) { return { http: 0, body: null } } }
async function sendGrupo(message) { try { const r = await fetch(`${env.WHATSAPP_SERVER_URL}/send-group`, { method: 'POST', headers: { 'x-vps-token': env.WHATSAPP_SERVER_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ groupId: GRUPO, message }), signal: AbortSignal.timeout(20000) }); return (await r.json().catch(() => ({}))).queued } catch { return false } }

const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); await db.connect()
const { rows: cands } = await db.query(`
  select d.id, d.nome, d.cpf, d.celular, d.telefone, d.inscricao_estadual ie, d.extra_data,
    coalesce(d.score_serasa,(d.extra_data->'credito'->>'score')::numeric) score_atual,
    (select string_agg(x.tipo,', ') from crm_lead_documentos x where x.lead_id=d.id) docs,
    (select l.nome||' • '||c.status from cliente_leiloeira_cadastro c join leiloeiras l on l.id=c.leiloeira_id where c.crm_lead_id=d.id order by c.enviado_at desc nulls last limit 1) prog
  from crm_leads d
  where coalesce(d.arquivado,false)=false
    and length(regexp_replace(coalesce(d.cpf,''),'\\D','','g'))=11
    and d.nome <> 'Márcio de Vasconcelos Martins'
    and not exists (select 1 from cliente_leiloeira_cadastro c where c.crm_lead_id=d.id and c.status in ('recusado','aprovado'))
    and ( exists (select 1 from cliente_leiloeira_cadastro c where c.crm_lead_id=d.id)
          or (d.extra_data->>'habilitacao_notificada_at') is not null
          or (coalesce(d.extra_data->>'fazenda_nome','')<>'' or coalesce(d.extra_data->>'endereco_titular','')<>''))
  order by d.nome`)

console.log(`Candidatos a enriquecer + enviar: ${cands.length}`)
let enviados = 0, comRestricao = 0, semDados = 0, falhas = 0

for (const [i, d] of cands.entries()) {
  const CPF = digits(d.cpf)
  const x = d.extra_data || {}
  const [cad, sc, pr, cn] = await Promise.all([
    dd('CadastroPessoaFisica', { CPF }),
    d.score_atual ? Promise.resolve({ ret: { pessoaFisica: { score: Number(d.score_atual) } } }) : dd('Score', { CPF }),
    dd('ProtestosOnline', { CPF }),
    cnir(CPF),
  ])
  const score = sc.ret?.pessoaFisica?.score, faixa = sc.ret?.pessoaFisica?.faixaScore
  const nprot = pr.ret?.numeroTotalProtestos || 0, temProt = pr.ret?.constamProtestos
  const renda = cad.ret?.rendaFaixaSalarial, rendaEst = cad.ret?.rendaEstimada
  const imoveis = cn.body?.imoveis_cafir || []
  const fone = (cad.ret?.telefones || []).map(t => t.telefoneComDDD).filter(Boolean).slice(0, 2).join(' · ') || digits(d.celular || d.telefone)
  const email = (cad.ret?.emails || []).map(e => e.enderecoEmail || e.email).filter(Boolean)[0] || ''

  // ── persistência no CRM ──
  const extra = { ...x }
  extra.credito = { score: score ?? null, faixa: faixa ?? null, protestos: temProt ? [{ total: nprot }] : [], provider: 'directd', consultedAt: new Date().toISOString(), pending: false }
  if (renda) { extra.renda_presumida = renda; extra.renda_estimada = rendaEst ?? null }
  if (imoveis.length) {
    extra.fiscal = { ...(x.fiscal || {}), cnir: { total: imoveis.length, imoveis: imoveis.slice(0, 5), consultedAt: new Date().toISOString() } }
    const melhor = imoveis[0]
    if (!x.fazenda_nome && melhor?.denominacao) extra.fazenda_nome = melhor.denominacao
    if (!x.fazenda_cidade && melhor?.municipio_sede?.nome) extra.fazenda_cidade = melhor.municipio_sede.nome
    if (!x.fazenda_uf && melhor?.municipio_sede?.uf) extra.fazenda_uf = melhor.municipio_sede.uf
  }
  const patch = { extra_data: extra }
  if (score) patch.score_serasa = score
  await db.query(`update crm_leads set extra_data=$2, score_serasa=coalesce($3,score_serasa), updated_at=now() where id=$1`, [d.id, JSON.stringify(extra), score || null])

  // ── classifica ──
  const temPropriedade = imoveis.length > 0 || !!x.fazenda_nome
  const qualifica = score && renda && temPropriedade && !temProt
  const flag = temProt ? '⚠ COM RESTRIÇÃO' : (!qualifica ? '◽ dados incompletos' : '✅ apto')

  const imLinhas = imoveis.length
    ? imoveis.slice(0, 3).map(im => `  • ${im.denominacao || 'Imóvel'} — ${im.municipio_sede?.nome || ''}/${im.municipio_sede?.uf || ''} · ${im.area_total ? Number(im.area_total).toLocaleString('pt-BR') + ' ha' : ''} · NIRF ${im.nirf || '—'}`).join('\n')
    : `  • ${x.fazenda_nome ? `${x.fazenda_nome} ${[x.fazenda_cidade, x.fazenda_uf].filter(Boolean).join('/')} (informada)` : 'sem imóvel no CAFIR'}`

  const txt = [
    `📋 *FICHA PF — ${cad.ret?.nome || d.nome}*  [${flag}]`,
    `CPF ${fmtCpf(CPF)}${cad.ret?.idade ? ` · ${cad.ret.idade} anos` : ''}`,
    ``,
    `💳 *Crédito*`,
    `  • Score: *${score || '—'}*${faixa ? ` — ${faixa}` : ''}`,
    `  • Restrição: ${temProt ? `⚠ ${nprot} protesto(s)` : '✅ nada consta'}`,
    `  • Renda presumida: *${renda || '—'}*${rendaEst ? ` (~R$ ${Number(rendaEst).toLocaleString('pt-BR')})` : ''}`,
    ``,
    `🌾 *Propriedade rural (CAFIR)*`,
    imLinhas,
    d.ie ? `  • I.E.: ${d.ie}` : null,
    ``,
    `📞 ${fone || '—'}${email ? ` · ${email}` : ''}`,
    d.prog ? `Situação: ${d.prog}` : null,
    `_Bula Assessoria · ${new Date().toLocaleDateString('pt-BR')}_`,
  ].filter(s => s !== null && s !== undefined).join('\n')

  const ok = await sendGrupo(txt)
  if (ok) enviados++; else falhas++
  if (temProt) comRestricao++; else if (!qualifica) semDados++
  console.log(`${String(i + 1).padStart(2)}/${cands.length} ${ok ? '✓' : '✗'} ${d.nome} · score ${score || '—'} · renda ${renda ? 'ok' : '—'} · imóveis ${imoveis.length} · ${flag}`)
  await sleep(1400)
}
await db.end()
console.log(`\n=== FIM: ${enviados} enviados, ${falhas} falhas · ${comRestricao} com restrição · ${semDados} dados incompletos ===`)
