// Relatório de remuneração — FÁBIO OMENA (FO ASSESSORIA PECUARIA LTDA)
// Competências MAIO, JUNHO e JULHO/2026, posição em 10/08/2026.
//
// Fontes (todas lidas ao vivo do ERP):
//  · erp_pessoas / erp_folha_estrutura  → cadastro, fixo e % de comissão
//  · erp_contas_pagar (fornecedor_id do Fábio) → títulos por competência
//  · erp_movimentos_bancarios (pessoa_id do Fábio) → lastro no extrato
//  · bula_leilao_fechamento (julho) → comissão de julho ainda não lançada
//
// Saída: <Desktop>/Fabio-Omena-mai-jul-2026.{pdf,xlsx}
// Uso: node scripts/gera-relatorio-fabio-omena-mai-jul-2026.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').replace(/^\uFEFF/, '').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const FID = 'c5919834-4e98-4f07-88a8-0892e4f7c247'
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const dt = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—')

// ---------------------------------------------------------------- dados
const { data: cps } = await sb.from('erp_contas_pagar').select('*').eq('fornecedor_id', FID).order('vencimento')
const { data: mvs } = await sb.from('erp_movimentos_bancarios').select('*').eq('pessoa_id', FID).gte('data', '2026-05-01').order('data')
const { data: contas } = await sb.from('erp_contas_bancarias').select('id,nome')
const cmap = Object.fromEntries((contas || []).map((c) => [c.id, c.nome]))
const { data: fechJul } = await sb.from('bula_leilao_fechamento').select('nome,data,por_assessor')
  .gte('data', '2026-07-01').lte('data', '2026-07-31').order('data')
const { data: ultMov } = await sb.from('erp_movimentos_bancarios').select('data').order('data', { ascending: false }).limit(1)
const CORTE_EXTRATO = ultMov?.[0]?.data

const byDoc = (d) => (cps || []).find((c) => c.numero_documento === d)
const pagoNoExtrato = (valor, data) => (mvs || []).some((m) => m.tipo === 'saida' && Math.abs(Number(m.valor) - valor) < 0.01 && m.data === data)

// MAIO
const folhaMai = byDoc('BULA-2026-CP-FOLHA-001')
const provMai = (cps || []).find((c) => c.descricao.includes('COMISSAO DE MAIO/2026 (PROVISORIO)'))
const nf26 = byDoc('BULA-2026-CP-COMISSAO-MAIO-FABIO-NF26')

// JUNHO
const folhaJun = byDoc('BULA-2026-CP-FOLHA-JUN-FABIOOMENNA')
const despJun = byDoc('DESPESAS-JUNHO-FABIO-2026')
const comJun = (cps || []).filter((c) => c.status === 'parcial').sort((a, b) => b.valor - a.valor)
const meab = byDoc('BULA-2026-CP-COM-MEAB-MODELO-FABIO')
const junTot = comJun.reduce((s, c) => s + Number(c.valor), 0)
const junPago = comJun.reduce((s, c) => s + Number(c.valor_pago || 0), 0)
const junSaldo = junTot - junPago

