/** Prazo comercial não se deduz do texto do acordo nem de uma data automática. */
export type TituloComPrazo = { vencimento?: string | null; tags?: string[] | null }
export const recebimentoConfirmado = (t: TituloComPrazo) =>
  !!t.vencimento && (t.tags || []).includes('data-acordada')

export function referenciaCobranca(t: TituloComPrazo, dataLeilao?: string | null): string | null {
  const agendada = (t.tags || []).find(x => /^cobranca-em:\d{4}-\d{2}-\d{2}$/.test(x))
  if (agendada) return agendada.slice('cobranca-em:'.length)
  if (!dataLeilao) return null
  const data = new Date(dataLeilao.slice(0, 10) + 'T12:00:00Z')
  if (!Number.isFinite(data.getTime())) return null
  data.setUTCDate(data.getUTCDate() + 30)
  return data.toISOString().slice(0, 10)
}

/** Campos do formulário são convertidos nas convenções persistidas do ERP. */
export function aplicarPrazoRecebimento(body: Record<string, unknown>, atual?: Record<string, unknown>) {
  const { prazo_confirmado: confirmado, fonte_prazo: fonte, ...patch } = body
  if (confirmado === undefined) {
    // Outro cliente pode editar a data: não carregar confirmação de uma data antiga.
    if (atual && body.vencimento !== undefined && body.vencimento !== atual.vencimento) {
      patch.tags = (Array.isArray(atual.tags) ? atual.tags : []).filter(t => t !== 'data-acordada')
    }
    return patch
  }
  if (typeof confirmado !== 'boolean') throw new Error('Situação do prazo inválida')
  const tags = (Array.isArray(patch.tags) ? patch.tags : Array.isArray(atual?.tags) ? atual.tags : []).filter(t => t !== 'data-acordada' && !String(t).startsWith('cobranca-em:'))
  const vencimento = String(patch.vencimento || atual?.vencimento || '')
  const data = new Date(vencimento + 'T12:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento) || !Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== vencimento) throw new Error('Informe uma data válida de acompanhamento ou de pagamento confirmado')
  if (confirmado) {
    const jaConfirmado = Array.isArray(atual?.tags) && atual.tags.includes('data-acordada') && vencimento === atual.vencimento
    if (!jaConfirmado && (typeof fonte !== 'string' || fonte.trim().length < 5)) throw new Error('Informe quem confirmou a data e a referência da conversa ou documento')
    tags.push('data-acordada')
    if (typeof fonte === 'string' && fonte.trim()) patch.observacoes = `${patch.observacoes ?? atual?.observacoes ?? ''}\n[DATA ACORDADA ${vencimento}] ${fonte.trim()}`.trim()
  } else {
    tags.push(`cobranca-em:${vencimento}`)
    if (atual?.status === 'vencido') patch.status = Number(atual.valor_recebido || 0) > 0 ? 'parcial' : 'aberto'
  }
  patch.tags = [...new Set(tags)]
  return patch
}

/** Confirmar a primeira parcela não confirma datas futuras calculadas pelo sistema. */
export function prazoDaParcela(body: Record<string, unknown>, parcela: number, vencimento: string) {
  if (parcela === 1 && recebimentoConfirmado(body)) return { tags: body.tags, observacoes: body.observacoes }
  return aplicarPrazoRecebimento({ ...body, vencimento, prazo_confirmado: false })
}
