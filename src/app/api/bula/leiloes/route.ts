import { getLeiloes, createLeilao } from '@/lib/bula/queries'
import { revalidateAgendaPublica } from '@/lib/bula/revalidate-agenda'
import { NextResponse } from 'next/server'

export async function GET() {
    const leiloes = await getLeiloes()
    return NextResponse.json(leiloes)
}

export async function POST(request: Request) {
    const body = await request.json()
    const leilao = await createLeilao(body)
    revalidateAgendaPublica()
    return NextResponse.json(leilao, { status: 201 })
}
