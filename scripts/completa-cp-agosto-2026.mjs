/**
 * Completa o Contas a Pagar de agosto/2026:
 *  A) Comissoes ref. JULHO/2026 por assessor/leilao  (venc. 25/08)
 *  B) Bilhetes/boletos agendados p/ 22/08 (Leonardo Francisco + Fabio Omena Gaia)
 *  C) Despesas operacionais estimadas - Expogenetica e demais leiloes
 *  D) Reembolsos estimados de despesas de leilao ref. julho
 *  E) Impostos estimados ref. julho (Simples, ISSQN, FGTS)
 *
 * Idempotente: cada linha carrega a marca [CP-AGO-2026] em observacoes e uma
 * chave em numero_documento; roda de novo sem duplicar.
 * Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')

const CAT = {
  comissao:   'd53cf26d-af3b-406f-8a6d-b46dcd65d78e', // Comissao Funcionario
  despLeilao: '562264eb-8134-4990-a56b-d884279acf90', // Despesa Operacional Leilao
  viagem:     '98083139-0fbf-487a-9988-a08519ebf259', // Viagem/Passagens
  reembolso:  '6e79fd9e-f837-4ff4-a73d-3d8bdabe7ce7', // REEMBOLSO
  impostos:   '6d3270c8-2680-4cdd-a709-5b1520d1f430', // Impostos e Taxas
  encargos:   '05a6785c-3fe2-4411-a70e-5f2ac7083863', // Encargos Sociais
}
const MARCA = '[CP-AGO-2026]'
const linhas = []
const add = (o) => linhas.push({ ...o, numero_documento: o.chave, observacoes: (MARCA + ' ' + (o.obs || '')).trim() })

/* ---------- A) Comissoes de julho/2026 (venc. 25/08) ---------- */
const ALIAS = {
  'FABIO OMENA': 'FABIO OMENA', 'FABIO OMENA GAIA': 'FABIO OMENA',
  'LEO': 'LEONARDO SERAFIM', 'LEO SERAFIM': 'LEONARDO SERAFIM', 'LEONARDO SERAFIM': 'LEONARDO SERAFIM',
  'DOUGLAS BISPO': 'DOUGLAS BISPO', 'NANE': 'NANE', 'PERALTA': 'PERALTA',
  'A DEFINIR': 'A DEFINIR', 'NANE FABIO OMENA': 'NANE / FABIO OMENA',
}
const nkey = s => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const canon = s => ALIAS[nkey(s)] || nkey(s)
const slug = s => nkey(s).toLowerCase().replace(/\s+/g, '-').slice(0, 40)

const { data: fech, error: eF } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,data,por_assessor').gte('data', '2026-07-01').lte('data', '2026-07-31').order('data')
if (eF) throw new Error(eF.message)

for (const f of fech) {
  for (const a of (f.por_assessor || [])) {
    const valor = Number(a.comissao || 0)
    if (!valor) continue
    const nome = canon(a.nome)
    const pct = Math.round(Number(a.comissao_pct || 0.02) * 100)
    add({
      chave: 'com-jul26:' + f.id.slice(0, 8) + ':' + slug(nome),
      descricao: 'COMISSAO ' + f.nome + ' - ' + nome + ' (' + pct + '%)',
      valor, vencimento: '2026-08-25', emissao: f.data,
      categoria_id: CAT.comissao, fechamento_id: f.id,
      tags: ['a-pagar', 'comissao', '2026', 'julho', 'leilao'],
      obs: 'Comissao ref. julho/2026. VGV do assessor R$ ' + Number(a.vgv || 0).toLocaleString('pt-BR') + '.' +
           (nome === 'A DEFINIR' ? ' ATENCAO: beneficiario pendente de atribuicao.' : ''),
    })
  }
}

/* ---------- B) Bilhetes agendados 22/08 (informados pelo financeiro) ---------- */
add({ chave: 'bilhete-2208:leonardo', descricao: 'BILHETE/BOLETO 22/08 - LEONARDO FRANCISCO',
  valor: 1981.58, vencimento: '2026-08-22', emissao: '2026-08-11', categoria_id: CAT.viagem,
  tags: ['a-pagar', 'agosto', 'agendado'],
  obs: 'Bilhete repassado pelo financeiro para pgto em 22/08 (par com Fabio Omena Gaia, total R$ 6.178,45). Natureza a confirmar no comprovante.' })
add({ chave: 'bilhete-2208:fabio', descricao: 'BILHETE/BOLETO 22/08 - FABIO OMENA GAIA',
  valor: 4196.87, vencimento: '2026-08-22', emissao: '2026-08-11', categoria_id: CAT.viagem,
  tags: ['a-pagar', 'agosto', 'agendado'],
  obs: 'Bilhete repassado pelo financeiro para pgto em 22/08 (par com Leonardo Francisco, total R$ 6.178,45). Natureza a confirmar no comprovante.' })

/* ---------- C) Despesas operacionais estimadas ---------- */
add({ chave: 'desp-expo:casa', descricao: 'Despesas EXPOGENETICA - casa/estrutura Uberaba (10-20/08) (ESTIMADO)',
  valor: 7000, vencimento: '2026-08-20', emissao: '2026-08-11', categoria_id: CAT.despLeilao,
  tags: ['a-pagar', 'estimado', 'orcamento', 'leilao', 'expogenetica'],
  obs: 'Premissa: mesmo padrao da EXPOZEBU/2026 (casa em Uberaba, 2 x R$ 3.500 pagos em 27/03 e 29/04).' })
