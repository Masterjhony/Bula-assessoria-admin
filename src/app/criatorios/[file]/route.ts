import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const CONTENT_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
}

type RouteContext = {
    params: Promise<{ file: string }>
}

function safeFileName(file: string): string | null {
    const decoded = decodeURIComponent(file)
    if (!/^[a-z0-9][a-z0-9._-]*\.(png|jpe?g|svg|webp)$/i.test(decoded)) return null
    return decoded
}

async function loadCriatorioLogo(file: string) {
    const safeName = safeFileName(file)
    if (!safeName) return null

    const ext = extname(safeName).toLowerCase()
    const contentType = CONTENT_TYPES[ext]
    if (!contentType) return null

    try {
        const bytes = await readFile(join(process.cwd(), 'public', 'criatorios', safeName))
        return { bytes, contentType }
    } catch {
        return null
    }
}

export async function GET(_request: Request, { params }: RouteContext) {
    const { file } = await params
    const logo = await loadCriatorioLogo(file)

    if (!logo) {
        return new NextResponse(null, { status: 404 })
    }

    return new NextResponse(new Uint8Array(logo.bytes), {
        headers: {
            'Content-Type': logo.contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
    })
}

export async function HEAD(_request: Request, { params }: RouteContext) {
    const { file } = await params
    const logo = await loadCriatorioLogo(file)

    if (!logo) {
        return new NextResponse(null, { status: 404 })
    }

    return new NextResponse(null, {
        headers: {
            'Content-Type': logo.contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Length': String(logo.bytes.byteLength),
        },
    })
}
