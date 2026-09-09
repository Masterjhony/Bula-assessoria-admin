import type { SupabaseClient } from '@supabase/supabase-js'
import { aberto, compromissoFuturo, devido, naoSubstituido, vivo, type Titulo } from './verdade/fatos'
import { recebimentoConfirmado, referenciaCobranca } from './erp-prazos'

export type ModoContas = 'pagar' | 'receber'

/** Conserva o total em centavos e mantém o dia original, limitado ao fim do mês. */
export function parcelarTitulo(valor: unknown, vencimento: unknown, totalParcelas: unknown = 1) {
  const total = Number(totalParcelas)
  const amount = Number(valor)
  const cents = Math.round(amount * 100)
  if (!Number.isInteger(total) || total < 1 || total > 60) throw new Error('Informe de 1 a 60 parcelas inteiras')
  if (valor === null || valor === undefined || valor === '' || !Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(cents) || Math.abs(amount * 100 - cents) > 0.00001) {
    throw new Error('Valor deve ser não negativo e ter no máximo duas casas decimais')
  }
  const date = String(vencimento || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Vencimento inválido')
  const base = new Date(date + 'T12:00:00Z')
  if (!Number.isFinite(base.getTime()) || base.toISOString().slice(0, 10) !== date) throw new Error('Vencimento inválido')
  const quotient = Math.floor(cents / total)
  return Array.from({ length: total }, (_, i) => {
    const first = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, 1, 12))
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)).getUTCDate()
    first.setUTCDate(Math.min(base.getUTCDate(), lastDay))
    return { parcela: i + 1, valor: (quotient + (i === total - 1 ? cents % total : 0)) / 100, vencimento: first.toISOString().slice(0, 10) }
  })
}

/** Datas de negócio no Brasil, independentes do fuso do servidor. */
export function hojeFinanceiro(data = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(data)
  const part = (tipo: string) => parts.find(p => p.type === tipo)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** Deriva a apresentação sem dar baixa nem alterar o título durante um GET. */
export function prepararTituloContas<T extends Titulo>(titulo: T, modo: ModoContas, hoje: string) {
  const chave = modo === 'pagar' ? 'valor_pago' : 'valor_recebido'
  const ativo = vivo(titulo) && naoSubstituido(titulo)
  const saldo = Math.round(devido(titulo, chave) * 100) / 100
  const vencimento = titulo.vencimento?.slice(0, 10)
  const confirmado = modo === 'pagar' || recebimentoConfirmado(titulo)
  const status = aberto(titulo) && ativo && saldo > 0 && vencimento
    ? confirmado && vencimento < hoje ? 'vencido' : Number(titulo[chave] || 0) > 0 ? 'parcial' : 'aberto'
    : titulo.status
  return {
    ...titulo,
    status,
    status_registrado: titulo.status,
    financeiro: { ativo, projecao: compromissoFuturo(titulo), saldo, data_base: hoje,
      prazo_confirmado: confirmado,
      data_cobranca: modo === 'receber' ? referenciaCobranca(titulo, (titulo as T & { fechamento?: { data?: string } }).fechamento?.data) : null,
    },
  }
}

/** Uma lista completa ou erro: nunca publica o subtotal de uma página do banco. */
export async function listarTitulosContas(
  sb: SupabaseClient, modo: ModoContas, sp: URLSearchParams, hoje = hojeFinanceiro(),
) {
  const isCP = modo === 'pagar'
  const parceiro = isCP ? 'fornecedor' : 'cliente'
  const select = `*, ${parceiro}:erp_pessoas!${parceiro}_id(id,nome), categoria:erp_categorias!categoria_id(id,nome,cor), centro:erp_centros_custo!centro_custo_id(id,nome,codigo), conta:erp_contas_bancarias!conta_bancaria_id(id,nome), fechamento:bula_leilao_fechamento!fechamento_id(data)`
  const rows: Titulo[] = []
  const pageSize = 500
  const safe = (s: string) => s.replace(/[(),%_"\\]/g, ' ').trim()
  for (let from = 0; ; from += pageSize) {
    let q = sb.from(isCP ? 'erp_contas_pagar' : 'erp_contas_receber').select(select)
      .order('vencimento').order('id').range(from, from + pageSize - 1)
    for (const column of [`${parceiro}_id`, 'categoria_id', 'centro_custo_id']) {
      if (sp.get(column)) q = q.eq(column, sp.get(column)!)
    }
    if (sp.get('from')) q = q.gte('vencimento', sp.get('from')!)
    if (sp.get('to')) q = q.lte('vencimento', sp.get('to')!)
    for (const column of ['leilao', 'q']) {
      const term = safe(sp.get(column) || '')
      if (term) q = q.or(`descricao.ilike.%${term}%,numero_documento.ilike.%${term}%,observacoes.ilike.%${term}%`)
    }
    const { data, error } = await q
    if (error) throw new Error(error.message)
    rows.push(...((data || []) as unknown as Titulo[]))
    if (!data || data.length < pageSize) break
  }
  // O status exibido depende do vencimento atual, não de uma atualização feita
  // por outro visitante da tela. Filtrar antes dessa derivação perderia títulos.
  const status = sp.get('status')
  return rows.map(r => prepararTituloContas(r, modo, hoje)).filter(r => !status || r.status === status)
}
