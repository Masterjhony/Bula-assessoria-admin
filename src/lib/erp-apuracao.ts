/** A existência da obrigação, o valor e a quitação são evidências diferentes. */
export interface ApuracaoPagamento {
  natureza?: 'obrigacao' | 'projecao' | 'em_verificacao'
  valor_situacao?: 'confirmado' | 'a_apurar' | 'em_disputa'
  pagamento_situacao?: 'pendente' | 'informado'
  competencia_inicio?: string
  competencia_fim?: string
  previsao_mes?: string
  prazo_situacao?: string
  condicao_pagamento?: string
  sem_valor?: boolean
  chave_exclusiva?: string
  condicao?: { tipo: 'recebimento'; titulos_ids: string[]; descricao: string }
  fontes?: { tipo: string; ref: string; trecho?: string; data?: string }[]
  pendencias?: string[]
}

type Apuravel = { apuracao?: ApuracaoPagamento | null; vencimento?: string | null }
export const pagamentoInformado = (t: Apuravel) => t.apuracao?.pagamento_situacao === 'informado'
export const pagamentoCondicionado = (t: Apuravel) => Boolean(t.apuracao?.condicao)
  || t.apuracao?.prazo_situacao === 'condicionado_ao_caixa'
export const valorEmApuracao = (t: Apuravel) => t.apuracao?.natureza !== 'projecao' && (t.apuracao?.natureza === 'em_verificacao'
  || ['a_apurar', 'em_disputa'].includes(t.apuracao?.valor_situacao || ''))
/** Uma data não torna um valor discutido nem um pagamento já informado previsão de saída. */
export const pagamentoNaCurva = (t: Apuravel) => Boolean(t.vencimento)
  && !['ajuste_dia_util_pendente', 'depende_beneficiario', 'competencia_em_verificacao', 'controle_documental'].includes(t.apuracao?.prazo_situacao || '')
  && !pagamentoCondicionado(t) && !t.apuracao?.sem_valor && !pagamentoInformado(t) && !valorEmApuracao(t)

export function resumoApuracao(t: Apuravel) {
  const a = t.apuracao || {}
  return {
    natureza: a.natureza || 'cadastro_anterior',
    valor_situacao: a.valor_situacao || 'cadastrado',
    pagamento_informado: pagamentoInformado(t),
    condicionado: pagamentoCondicionado(t),
    sem_data: !t.vencimento,
    previsao_mes: a.previsao_mes || null,
    exige_conferencia: valorEmApuracao(t),
    fontes: a.fontes || [],
    pendencias: a.pendencias || [],
  }
}

/** Formulário preserva condições e fontes; mudar a conclusão exige registrar seu fundamento. */
export function aplicarApuracao(body: Record<string, unknown>, atual?: Record<string, unknown>) {
  const { apuracao_natureza: natureza, apuracao_valor: valor, apuracao_fonte: fonte, apuracao_mes: mes, ...patch } = body
  if ([natureza, valor, fonte, mes].every(x => x === undefined)) return patch
  const anterior = (atual?.apuracao || {}) as ApuracaoPagamento
  const apuracao = { ...anterior }
  if (natureza && !['obrigacao','projecao','em_verificacao'].includes(String(natureza))) throw new Error('Natureza inválida')
  if (valor && !['confirmado','a_apurar','em_disputa'].includes(String(valor))) throw new Error('Situação do valor inválida')
  const mudou = (natureza && natureza !== anterior.natureza) || (valor && valor !== anterior.valor_situacao)
  if (mudou && (typeof fonte !== 'string' || fonte.trim().length < 8)) throw new Error('Registre a mensagem, documento ou acerto que fundamenta a alteração')
  if (natureza) apuracao.natureza = natureza as ApuracaoPagamento['natureza']
  if (valor) apuracao.valor_situacao = valor as ApuracaoPagamento['valor_situacao']
  if (valor === 'confirmado') delete apuracao.sem_valor
  if (mes !== undefined) {
    if (mes && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes))) throw new Error('Mês previsto inválido')
    if (mes) apuracao.previsao_mes = `${mes}-01`
    else delete apuracao.previsao_mes
  }
  if (typeof fonte === 'string' && fonte.trim()) apuracao.fontes = [...(anterior.fontes || []), { tipo: 'conferencia_financeiro', ref: fonte.trim(), data: new Date().toISOString() }]
  patch.apuracao = apuracao
  return patch
}
