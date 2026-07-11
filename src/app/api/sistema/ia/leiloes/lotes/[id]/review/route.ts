import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import {
  reviewCatalogoLote,
  type LoteReviewAction,
  VideoextratorLotesError,
} from '@/lib/videoextrator-lotes'

export const dynamic = 'force-dynamic'

const ACTIONS = new Set<LoteReviewAction>(['confirm', 'correct', 'clear_buyer', 'mark_pending', 'reject'])
const BUYER_STATUSES = new Set(['confirmado', 'provavel', 'pendente', 'rejeitado'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function optionalText(value: unknown, max: number): string | undefined {
  if (value == null) return undefined
  return String(value).trim().slice(0, max)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Lote inválido.' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || '') as LoteReviewAction
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Ação de revisão inválida.' }, { status: 400 })
  }

  const reviewId = optionalText(body.review_id, 100)
  if (!reviewId) {
    return NextResponse.json({ error: 'Identificador da revisão é obrigatório.' }, { status: 400 })
  }

  const compradorStatus = optionalText(body.comprador_status, 20)
  if (compradorStatus && !BUYER_STATUSES.has(compradorStatus)) {
    return NextResponse.json({ error: 'Status do comprador inválido.' }, { status: 400 })
  }
  const hasAssessorId = Object.prototype.hasOwnProperty.call(body, 'assessor_id')
  const hasAssessorName = Object.prototype.hasOwnProperty.call(body, 'assessor_nome')
  const assessorId = hasAssessorId
    ? (body.assessor_id == null || optionalText(body.assessor_id, 36) === '' ? null : optionalText(body.assessor_id, 36))
    : undefined
  if (assessorId && !UUID_RE.test(assessorId)) {
    return NextResponse.json({ error: 'Assessor inválido.' }, { status: 400 })
  }

  let normalizedAction = action
  let comprador = optionalText(body.comprador, 240)
  let normalizedBuyerStatus = compradorStatus as 'confirmado' | 'provavel' | 'pendente' | 'rejeitado' | undefined
  if (compradorStatus === 'rejeitado') normalizedAction = 'reject'
  else if (compradorStatus === 'pendente' && action !== 'clear_buyer') normalizedAction = 'mark_pending'

  if (normalizedAction === 'reject') {
    comprador = ''
    normalizedBuyerStatus = 'rejeitado'
  } else if (normalizedAction === 'mark_pending' || normalizedAction === 'clear_buyer') {
    comprador = ''
    normalizedBuyerStatus = 'pendente'
  } else if (normalizedAction === 'confirm') {
    normalizedBuyerStatus = 'confirmado'
  }

  try {
    const result = await reviewCatalogoLote(id, {
      review_id: reviewId,
      action: normalizedAction,
      comprador,
      comprador_status: normalizedBuyerStatus,
      ...(hasAssessorName ? { assessor_nome: optionalText(body.assessor_nome, 240) } : {}),
      ...(hasAssessorId ? { assessor_id: assessorId ?? null } : {}),
      note: optionalText(body.note, 1000),
      reviewer: auth.userId,
    })
    return NextResponse.json(result)
  } catch (error) {
    const status = error instanceof VideoextratorLotesError ? error.status : 502
    return NextResponse.json({ error: (error as Error).message }, { status })
  }
}
