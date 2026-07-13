import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const execFileAsync = promisify(execFile)
const DEFAULT_ESCALA_DRIVE_FILE_ID = '1rzEUSB1Rt4DQ7xlj3Wej4Rn-NwnMSgGk'

export async function POST() {
    const admin = await requireAdmin()
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status })

    const driveFileId = process.env.BULA_ESCALA_DRIVE_FILE_ID ?? DEFAULT_ESCALA_DRIVE_FILE_ID
    const tempFile = join(tmpdir(), `escala-leiloes-${randomUUID()}.xlsx`)

    try {
        const response = await fetch(
            `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveFileId)}`,
            { cache: 'no-store' },
        )
        if (!response.ok) {
            throw new Error(`Falha ao baixar a planilha do Google Drive (${response.status}).`)
        }

        const spreadsheet = Buffer.from(await response.arrayBuffer())
        if (spreadsheet.length < 100_000) {
            throw new Error('O arquivo recebido do Google Drive nao parece ser a planilha XLSX esperada.')
        }
        await writeFile(tempFile, spreadsheet)

        const { stdout, stderr } = await execFileAsync(
            process.execPath,
            [
                'scripts/sync-escala-leiloes-2026.mjs',
                tempFile,
                '--months=2026-07,2026-08',
                '--keep-extras',
            ],
            {
                cwd: process.cwd(),
                timeout: 285_000,
                maxBuffer: 1024 * 1024 * 8,
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
    } finally {
        await rm(tempFile, { force: true }).catch(() => undefined)
    }
}
