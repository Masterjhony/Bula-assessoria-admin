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

// Desligado em 24/08/2026 a pedido do Joao. A planilha ESCALA deixou de ser a
// fonte da agenda: o sync desfazia edicao feita no sistema -- recriava leilao
// removido, apagava leilao que so existia aqui e sobrescrevia capa boa pela
// versao da planilha (a capa da planilha vence por regra). A agenda passa a
// ser editada direto no admin.
//
// Pra religar: apagar esta trava, devolver o botao em
// src/app/sistema/leiloes/page.tsx e tirar a guarda do topo de
// scripts/sync-escala-leiloes-2026.mjs. Antes disso, alinhar a planilha com o
// banco, senao o primeiro sync desfaz tudo de novo.
const SYNC_DESATIVADO = true

export async function POST() {
    const admin = await requireAdmin()
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status })

    if (SYNC_DESATIVADO) {
        return NextResponse.json({
            error: 'A sincronizacao com a planilha ESCALA esta desativada desde 24/08/2026. '
                + 'A agenda e editada direto no sistema; a planilha nao e mais a fonte.',
        }, { status: 409 })
    }

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
