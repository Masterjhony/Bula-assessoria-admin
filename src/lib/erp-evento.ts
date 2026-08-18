// Identidade do EVENTO ECONÔMICO de um título.
//
// O ERP convive com dois tipos de título para o mesmo fato: a PREVISÃO
// (folha do mês que vem, comissão calculada do fechamento, débito agendado,
// orçamento) e o REAL (o título que nasce do extrato quando o dinheiro sai ou
// entra). Sem uma identidade comum os dois ficam vivos ao mesmo tempo e o
// "a pagar/a receber" conta o mesmo compromisso duas vezes.
//
// `eventoKey` devolve uma chave estável para o fato econômico — não para o
// título. Dois títulos com a mesma chave são o MESMO compromisso, e o real
// substitui a previsão (ver migration 0074: trigger erp_substitui_estimativa).
//
// A chave é derivada de texto porque é o único dado que as duas origens
// compartilham: a previsão é escrita pelo financeiro ("Folha Agosto/2026 -
// LEONARDO") e o real vem do banco ("PAGAMENTO PIX 01711354155 LEONARDO
// SERAFIM FRANC"). Quando não dá para afirmar a família com segurança a
// função devolve null — chave errada uniria coisas diferentes, e cancelar
// título por engano é pior do que deixar uma previsão viva.

const MESES: Record<string, string> = {
  janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06',
  julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
}

export const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')

