import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const execFileAsync = promisify(execFile)

export async function POST() {
    const admin = await requireAdmin()
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status })

    try {
        const { stdout, stderr } = await execFileAsync(
            process.execPath,
            ['scripts/sync-escala-leiloes-2026.mjs', '--keep-extras'],
            {
                cwd: process.cwd(),
                timeout: 110_000,
                maxBuffer: 1024 * 1024 * 4,
            },
        )

        return NextResponse.json({
            ok: true,
            message: 'Sincronizacao da planilha concluida.',
            stdout,
            stderr,
        })
    } catch (error) {
        const err = error as Error & { stdout?: string; stderr?: string }
        return NextResponse.json({
            error: err.message,
            stdout: err.stdout ?? '',
            stderr: err.stderr ?? '',
        }, { status: 500 })
    }
}
