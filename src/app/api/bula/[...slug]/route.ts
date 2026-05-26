import { NextRequest, NextResponse } from 'next/server'

type Ctx = { params: { slug: string[] } }

function notImplemented(req: NextRequest, ctx: Ctx) {
  const path = '/api/bula/' + (ctx.params.slug?.join('/') ?? '')
  return NextResponse.json(
    {
      error: 'API endpoint nao implementado neste projeto standalone.',
      method: req.method,
      path,
      hint: 'Implemente uma rota especifica em src/app/api/bula/... ou aponte para um backend externo.',
    },
    { status: 501 },
  )
}

export const GET = notImplemented
export const POST = notImplemented
export const PUT = notImplemented
export const PATCH = notImplemented
export const DELETE = notImplemented
