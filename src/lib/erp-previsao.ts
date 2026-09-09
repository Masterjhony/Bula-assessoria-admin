import { pagamentoCondicionado, pagamentoInformado, pagamentoNaCurva, valorEmApuracao, type ApuracaoPagamento } from './erp-apuracao'
import { recebimentoConfirmado } from './erp-prazos'
import { aberto, compromissoFuturo, devido, naoSubstituido } from './verdade/fatos'

export type TituloPrevisao = {
  id?: string; descricao?: string | null; vencimento?: string | null
  valor: number; desconto: number; juros: number; multa: number
  valor_pago?: number; valor_recebido?: number; status: string
  origem: string | null; tags: string[] | null; substituido_por: string | null
  apuracao?: ApuracaoPagamento | null
}
export type ModoPrevisao = 'pagar' | 'receber'

/** A mesma elegibilidade serve à curva e à lista que explica cada célula. */
export function tituloComPrevisao(t: TituloPrevisao, modo: ModoPrevisao, incluirOrcamento = true) {
  return t.status !== 'cancelado' && naoSubstituido(t) && t.origem !== 'sintetico'
    && (incluirOrcamento || !compromissoFuturo(t)) && !t.apuracao?.sem_valor
    && (modo === 'pagar' ? pagamentoNaCurva(t) : recebimentoConfirmado(t))
}
export const tituloNaCurva = (t: TituloPrevisao, modo: ModoPrevisao, incluirOrcamento = true) =>
  aberto(t) && tituloComPrevisao(t, modo, incluirOrcamento)

export function diaNaCurva(t: TituloPrevisao, modo: ModoPrevisao, hoje: string, incluirOrcamento = true) {
  const dia = t.vencimento?.slice(0, 10)
  return dia && dia >= hoje && tituloNaCurva(t, modo, incluirOrcamento) ? dia : null
}

export type PendenciaPrevisao = {
  id: string | null; descricao: string; modo: ModoPrevisao; mes: string | null
  valor: number | null; orcamento: boolean; situacao: 'sem_valor' | 'em_apuracao' | 'quitacao_informada' | 'condicionado' | 'sem_data'
  condicao: string | null; prazo_situacao: string | null; condicionado: boolean
}

/** Um valor desconhecido é contado e descrito, nunca convertido em dívida zero. */
export function pendenciaPrevisao(t: TituloPrevisao, modo: ModoPrevisao, incluirOrcamento = true): PendenciaPrevisao | null {
  if (!aberto(t) || !naoSubstituido(t) || t.origem === 'sintetico' || (!incluirOrcamento && compromissoFuturo(t))) return null
  const saldo = devido(t, modo === 'pagar' ? 'valor_pago' : 'valor_recebido')
  if (!t.apuracao?.sem_valor && saldo <= 0) return null
  const situacao = t.apuracao?.sem_valor ? 'sem_valor'
    : modo === 'pagar' && pagamentoInformado(t) ? 'quitacao_informada'
    : modo === 'pagar' && valorEmApuracao(t) ? 'em_apuracao'
    : pagamentoCondicionado(t) ? 'condicionado'
    : !tituloNaCurva(t, modo, incluirOrcamento) ? 'sem_data' : null
  if (!situacao) return null
  // Uma data automática do recebível não determina nem seu mês de entrada.
  const mes = t.apuracao?.previsao_mes?.slice(0, 7)
    || (modo === 'pagar' ? t.vencimento?.slice(0, 7) : null) || null
  return { id: t.id || null, descricao: t.descricao || 'Título sem descrição', modo, mes,
    valor: t.apuracao?.sem_valor ? null : Math.round(saldo * 100) / 100,
    orcamento: compromissoFuturo(t), situacao, condicao: t.apuracao?.condicao?.descricao || t.apuracao?.condicao_pagamento || null,
    prazo_situacao: t.apuracao?.prazo_situacao || null, condicionado: pagamentoCondicionado(t) }
}

export function pendenciaNoPeriodo(p: PendenciaPrevisao, from: string, to: string) {
  return !p.mes || (p.mes >= from.slice(0, 7) && p.mes <= to.slice(0, 7))
}

/** Deduz somente saídas condicionadas conhecidas, já excluídas da curva.
 * Não é uma promessa de pagamento nem certificação de caixa livre. */
export function cenarioComReservas(saldoDaCurva: number, pendencias: PendenciaPrevisao[]) {
  const reservas = pendencias.filter(p => p.modo === 'pagar' && p.condicionado && p.situacao !== 'quitacao_informada' && p.valor !== null)
  const reserva = Math.round(reservas.reduce((s, p) => s + p.valor!, 0) * 100) / 100
  return { reserva_condicionada: reserva, saldo_apos_reservas: Math.round((saldoDaCurva - reserva) * 100) / 100,
    titulos_condicionados: reservas.length, reservas_em_apuracao: reservas.filter(p => p.situacao === 'em_apuracao').length,
    valores_a_definir: pendencias.filter(p => p.modo === 'pagar' && p.valor === null).length }
}