export const chaveTexto = (s: string) =>
  semAcento(String(s || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** "Agosto/2026", "ref. agosto/2026", "ago/2026" -> "2026-08" */
export function competenciaDoTexto(texto: string): string | null {
  const t = chaveTexto(texto)
  for (const [nome, mm] of Object.entries(MESES)) {
    const re = new RegExp(`${nome.slice(0, 3)}[a-z]*\\s*(?:de\\s*)?(20\\d{2})`)
    const m = t.match(re)
    if (m) return `${m[1]}-${mm}`
  }
  const iso = t.match(/(20\d{2})\s*(0[1-9]|1[0-2])\b/)
  if (iso) return `${iso[1]}-${iso[2]}`
  return null
}

// Pessoas da folha/comissão. O nome curto é o que aparece na previsão; os
// aliases cobrem como o banco escreve no extrato (nome completo, empresa).
const PESSOAS: ReadonlyArray<{ chave: string; termos: string[] }> = [
  { chave: 'leonardo-serafim', termos: ['leonardo serafim', 'leonardo francisco', 'lm assessoria', 'leonardo'] },
  { chave: 'fabio-omena', termos: ['fabio omena', 'fabio omenna', 'fo assessoria', 'fabio de omena', 'fabio'] },
  { chave: 'douglas-bispo', termos: ['douglas bispo', 'douglas'] },
  { chave: 'joao-eduardo', termos: ['joao eduardo'] },
  { chave: 'joao-gabriel', termos: ['joao gabriel'] },
  { chave: 'joao-antonio', termos: ['joao antonio'] },
  { chave: 'matheus-alves', termos: ['matheus alves', 'mateus alves', 'matheus'] },
  { chave: 'lucas-martins', termos: ['lucas martins', 'lucas'] },
  { chave: 'laila-oliveira', termos: ['laila oliveira', 'laila'] },
  { chave: 'valeria-borges', termos: ['valeria borges', 'valeria'] },
  { chave: 'gustavo-rusa', termos: ['gustavo rusa', 'rusa'] },
  { chave: 'felipe-andrade', termos: ['felipe vilela', 'felipe andrade', 'bulinha'] },
  { chave: 'nane', termos: ['nane'] },
]

/** Pessoa citada no texto, na grafia canônica — o termo mais longo vence. */
export function pessoaDoTexto(texto: string): string | null {
  const t = ` ${chaveTexto(texto)} `
  let achou: { chave: string; peso: number } | null = null
  for (const p of PESSOAS) {
    for (const termo of p.termos) {
      if (!t.includes(` ${termo} `) && !t.includes(` ${termo}`)) continue
      const peso = termo.length
      if (!achou || peso > achou.peso) achou = { chave: p.chave, peso }
    }
  }
  return achou?.chave ?? null
}

/** "2026-08" -> "2026-07"; a guia vence no mês seguinte ao fato gerador. */
export function mesAnterior(ym: string): string | null {
  const m = String(ym || '').match(/^(20\d{2})-(0[1-9]|1[0-2])$/)
  if (!m) return null
  const ano = Number(m[1]), mes = Number(m[2])
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, '0')}`
}

export type TituloParaChave = {
  descricao: string
  vencimento?: string | null
  fechamento_id?: string | null
}

/**
 * Chave do evento econômico, ou null quando não dá para afirmar com segurança.
 *
 * Famílias reconhecidas hoje:
 *   folha:<pessoa>:<competência>          — salário/pró-labore do mês
 *   comissao-fixa:<pessoa>:<competência>  — fixo mensal (SDR)
 *   comissao:<fechamento>:<pessoa>        — comissão de um leilão específico
 *   imposto:<tributo>:<competência>       — DAS, DARF, FGTS, INSS, ISS
 *   fatura-cartao:<bandeira>:<AAAA-MM>    — débito da fatura
 */
export function eventoKey(t: TituloParaChave): string | null {
  const bruto = String(t.descricao || '')
  const d = chaveTexto(bruto)
  if (!d) return null
  const venc = String(t.vencimento || '').slice(0, 7)

  // folha / salário / pró-labore
  if (/\b(folha|salario|pro labore|prolabore)\b/.test(d)) {
    const pessoa = pessoaDoTexto(bruto)
    const comp = competenciaDoTexto(bruto)
    if (pessoa && comp) return `folha:${pessoa}:${comp}`
    return null
  }

  // comissão FIXA mensal (não depende de leilão)
  if (/comissao fixa/.test(d)) {
    const pessoa = pessoaDoTexto(bruto)
    const comp = competenciaDoTexto(bruto) || venc
    if (pessoa && comp) return `comissao-fixa:${pessoa}:${comp}`
    return null
  }

  // comissão de leilão — só com o fechamento identificado, senão o nome do
  // leilão sozinho casa edições diferentes do mesmo evento anual
  if (/^comissao/.test(d) && t.fechamento_id) {
    const pessoa = pessoaDoTexto(bruto)
    if (pessoa) return `comissao:${t.fechamento_id}:${pessoa}`
    return null
  }

  // tributos — um por competência
  const TRIBUTOS: Array<[RegExp, string]> = [
    [/\bdas\b|simples nacional/, 'das'],
    [/\bdarf\b/, 'darf'],
    [/\bfgts\b/, 'fgts'],
    [/\binss\b/, 'inss'],
    [/\biss\b|issqn/, 'iss'],
  ]
  for (const [re, nome] of TRIBUTOS) {
    if (!re.test(d)) continue
    // A guia é o total da competência: quando ela existe, a apuração/provisão
    // daquela mesma competência não soma junto — some. Por isso a chave é o
    // tributo + competência, e não o valor.
    // Sem competência no texto, a guia paga no mês N refere-se ao mês N-1.
    const comp = competenciaDoTexto(bruto) || mesAnterior(venc)
    return comp ? `imposto:${nome}:${comp}` : null
  }

  // fatura de cartão — uma por bandeira/mês
  if (/fatura cart|fatura do cart/.test(d)) {
    const band = /master/.test(d) ? 'mastercard' : /visa/.test(d) ? 'visa' : /elo/.test(d) ? 'elo' : null
    if (band && venc) return `fatura-cartao:${band}:${venc}`
    return null
  }

  // despesa operacional de um leilão (passagem, estadia, alimentação,
  // estrutura). Só existe quando o leilão é PRESENCIAL — leilão virtual não
  // desloca equipe. Uma previsão de "despesas do leilão X" é coberta por
  // vários pagamentos reais, por isso a chave é do leilão, não do item.
  if (t.fechamento_id && ehDespesaOperacional(bruto)) {
    return `despesa-leilao:${t.fechamento_id}`
  }

  return null
}

const RE_DESPESA_OPERACIONAL =
  /despesa[s]? operacion|deslocament|passage|bilhete|hotel|hosped|estad|alimenta|diaria|di[aá]ria|uber|combustiv|estrutura|casa\/estrutura|uniforme|reembolso/i

/** Gasto que só acontece quando a equipe vai a campo. */
export function ehDespesaOperacional(texto: string): boolean {
  return RE_DESPESA_OPERACIONAL.test(semAcento(String(texto || '')))
}

/** Leilão virtual não gera deslocamento/estadia — o nome é quem diz. */
export function ehLeilaoVirtual(nome: string | null | undefined): boolean {
  return /\bvirtual\b|\bonline\b|\bweb\b/i.test(semAcento(String(nome || '')))
}

/**
 * Como o real liquida a previsão de um mesmo evento.
 *
 *  'total'    — o real É a apuração definitiva e substitui a previsão inteira,
 *               qualquer que seja o valor. É o caso do tributo: a guia fecha a
 *               competência, então a diferença provisionada deixa de existir.
 *  'agregada' — vários reais somam contra uma previsão; ela só é substituída
 *               quando o realizado cobre o previsto (despesa de leilão).
 *  'unitaria' — um real para uma previsão (folha, fatura, comissão).
 */
export type PoliticaSubstituicao = 'total' | 'agregada' | 'unitaria'

export function politicaSubstituicao(key: string): PoliticaSubstituicao {
  if (key.startsWith('imposto:')) return 'total'
  if (key.startsWith('despesa-leilao:')) return 'agregada'
  return 'unitaria'
}

/** Título que é previsão, não compromisso confirmado. */
export const TAGS_ESTIMATIVA = ['orcamento', 'projecao-anual', 'estimado', 'provisao', 'agendado'] as const

export function ehEstimativa(tags: string[] | null | undefined): boolean {
  const s = new Set(tags || [])
  return (TAGS_ESTIMATIVA as readonly string[]).some(t => s.has(t))
}