// JULHO
const folhaJul = byDoc('BULA-2026-CP-FOLHA-JUL-FABIOOMENNA')
const isFab = (n) => /f[áa]bio|omena|omenna/i.test(n || '')
const lotesJul = []
for (const f of fechJul || []) {
  const arr = Array.isArray(f.por_assessor) ? f.por_assessor : Object.values(f.por_assessor || {})
  for (const a of arr) if (isFab(a.nome)) lotesJul.push({ data: f.data, leilao: f.nome, nome: a.nome, vgv: Number(a.vgv || 0), comissao: Number(a.comissao || 0), animais: a.animais, compartilhado: /\//.test(a.nome || '') })
}
const julVgv = lotesJul.reduce((s, l) => s + l.vgv, 0)
const julCom = lotesJul.reduce((s, l) => s + l.comissao, 0)
const julComExclusivo = lotesJul.filter((l) => !l.compartilhado).reduce((s, l) => s + l.comissao, 0)

// Totais de caixa
const saidas = (mvs || []).filter((m) => m.tipo === 'saida')
const entradas = (mvs || []).filter((m) => m.tipo === 'entrada')
const totSaidas = saidas.reduce((s, m) => s + Number(m.valor), 0)
const totEntradas = entradas.reduce((s, m) => s + Number(m.valor), 0)

// Órfãos: saídas do extrato sem conta a pagar vinculada
const orfaos = saidas.filter((m) => !m.conta_pagar_id)

// ---------------------------------------------------------------- HTML
const linhaJun = comJun.map((c) => {
  const base = Number(c.valor) / 0.03
  return `<tr><td>${esc(c.descricao.replace(/^COMISSAO\s+/i, '').replace(/\s*-?\s*F[ÁA]BIO OMENA\s*\(3%\)$/i, ''))}</td>
  <td class="n">${brl(base)}</td><td class="n">${brl(c.valor)}</td>
  <td class="n">${brl(c.valor_pago)}</td><td class="n neg">${brl(Number(c.valor) - Number(c.valor_pago))}</td></tr>`
}).join('')

const linhaJul = lotesJul.map((l) => `<tr><td>${dt(l.data)}</td><td>${esc(l.leilao)}</td>
  <td>${esc(l.nome)}${l.compartilhado ? ' <span class="tag">A DEFINIR</span>' : ''}</td>
  <td class="n">${l.animais}</td><td class="n">${brl(l.vgv)}</td><td class="n">${brl(l.comissao)}</td></tr>`).join('')

const linhaExtrato = (mvs || []).map((m) => `<tr><td>${dt(m.data)}</td><td>${esc(cmap[m.conta_bancaria_id] || '—')}</td>
  <td>${m.tipo === 'entrada' ? 'Entrada' : 'Saída'}</td><td>${esc(String(m.descricao).slice(0, 78))}</td>
  <td class="n ${m.tipo === 'entrada' ? 'pos' : ''}">${brl(m.valor)}</td>
  <td>${m.conta_pagar_id ? 'vinculado' : '<span class="alerta">sem título</span>'}</td></tr>`).join('')

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  * { box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color:#111; background:#fff; font-size:11px; padding:30px 34px; margin:0; }
  h1 { font-size:20px; letter-spacing:.5px; text-transform:uppercase; margin:0; font-weight:700; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:1px; margin:24px 0 8px; border-bottom:1px solid #111; padding-bottom:4px; }
  h3 { font-size:11px; text-transform:uppercase; letter-spacing:.8px; margin:14px 0 5px; color:#333; }
  .sub { color:#666; font-size:10.5px; margin-top:3px; }
  .rule { height:2px; background:#C9A84C; width:64px; margin:7px 0 16px; }
  table { width:100%; border-collapse:collapse; margin:6px 0 4px; }
  th { text-align:left; font-size:8.5px; text-transform:uppercase; letter-spacing:.6px; color:#444; border-bottom:1px solid #111; padding:5px 6px; }
  td { padding:4px 6px; border-bottom:1px solid #e6e6e6; vertical-align:top; }
  td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  tr.tot td { font-weight:700; border-top:1.5px solid #111; border-bottom:none; background:#fafafa; }
  .neg { color:#8a1a1a; }
  .pos { color:#1a5c2a; }
  .tag { font-size:7.5px; letter-spacing:.8px; color:#C9A84C; border:1px solid #C9A84C; padding:0 3px; border-radius:2px; }
  .cards { display:flex; gap:9px; margin:10px 0 4px; }
  .card { flex:1; border:1px solid #ddd; border-top:3px solid #111; padding:9px 10px; }
  .card .lbl { font-size:8px; text-transform:uppercase; letter-spacing:.9px; color:#666; }
  .card .val { font-size:16px; font-weight:700; margin-top:3px; font-variant-numeric:tabular-nums; }
  .card .obs { font-size:8.5px; color:#777; margin-top:3px; line-height:1.35; }
  .card.ouro { border-top-color:#C9A84C; }
  .nota { font-size:9px; color:#555; background:#f7f7f7; border-left:2px solid #C9A84C; padding:6px 8px; margin:6px 0; line-height:1.5; }
  .alerta { color:#8a1a1a; font-weight:700; font-size:9px; }
  ul { margin:4px 0 4px 15px; padding:0; } li { margin:2px 0; line-height:1.45; }
  .quebra { page-break-before: always; }
  @page { size:A4; margin:12mm 0; }
</style></head><body>

<h1>Fábio Omena — Remuneração</h1>
<div class="sub">FO ASSESSORIA PECUÁRIA LTDA · CNPJ 59.791.094/0001-07 · Assessor Comercial — Nordeste (exceto MA) + Sudeste<br>
Competências <b>maio, junho e julho/2026</b> · posição em <b>10/08/2026</b> · extrato bancário conciliado até <b>${dt(CORTE_EXTRATO)}</b></div>
<div class="rule"></div>

<h2>1. Regras de remuneração vigentes</h2>
<table>
<tr><th>Componente</th><th>Até junho/2026</th><th>A partir de julho/2026</th><th>Quando é pago</th></tr>
<tr><td>Fixo mensal (folha)</td><td class="n">R$ 11.700,00</td><td class="n">R$ 7.000,00</td><td>Início do mês seguinte</td></tr>
<tr><td>Comissão sobre VGV de cobertura</td><td class="n">3%</td><td class="n">2%</td><td>Dia 25 do mês seguinte</td></tr>
<tr><td>Reembolso de despesas</td><td colspan="2">Conforme relatório apresentado pelo assessor</td><td>Junto ao ciclo</td></tr>
</table>
<div class="nota">O fixo caiu de R$ 11.700 para R$ 7.000 e o percentual de 3% para 2% a partir da competência de <b>julho/2026</b>. Maio e junho seguem a regra antiga (11.700 + 3%).</div>

<h2>2. Resumo por competência</h2>
<div class="cards">
  <div class="card"><div class="lbl">Maio/2026 — pago</div><div class="val">R$ ${brl(Number(folhaMai.valor) + Number(nf26.valor))}</div>
    <div class="obs">Fixo 11.700 + comissão NF 26 36.849.<br>Ambos com lastro no extrato.</div></div>
  <div class="card"><div class="lbl">Junho/2026 — pago</div><div class="val">R$ ${brl(Number(folhaJun.valor) + Number(despJun.valor) + junPago)}</div>
    <div class="obs">Fixo 11.700 + despesas 3.620,67 + 2/3 da comissão 40.430.</div></div>
  <div class="card ouro"><div class="lbl">Junho/2026 — em aberto</div><div class="val">R$ ${brl(junSaldo)}</div>
    <div class="obs">1/3 restante da comissão de junho (NF 27 2de2). Vence <b>10/08/2026 — hoje</b>.</div></div>
  <div class="card"><div class="lbl">Julho/2026 — pago</div><div class="val">R$ ${brl(folhaJul.valor)}</div>
    <div class="obs">Apenas o fixo. Comissão de julho ainda não apurada nem lançada.</div></div>
</div>

<table>
<tr><th>Competência</th><th class="n">Fixo</th><th class="n">Comissão</th><th class="n">Despesas</th><th class="n">Total devido</th><th class="n">Já pago</th><th class="n">Em aberto</th></tr>
<tr><td><b>Maio/2026</b></td><td class="n">${brl(folhaMai.valor)}</td><td class="n">${brl(nf26.valor)}</td><td class="n">—</td>
    <td class="n">${brl(Number(folhaMai.valor) + Number(nf26.valor))}</td><td class="n">${brl(Number(folhaMai.valor) + Number(nf26.valor))}</td><td class="n">0,00</td></tr>
<tr><td><b>Junho/2026</b></td><td class="n">${brl(folhaJun.valor)}</td><td class="n">${brl(junTot)}</td><td class="n">${brl(despJun.valor)}</td>
    <td class="n">${brl(Number(folhaJun.valor) + junTot + Number(despJun.valor))}</td>
    <td class="n">${brl(Number(folhaJun.valor) + junPago + Number(despJun.valor))}</td><td class="n neg">${brl(junSaldo)}</td></tr>
<tr><td><b>Julho/2026</b></td><td class="n">${brl(folhaJul.valor)}</td><td class="n">${brl(julCom)} <span class="tag">EST.</span></td><td class="n">—</td>
    <td class="n">${brl(Number(folhaJul.valor) + julCom)}</td><td class="n">${brl(folhaJul.valor)}</td><td class="n neg">${brl(julCom)}</td></tr>
<tr class="tot"><td>TOTAL mai+jun+jul</td>
    <td class="n">${brl(Number(folhaMai.valor) + Number(folhaJun.valor) + Number(folhaJul.valor))}</td>
    <td class="n">${brl(Number(nf26.valor) + junTot + julCom)}</td>
    <td class="n">${brl(despJun.valor)}</td>
    <td class="n">${brl(Number(folhaMai.valor) + Number(nf26.valor) + Number(folhaJun.valor) + junTot + Number(despJun.valor) + Number(folhaJul.valor) + julCom)}</td>
    <td class="n">${brl(Number(folhaMai.valor) + Number(nf26.valor) + Number(folhaJun.valor) + junPago + Number(despJun.valor) + Number(folhaJul.valor))}</td>
    <td class="n neg">${brl(junSaldo + julCom)}</td></tr>
</table>
<div class="nota"><b>EST.</b> = a comissão de julho é estimativa calculada por este relatório (2% sobre o VGV atribuído ao Fábio nos fechamentos de julho). <b>Não existe nenhum título lançado no contas a pagar para a comissão de julho</b> — o ciclo ainda não foi fechado.</div>

<h2>3. Maio/2026 — detalhamento</h2>
<table>
<tr><th>Item</th><th>Documento</th><th>Vencimento</th><th>Pago em</th><th class="n">Valor</th><th>Lastro no extrato</th></tr>
<tr><td>Folha maio/2026 (fixo)</td><td>${esc(folhaMai.numero_documento)}</td><td>${dt(folhaMai.vencimento)}</td><td>${dt(folhaMai.data_pagamento)}</td>
    <td class="n">${brl(folhaMai.valor)}</td><td>PIX Sicredi 01/06 — <b>confere</b></td></tr>
<tr><td>Comissão maio/2026 — <b>NF 26</b></td><td>${esc(nf26.numero_documento)}</td><td>${dt(nf26.vencimento)}</td><td>${dt(nf26.data_pagamento)}</td>
    <td class="n">${brl(nf26.valor)}</td><td>PIX Sicoob 07/07 — <b>confere</b></td></tr>
<tr><td>Comissão maio/2026 — <i>provisório</i></td><td>(sem documento)</td><td>${dt(provMai.vencimento)}</td><td>${dt(provMai.data_pagamento)}</td>
    <td class="n">${brl(provMai.valor)}</td><td><span class="alerta">SEM LASTRO — ver seção 7</span></td></tr>
<tr class="tot"><td colspan="4">Total maio com lastro bancário</td><td class="n">${brl(Number(folhaMai.valor) + Number(nf26.valor))}</td><td></td></tr>
</table>
<div class="nota">O ERP tem <b>dois</b> títulos de comissão para maio: um provisório de R$ ${brl(provMai.valor)} (marcado como pago em ${dt(provMai.data_pagamento)} por confirmação verbal da financeira anterior) e a NF 26 de R$ ${brl(nf26.valor)} (paga em ${dt(nf26.data_pagamento)}, com PIX identificado no extrato). <b>Só a NF 26 tem lastro bancário.</b> Se os dois forem legítimos, maio custou R$ ${brl(Number(provMai.valor) + Number(nf26.valor))} de comissão; se o provisório for um lançamento fantasma, custou R$ ${brl(nf26.valor)}.</div>

<div class="quebra"></div>
<h2>4. Junho/2026 — detalhamento</h2>
<h3>4.1 Fixo e despesas</h3>
<table>
<tr><th>Item</th><th>Vencimento</th><th>Pago em</th><th class="n">Valor</th><th>Lastro no extrato</th></tr>
<tr><td>Folha junho/2026 (fixo)</td><td>${dt(folhaJun.vencimento)}</td><td>${dt(folhaJun.data_pagamento)}</td><td class="n">${brl(folhaJun.valor)}</td><td>PIX Sicoob 03/07 (memo "NF 25") — <b>confere</b></td></tr>
<tr><td>Reembolso de despesas de junho</td><td>${dt(despJun.vencimento)}</td><td>${dt(despJun.data_pagamento)}</td><td class="n">${brl(despJun.valor)}</td><td>PIX Sicoob 07/07 — <b>confere</b></td></tr>
</table>
<div class="nota"><b>Composição do reembolso de R$ ${brl(despJun.valor)}</b> (RELATORIO DESPESA bula.xlsx):<br>
· Viagens / alimentação / combustível — R$ 1.475,62 (táxis 19,92 + 80,69 + 71,87 + 110,00 + 28,00; alimentação 80,00 + 136,00 + 57,00 + 55,00 + 63,50; combustível em visita a cliente 334,88 + 116,92 + 321,84)<br>
· Patrocínios de leilão — R$ 2.145,05 (JHVM/Jacamim/Santa Nice 770,00 · Santa Nazaré 569,14 · JMP 805,91)</div>

<h3>4.2 Comissões de junho — 3% sobre a base conferida em 22/07 (FECH-ASSESSORES-0626)</h3>
<table>
<tr><th>Leilão</th><th class="n">Base (VGV)</th><th class="n">Comissão 3%</th><th class="n">Pago 24/07 (2/3)</th><th class="n">Saldo (1/3)</th></tr>
${linhaJun}
<tr class="tot"><td>TOTAL — ${comJun.length} leilões</td><td class="n">${brl(junTot / 0.03)}</td><td class="n">${brl(junTot)}</td><td class="n">${brl(junPago)}</td><td class="n neg">${brl(junSaldo)}</td></tr>
</table>
<div class="nota">Todos os 13 títulos foram <b>reconferidos em 22/07 contra a planilha do próprio assessor</b> e a base foi ajustada leilão a leilão (ex.: Camparino caiu de 4.410 para 2.793; Floc subiu de 1.035 para 1.989; Matinha subiu de 2.520 para 3.360). O pagamento de <b>R$ ${brl(junPago)} em 24/07</b> saiu num único PIX (NF 27, 1 de 2) e o saldo de <b>R$ ${brl(junSaldo)}</b> foi reprogramado por decisão do chefe para <b>10/08/2026</b> (NF 27, 2 de 2) — <b>até o extrato de ${dt(CORTE_EXTRATO)} este saldo não foi pago</b>.</div>
${meab ? `<div class="nota"><b>Fora da conta:</b> ${esc(meab.descricao)} — R$ ${brl(meab.valor)} foi <b>CANCELADA</b>. A planilha do próprio Fábio (21/07) lista esses 3 lotes como "venda sem aprovação" e o chefe confirmou em 04/08 que a única dívida antiga com ele é o 1/3 de R$ ${brl(junSaldo)}.</div>` : ''}

<div class="quebra"></div>
<h2>5. Julho/2026 — o que já foi pago</h2>
<table>
<tr><th>Item</th><th>Vencimento</th><th>Pago em</th><th class="n">Valor</th><th>Lastro no extrato</th></tr>
<tr><td>Folha julho/2026 (fixo — já no valor novo)</td><td>${dt(folhaJul.vencimento)}</td><td>${dt(folhaJul.data_pagamento)}</td><td class="n">${brl(folhaJul.valor)}</td><td>PIX Sicoob 03/08 "Fabio Omena salario Julho 2026" — <b>confere</b></td></tr>
<tr class="tot"><td colspan="3">Total efetivamente pago referente a julho</td><td class="n">${brl(folhaJul.valor)}</td><td></td></tr>
</table>
<div class="nota"><b>Referente a julho, o Fábio recebeu até agora somente o fixo de R$ ${brl(folhaJul.valor)}</b>, pago em ${dt(folhaJul.data_pagamento)}. Não há reembolso de despesas de julho lançado e <b>a comissão de julho não foi apurada</b>: nenhum título existe no contas a pagar.</div>

<h3>5.1 Comissão de julho a apurar — estimativa a 2% pelos fechamentos</h3>
<table>
<tr><th>Data</th><th>Leilão</th><th>Atribuição</th><th class="n">An.</th><th class="n">VGV</th><th class="n">Comissão 2%</th></tr>
${linhaJul}
<tr class="tot"><td colspan="4">TOTAL — ${lotesJul.length} atribuições</td><td class="n">${brl(julVgv)}</td><td class="n">${brl(julCom)}</td></tr>
</table>
<div class="nota">Estimativa deste relatório, <b>não é valor lançado</b>. Do total, <b>R$ ${brl(julComExclusivo)}</b> está atribuído exclusivamente ao Fábio; <b>R$ ${brl(julCom - julComExclusivo)}</b> vem de um lote do 20º Guadalupe Touros (19/07) registrado como "Nane / Fábio Omena" — precisa de decisão sobre a divisão. Se o ciclo de julho seguir a mesma regra de junho (2/3 agora, 1/3 depois), o desembolso imediato seria de aproximadamente R$ ${brl(julCom * 2 / 3)}.</div>

<div class="quebra"></div>
<h2>6. Extrato bancário — todo PIX para o CNPJ do Fábio desde 01/05/2026</h2>
<table>
<tr><th>Data</th><th>Conta</th><th>Tipo</th><th>Histórico</th><th class="n">Valor</th><th>Título</th></tr>
${linhaExtrato}
<tr class="tot"><td colspan="4">Saídas ${brl(totSaidas)} · devoluções ${brl(totEntradas)} · <b>líquido pago</b></td><td class="n">${brl(totSaidas - totEntradas)}</td><td></td></tr>
</table>
<div class="nota">O período cobre de 01/05/2026 até ${dt(CORTE_EXTRATO)}. Os R$ 11.700,00 de 04/05 referem-se à <b>folha de abril</b> e os R$ 7.068,23 de 26/05 ao <b>reembolso de despesas de abril</b> (título de R$ 7.200,00) — por isso não entram nas competências deste relatório. O PIX de R$ 5.169,55 em 13/05 foi <b>devolvido no mesmo dia</b>, então não representa pagamento.</div>

<h2>7. Pendências e divergências a resolver</h2>
<ul>
<li><b>Saldo de junho vence hoje (10/08/2026): R$ ${brl(junSaldo)}.</b> É o 1/3 restante das comissões de junho (NF 27, 2 de 2). Confirmado pelo chefe em 04/08 como a única dívida antiga com o Fábio. Até o extrato de ${dt(CORTE_EXTRATO)} não havia sido pago.</li>
<li><b>Comissão provisória de maio (R$ ${brl(provMai.valor)}) está marcada como paga sem nenhum PIX correspondente no extrato.</b> Ou o título é fantasma (e maio foi pago só via NF 26), ou o pagamento saiu por um caminho que não foi conciliado. Enquanto não decidir, o custo de maio no ERP está possivelmente inflado em R$ ${brl(provMai.valor)}.</li>
${orfaos.length ? `<li><b>${orfaos.length} saída${orfaos.length > 1 ? 's' : ''} do extrato para o CNPJ dele sem título vinculado</b>, somando R$ ${brl(orfaos.reduce((s, m) => s + Number(m.valor), 0))}: ${orfaos.map((m) => `${dt(m.data)} R$ ${brl(m.valor)}`).join(' · ')}. Destaque para <b>R$ 24.414,00 em 03/06</b> e <b>R$ 8.567,23 em 09/06</b> — o valor de 03/06 é próximo do título "REF. COMISSÃO DE ABRIL" (R$ 24.855,00), que por sua vez também está marcado como pago em 20/05 sem lastro. Provável que a comissão de abril tenha sido paga em 03/06, e não em 20/05.</li>` : ''}
<li><b>Comissão de julho não foi apurada.</b> Nenhum título no contas a pagar. Pela estimativa a 2%, são R$ ${brl(julCom)} — dos quais R$ ${brl(julCom - julComExclusivo)} dependem de decidir a divisão do lote "Nane / Fábio Omena" no 20º Guadalupe Touros.</li>
<li><b>Três títulos de junho carregam ressalva de receita</b> (JMP, Jacamim e Terra Brava): a marcação "AGUARDANDO VALIDAÇÃO" pedia não liberar em lote bancário antes de reconciliar o recebível. Os 2/3 já foram pagos mesmo assim, em 24/07.</li>
<li><b>Flor do Aratau tem reivindicação em aberto do assessor:</b> o Fábio reivindica o lote 01 (R$ 3.690) e um corte de 40 fêmeas a 0,5% (R$ 594), mas a regra definida em 30/06 direciona a comissão do lote 01 ao Gustavo Rusa (5%). Valor lançado hoje: R$ 639,00.</li>
</ul>

<div class="nota" style="margin-top:14px">Relatório gerado automaticamente a partir do ERP em 10/08/2026 · fontes: erp_contas_pagar, erp_movimentos_bancarios, erp_folha_estrutura e bula_leilao_fechamento · Bula Assessoria</div>
</body></html>`

// ---------------------------------------------------------------- saída
const desk = join(process.env.USERPROFILE || 'C:\\Users\\Notebook-Acer', 'Desktop')
if (!existsSync(desk)) mkdirSync(desk, { recursive: true })
const outHtml = join(root, 'outputs', 'fabio-omena-mai-jul-2026.html')
mkdirSync(join(root, 'outputs'), { recursive: true })
writeFileSync(outHtml, html, 'utf-8')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })
await page.pdf({ path: join(desk, 'Fabio-Omena-mai-jul-2026.pdf'), format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } })
await browser.close()

// XLSX
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ['FÁBIO OMENA — FO ASSESSORIA PECUARIA LTDA — CNPJ 59.791.094/0001-07'],
  ['Competências maio/junho/julho 2026 — posição 10/08/2026'],
  [],
  ['Competência', 'Fixo', 'Comissão', 'Despesas', 'Total devido', 'Já pago', 'Em aberto'],
  ['Maio/2026', Number(folhaMai.valor), Number(nf26.valor), 0, Number(folhaMai.valor) + Number(nf26.valor), Number(folhaMai.valor) + Number(nf26.valor), 0],
  ['Junho/2026', Number(folhaJun.valor), junTot, Number(despJun.valor), Number(folhaJun.valor) + junTot + Number(despJun.valor), Number(folhaJun.valor) + junPago + Number(despJun.valor), junSaldo],
  ['Julho/2026 (comissão estimada)', Number(folhaJul.valor), julCom, 0, Number(folhaJul.valor) + julCom, Number(folhaJul.valor), julCom],
  [],
  ['Comissão provisória de maio marcada como paga SEM lastro bancário', Number(provMai.valor)],
]), 'Resumo')
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ['Leilão', 'Base VGV', 'Comissão 3%', 'Pago 24/07 (2/3)', 'Saldo 1/3 (venc 10/08)'],
  ...comJun.map((c) => [c.descricao, Number(c.valor) / 0.03, Number(c.valor), Number(c.valor_pago), Number(c.valor) - Number(c.valor_pago)]),
  ['TOTAL', junTot / 0.03, junTot, junPago, junSaldo],
]), 'Junho comissões')
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ['Data', 'Leilão', 'Atribuição', 'Animais', 'VGV', 'Comissão 2% (estimada)'],
  ...lotesJul.map((l) => [l.data, l.leilao, l.nome, l.animais, l.vgv, l.comissao]),
  ['TOTAL', '', '', '', julVgv, julCom],
]), 'Julho a apurar')
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ['Data', 'Conta', 'Tipo', 'Histórico', 'Valor', 'Título vinculado'],
  ...(mvs || []).map((m) => [m.data, cmap[m.conta_bancaria_id] || '', m.tipo, m.descricao, Number(m.valor), m.conta_pagar_id ? 'sim' : 'NÃO']),
]), 'Extrato')
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ['Descrição', 'Documento', 'Vencimento', 'Pago em', 'Status', 'Valor', 'Valor pago'],
  ...(cps || []).map((c) => [c.descricao, c.numero_documento, c.vencimento, c.data_pagamento, c.status, Number(c.valor), Number(c.valor_pago || 0)]),
]), 'Todos os títulos')
XLSX.writeFile(wb, join(desk, 'Fabio-Omena-mai-jul-2026.xlsx'))

console.log('PDF  :', join(desk, 'Fabio-Omena-mai-jul-2026.pdf'))
console.log('XLSX :', join(desk, 'Fabio-Omena-mai-jul-2026.xlsx'))
console.log('maio pago', brl(Number(folhaMai.valor) + Number(nf26.valor)), '| junho pago', brl(Number(folhaJun.valor) + Number(despJun.valor) + junPago), '| saldo junho', brl(junSaldo), '| julho pago', brl(folhaJul.valor), '| julho estimado', brl(julCom))
