// Fechamento consolidado de JULHO/2026 — PDF no padrão brandbook (preto/
// grafite/branco, dourado <5%, Oswald caixa-alta). Dados 100% do banco
// (bula_leilao_fechamento), com nota de confiança por leilão (fonte) e
// registro das correções da conferência tri-fonte de 07/08.
// Uso: node scripts/gera-fechamento-julho-2026.mjs [--enviar]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const { data: fech } = await sb.from('bula_leilao_fechamento')
    .select('data, nome, lotes_vendidos, animais_vendidos, vgv_total, ticket_medio, maior_lance, por_assessor, origem')
    .gte('data', '2026-07-01').lt('data', '2026-08-01').order('data')

const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const brl0 = n => 'R$ ' + Math.round(Number(n || 0)).toLocaleString('pt-BR')
const dt = d => { const [a, m, di] = String(d).slice(0, 10).split('-'); return `${di}/${m}` }
const FONTE = {
    'manual': 'Fechamento manual',
    'lances-auto': 'Captura do grupo de lances',
    'hastapro': 'HastaPró (conciliado)',
}

const rows = (fech ?? []).map(f => ({ ...f, vgv: Number(f.vgv_total || 0), animais: Number(f.animais_vendidos || 0), lotes: Number(f.lotes_vendidos || 0) }))
const tot = {
    vgv: rows.reduce((s, f) => s + f.vgv, 0),
    animais: rows.reduce((s, f) => s + f.animais, 0),
    lotes: rows.reduce((s, f) => s + f.lotes, 0),
    leiloes: rows.length,
}
const maior = rows.reduce((m, f) => Math.max(m, Number(f.maior_lance || 0)), 0)

// consolidação por assessor (soma dos por_assessor dos fechamentos)
// canonização de grafias — mesma pessoa, um nome só (padrão CO_CANONICO)
function canonAssessor(raw) {
    const n = String(raw || 'A definir').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    if (/leonardo|leozinho|^leo\b|leo serafim/.test(n)) return 'Leonardo Serafim'
    if (/omena|fabio mena/.test(n)) return n.includes('nane') ? 'Nane / Fábio Omena' : 'Fábio Omena Gaia'
    if (/douglas/.test(n)) return 'Douglas Bispo'
    if (/nane/.test(n)) return n.includes('omena') || n.includes('fabio') ? 'Nane / Fábio Omena' : 'Nane'
    if (/peralta|felipinho/.test(n)) return 'Felipe Peralta'
    if (/bulinha|felipe andrade/.test(n)) return 'Bulinha (Felipe Andrade)'
    return String(raw)
}
const porA = new Map()
for (const f of rows) {
    for (const a of (Array.isArray(f.por_assessor) ? f.por_assessor : [])) {
        const k = canonAssessor(a.nome)
        const cur = porA.get(k) || { nome: k, transacoes: 0, animais: 0, vgv: 0 }
        cur.transacoes += Number(a.transacoes || 0)
        cur.animais += Number(a.animais || 0)
        cur.vgv += Number(a.vgv || 0)
        porA.set(k, cur)
    }
}
const assessores = [...porA.values()].sort((x, y) => y.vgv - x.vgv)

const linhas = rows.map(f => `
  <tr>
    <td class="c">${dt(f.data)}</td>
    <td>${f.nome}</td>
    <td class="c">${f.lotes}</td>
    <td class="c">${f.animais || '—'}</td>
    <td class="r">${brl(f.vgv)}</td>
    <td class="fonte">${FONTE[f.origem] ?? 'Fechamento manual'}</td>
  </tr>`).join('')