add({ chave: 'desp-expo:equipe', descricao: 'Despesas EXPOGENETICA - passagens, diarias e alimentacao da equipe (ESTIMADO)',
  valor: 6500, vencimento: '2026-08-20', emissao: '2026-08-11', categoria_id: CAT.despLeilao,
  tags: ['a-pagar', 'estimado', 'orcamento', 'leilao', 'expogenetica'],
  obs: 'Premissa: R$ 1.062/leilao (media realizada de julho: R$ 14.874 / 14 leiloes) x 6 leiloes do bloco Expogenetica (10, 15, 16, 19, 19 e 20/08). Nao inclui as passagens de Marcelo (R$ 2.081,92) e Leo (R$ 2.421,43), ja pagas em 17/07.' })
add({ chave: 'desp-leiloes:ago', descricao: 'Despesas operacionais demais leiloes de agosto (11 eventos, 12-30/08) (ESTIMADO)',
  valor: 13500, vencimento: '2026-08-31', emissao: '2026-08-11', categoria_id: CAT.despLeilao,
  tags: ['a-pagar', 'estimado', 'orcamento', 'leilao'],
  obs: 'Premissa: R$ 1.062/leilao (media realizada de julho) x 11 leiloes restantes fora da Expogenetica, com reforco para os presenciais Navirai Camparino (22-23/08) e Melhoradores 30 Anos (29/08).' })

/* ---------- D) Reembolsos estimados ref. julho ---------- */
add({ chave: 'reemb-jul:douglas', descricao: 'REEMBOLSO despesas de leiloes julho/2026 - DOUGLAS BISPO (ESTIMADO)',
  valor: 1800, vencimento: '2026-08-25', emissao: '2026-08-11', categoria_id: CAT.reembolso,
  tags: ['a-pagar', 'estimado', 'orcamento', 'reembolso'],
  obs: 'Premissa: reembolso de 06/07 (R$ 1.772,15 - Tresmar/JMP/Flor do Aratau). Substituir pelo valor real quando a prestacao de contas chegar.' })
add({ chave: 'reemb-jul:fabio', descricao: 'REEMBOLSO despesas de leiloes julho/2026 - FABIO OMENA (ESTIMADO)',
  valor: 3600, vencimento: '2026-08-25', emissao: '2026-08-11', categoria_id: CAT.reembolso,
  tags: ['a-pagar', 'estimado', 'orcamento', 'reembolso'],
  obs: 'Premissa: "DESPESAS JUNHO FABIO" pago em 20/07 (R$ 3.620,67). Substituir pelo valor real quando a prestacao de contas chegar.' })

/* ---------- E) Impostos estimados ref. julho ---------- */
add({ chave: 'imp-jul:simples', descricao: 'Simples Nacional (DAS) ref. julho/2026 (ESTIMADO)',
  valor: 28000, vencimento: '2026-08-20', emissao: '2026-08-11', categoria_id: CAT.impostos,
  tags: ['a-pagar', 'estimado', 'orcamento', 'imposto'],
  obs: 'Premissa: DAS pago em 20/07 ref. junho = R$ 28.660,03, com receita de julho (R$ 301.988) praticamente igual a de junho (R$ 307.843). Confirmar guia com o contador.' })
add({ chave: 'imp-jul:issqn', descricao: 'ISSQN (guia prefeitura) ref. julho/2026 (ESTIMADO)',
  valor: 12000, vencimento: '2026-08-13', emissao: '2026-08-11', categoria_id: CAT.impostos,
  tags: ['a-pagar', 'estimado', 'orcamento', 'imposto'],
  obs: 'Premissa: guia de 13/07 ref. junho = R$ 12.566,78. Confirmar guia com o contador.' })
add({ chave: 'imp-jul:fgts', descricao: 'FGTS/Guia CEF ref. julho/2026 (ESTIMADO)',
  valor: 950, vencimento: '2026-08-07', emissao: '2026-08-11', categoria_id: CAT.encargos,
  tags: ['a-pagar', 'estimado', 'orcamento', 'imposto'],
  obs: 'Premissa: Guia CEF paga em 01/07 = R$ 938,67. O DARF de empregados de 20/08 (R$ 1.114,60) ja esta lancado.' })

/* ---------- grava ---------- */
const { data: existentes } = await sb.from('erp_contas_pagar')
  .select('id,numero_documento,descricao,valor').like('observacoes', MARCA + '%')
const jaTem = new Set((existentes || []).map(e => e.numero_documento))

let novos = 0, pulados = 0, total = 0
for (const l of linhas) {
  total += l.valor
  if (jaTem.has(l.chave)) { pulados++; continue }
  novos++
  console.log('+ ' + l.vencimento + ' | ' + l.valor.toFixed(2).padStart(10) + ' | ' + l.descricao)
  if (APPLY) {
    const { chave, obs, ...row } = l
    const { error } = await sb.from('erp_contas_pagar').insert({ ...row, status: 'aberto', valor_pago: 0 })
    if (error) { console.error('  ERRO:', error.message); process.exitCode = 1 }
  }
}
console.log('\n' + (APPLY ? 'GRAVADOS' : 'DRY-RUN') + ': ' + novos + ' novos, ' + pulados + ' ja existentes. Soma das linhas: R$ ' + total.toFixed(2))
