import { getLeilao, updateLeilao, deleteLeilao } from '@/lib/bula/queries'
import { revalidateAgendaPublica } from '@/lib/bula/revalidate-agenda'
import { NextResponse } from 'next/server'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const leilao = await getLeilao(id)
    if (!leilao) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(leilao)
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const body = await request.json()
    await updateLeilao(id, body)
    revalidateAgendaPublica()
    return NextResponse.json({ ok: true })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    await deleteLeilao(id)
    revalidateAgendaPublica()
    return NextResponse.json({ ok: true })
}