const linhasA = assessores.map((a, i) => `
  <tr>
    <td class="c">${i + 1}º</td>
    <td>${a.nome}</td>
    <td class="c">${a.transacoes}</td>
    <td class="c">${a.animais}</td>
    <td class="r">${brl(a.vgv)}</td>
    <td class="r">${(a.vgv / tot.vgv * 100).toFixed(1)}%</td>
  </tr>`).join('')

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root { --preto:#0b0b0c; --grafite:#2a2a2e; --cinza:#6d6d74; --linha:#e3e3e6; --ouro:#C9A84C; }
  body { font-family:'Inter',sans-serif; color:var(--preto); font-size:11px; }
  .page { page-break-after:always; padding:48px 52px; min-height:1050px; position:relative; }
  .page:last-child { page-break-after:auto; }
  h1,h2,h3 { font-family:'Oswald',sans-serif; text-transform:uppercase; letter-spacing:.06em; }
  .capa { background:var(--preto); color:#fff; display:flex; flex-direction:column; justify-content:space-between; }
  .capa .marca { font-family:'Oswald'; font-size:15px; letter-spacing:.35em; color:#fff; }
  .capa .titulo { font-size:54px; line-height:1.05; font-weight:600; }
  .capa .sub { color:#9a9aa2; margin-top:14px; font-size:13px; letter-spacing:.05em; }
  .fio { width:64px; height:3px; background:var(--ouro); margin:26px 0; }
  .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:#26262b; border:1px solid #26262b; }
  .kpi { background:var(--preto); padding:20px 18px; }
  .kpi .v { font-family:'Oswald'; font-size:26px; font-weight:500; color:#fff; }
  .kpi .l { font-size:9px; letter-spacing:.14em; text-transform:uppercase; color:#8b8b93; margin-top:6px; }
  .rodape-capa { display:flex; justify-content:space-between; color:#8b8b93; font-size:9.5px; letter-spacing:.08em; }
  h2 { font-size:19px; font-weight:600; margin-bottom:4px; }
  .sub2 { color:var(--cinza); font-size:10.5px; margin-bottom:18px; }
  table { width:100%; border-collapse:collapse; margin-top:8px; }
  th { font-family:'Oswald'; font-size:9px; letter-spacing:.12em; text-transform:uppercase; text-align:left; color:#fff; background:var(--preto); padding:8px 9px; }
  td { padding:7.5px 9px; border-bottom:1px solid var(--linha); font-size:10.5px; }
  tr:nth-child(even) td { background:#f7f7f8; }
  .c { text-align:center; } .r { text-align:right; font-variant-numeric:tabular-nums; }
  .fonte { color:var(--cinza); font-size:9px; }
  tfoot td { font-weight:600; border-top:2px solid var(--preto); border-bottom:none; background:#fff !important; }
  .bloco { border:1px solid var(--linha); border-left:3px solid var(--ouro); padding:14px 16px; margin:10px 0; }
  .bloco b { font-size:11px; }
  .bloco p { color:var(--grafite); margin-top:4px; line-height:1.5; }
  .nota { color:var(--cinza); font-size:9.5px; line-height:1.55; margin-top:16px; }
  .pagfoot { position:absolute; bottom:26px; left:52px; right:52px; display:flex; justify-content:space-between; color:#a0a0a8; font-size:8.5px; letter-spacing:.1em; text-transform:uppercase; }
</style></head><body>

<div class="page capa">
  <div>
    <div class="marca">BULA — ASSESSORIA PECUÁRIA</div>
    <div style="margin-top:150px">
      <div class="fio"></div>
      <h1 class="titulo">Fechamento<br>de Leilões<br>Julho / 2026</h1>
      <div class="sub">CONSOLIDADO OFICIAL · COBERTURA DA ASSESSORIA (EQUIPE DE PISTA)</div>
    </div>
  </div>
  <div>
    <div class="kpis">
      <div class="kpi"><div class="v">${brl0(tot.vgv)}</div><div class="l">VGV Total</div></div>
      <div class="kpi"><div class="v">${tot.leiloes}</div><div class="l">Leilões com venda</div></div>
      <div class="kpi"><div class="v">${tot.lotes}</div><div class="l">Lotes</div></div>
      <div class="kpi"><div class="v">${tot.animais}</div><div class="l">Animais</div></div>
    </div>
    <div style="height:22px"></div>
    <div class="rodape-capa"><span>EMITIDO EM 07/08/2026</span><span>FONTES: GRUPOS DE LANCES · SISTEMA BULA · HASTAPRÓ</span></div>
  </div>
</div>

<div class="page">
  <h2>Leilões do mês</h2>
  <div class="sub2">Venda da equipe (cobertura Bula) por leilão · VGV = parcela × 30 por lote</div>
  <table>
    <thead><tr><th style="width:44px">Data</th><th>Leilão</th><th style="width:44px" class="c">Lotes</th><th style="width:52px" class="c">Animais</th><th style="width:104px" class="r">VGV</th><th style="width:120px">Base do lançamento</th></tr></thead>
    <tbody>${linhas}</tbody>
    <tfoot><tr><td></td><td>TOTAL</td><td class="c">${tot.lotes}</td><td class="c">${tot.animais}</td><td class="r">${brl(tot.vgv)}</td><td></td></tr></tfoot>
  </table>
  <p class="nota">Maior lance do mês: ${brl0(maior)} (VGV do lote). Dias 07/07 (Bezerros Top Matinha e Nelore Kirz), 10/07 (EAO Baviera — Aspirações) e 17/07 (Guadalupe — Doadoras): sem venda de cobertura registrada em nenhuma das três fontes — não há fechamento a lançar.</p>
  <div class="pagfoot"><span>Bula Assessoria Pecuária</span><span>Fechamento Julho/2026 · pág. 2/4</span></div>
</div>

<div class="page">
  <h2>O que mudou nesta consolidação</h2>
  <div class="sub2">Diferenças em relação ao consolidado anterior (11 leilões · R$ 2.182.500,00) e a base de confiança de cada lançamento</div>
  <div class="bloco"><b>+ 20º Guadalupe Agropecuária — Touros (19/07) · 9 lotes · ${brl0(234900)}</b>
    <p>Recuperado da captura retroativa do grupo <b>LANCES GUADALUPE</b> (1.539 mensagens reprocessadas). Fichas com comprador, assessor e valor lote a lote. O HastaPró não possui este leilão — o grupo é a única fonte primária, e os 9 lotes têm ficha completa.</p></div>
  <div class="bloco"><b>+ 20º Guadalupe Agropecuária — Touros (20/07) · 2 lotes · ${brl0(64200)}</b>
    <p>Mesma origem (captura do grupo), fichas completas com comprador identificado.</p></div>
  <div class="bloco"><b>+ 30º Neloraço Irmãos Hipólito (25/07) · 1 lote · ${brl0(28500)}</b>
    <p>Lote 40 (1 macho, comprador Welton Costa, assessor Douglas Bispo) capturado no grupo Lances Bula. Atribuição verificada por exclusão: o outro pregão do dia era a etapa de <b>fêmeas</b> da Genética Aditiva — cujos 3 lotes já batem 1:1 com o HastaPró.</p></div>
  <div class="bloco"><b>± Naviraí Matrizes 2ª Etapa (16/07): ${brl0(101729.7)} → ${brl0(158700)} · 6 lotes</b>
    <p>Dois lotes capturados sem valor (25 e 36) foram completados com o HastaPró (1.020 e 850) e o lote 2 foi corrigido de 920,99 para 950,00 conforme o registro oficial — o total agora é idêntico ao consolidado anterior e ao HastaPró.</p></div>
  <p class="nota"><b>Metodologia (conferência tri-fonte).</b> Cada pregão foi cruzado lote a lote entre três fontes independentes: (1) grupos de lances do WhatsApp — captura automática e retroativa; (2) fechamentos do sistema Bula; (3) HastaPró (FIL 2 — Bula Assessoria, somente leitura). Fechamentos manuais nunca foram sobrescritos; divergências foram resolvidas a favor da fonte com ficha completa e conferência cruzada. Backup integral pré-ajustes: outputs/backup-fechamento-julho-2026-08-07.json.</p>
  <div class="pagfoot"><span>Bula Assessoria Pecuária</span><span>Fechamento Julho/2026 · pág. 3/4</span></div>
</div>

<div class="page">
  <h2>Desempenho por assessor</h2>
  <div class="sub2">Consolidado do mês — transações, animais e VGV da cobertura</div>
  <table>
    <thead><tr><th style="width:38px" class="c">#</th><th>Assessor</th><th style="width:70px" class="c">Transações</th><th style="width:60px" class="c">Animais</th><th style="width:110px" class="r">VGV</th><th style="width:64px" class="r">% do mês</th></tr></thead>
    <tbody>${linhasA}</tbody>
  </table>
  <p class="nota">"A definir" concentra lotes cuja ficha do grupo não citou o assessor — pendentes de atribuição na revisão da página de Lances. Percentuais sobre o VGV total do mês (${brl(tot.vgv)}).</p>
  <div class="pagfoot"><span>Bula Assessoria Pecuária</span><span>Fechamento Julho/2026 · pág. 4/4</span></div>
</div>
</body></html>`

const outDir = join(root, 'outputs', 'fechamento-julho-2026')
mkdirSync(outDir, { recursive: true })
const htmlPath = join(outDir, 'fechamento-julho-2026.html')
const pdfPath = join(outDir, 'Fechamento-Leiloes-Julho-2026-Bula.pdf')
writeFileSync(htmlPath, html, 'utf-8')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
await browser.close()
console.log('PDF:', pdfPath)

if (process.argv.includes('--enviar')) {
    const buf = readFileSync(pdfPath)
    const key = `agente-relatorios/${Date.now()}-Fechamento-Leiloes-Julho-2026-Bula.pdf`
    const up = await sb.storage.from('whatsapp-media').upload(key, buf, { contentType: 'application/pdf' })
    if (up.error) throw new Error(up.error.message)
    const { data: signed } = await sb.storage.from('whatsapp-media').createSignedUrl(key, 6 * 3600)
    const res = await fetch(`${env.WHATSAPP_SERVER_URL}/send-direct?session=operacional`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-vps-token': env.WHATSAPP_SERVER_TOKEN || '' },
        body: JSON.stringify({
            phone: '5537984044850',
            message: '📊 Fechamento consolidado de Julho/2026 — 14 leilões, conferência tri-fonte.',
            media: { type: 'document', url: signed.signedUrl, fileName: 'Fechamento-Leiloes-Julho-2026-Bula.pdf', mimetype: 'application/pdf' },
        }),
    })
    console.log('envio WhatsApp:', res.status)
}
process.exit(0)
