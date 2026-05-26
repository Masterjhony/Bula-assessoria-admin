/**
 * GET /api/r2/health
 *
 * Diagnóstico admin do R2 — revela onde está o problema quando upload falha.
 * Checa:
 *   - Quais env vars R2_* estão setadas (sem mostrar valores).
 *   - Conexão com o bucket (HEAD bucket).
 *   - Configuração de CORS do bucket — se ausente, browser bloqueia PUT.
 *
 * Não revela secrets nem URLs internas. Só admin pode chamar.
 */

import { NextResponse } from 'next/server'
import { assertR2Admin } from '@/lib/r2'
import { AwsClient } from 'aws4fetch'
import { XMLParser } from 'fast-xml-parser'

export const runtime = 'nodejs'

const REQUIRED_ENVS = [
    'R2_ACCOUNT_ID', 'R2_ENDPOINT', 'R2_BUCKET',
    'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY',
] as const

export async function GET() {
    try {
        await assertR2Admin()
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'erro de auth'
        const status = msg === 'Não autenticado.' ? 401 : 403
        return NextResponse.json({ error: msg }, { status })
    }

    const envStatus: Record<string, 'set' | 'missing'> = {}
    const missing: string[] = []
    for (const k of REQUIRED_ENVS) {
        const present = !!process.env[k]
        envStatus[k] = present ? 'set' : 'missing'
        if (!present) missing.push(k)
    }

    if (missing.length > 0) {
        return NextResponse.json({
            ok: false,
            stage: 'envs',
            envs: envStatus,
            error: `Variáveis ausentes na Vercel: ${missing.join(', ')}`,
            hint: 'Configure no painel da Vercel → Settings → Environment Variables.',
        })
    }

    // Conexão com o bucket
    const endpoint = process.env.R2_ENDPOINT!.replace(/\/+$/, '')
    const bucket = process.env.R2_BUCKET!
    const bucketUrl = `${endpoint}/${bucket}`
    const client = new AwsClient({
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        region: 'auto',
        service: 's3',
    })

    let bucketReachable = false
    let bucketError: string | null = null
    try {
        const r = await client.fetch(`${bucketUrl}/?max-keys=1&list-type=2`, { method: 'GET' })
        bucketReachable = r.ok
        if (!r.ok) {
            const t = await r.text()
            bucketError = `HTTP ${r.status} — ${t.slice(0, 200)}`
        }
    } catch (e) {
        bucketError = e instanceof Error ? e.message : String(e)
    }

    if (!bucketReachable) {
        return NextResponse.json({
            ok: false,
            stage: 'bucket',
            envs: envStatus,
            error: `Não consegui acessar o bucket: ${bucketError}`,
            hint: 'Confira R2_ENDPOINT (https://<account>.r2.cloudflarestorage.com), R2_BUCKET, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY.',
        })
    }

    // CORS do bucket — se não tiver regra CORS, o PUT do navegador é bloqueado
    let corsConfigured = false
    let corsRules: Array<{ origins: string[]; methods: string[] }> = []
    let corsError: string | null = null
    try {
        const r = await client.fetch(`${bucketUrl}/?cors`, { method: 'GET' })
        if (r.ok) {
            const xml = await r.text()
            const parser = new XMLParser({
                ignoreAttributes: true,
                parseTagValue: false,
                isArray: (n) => ['CORSRule', 'AllowedOrigin', 'AllowedMethod', 'AllowedHeader', 'ExposeHeader'].includes(n),
            })
            const parsed = parser.parse(xml) as {
                CORSConfiguration?: {
                    CORSRule?: Array<{
                        AllowedOrigin?: string[]
                        AllowedMethod?: string[]
                    }>
                }
            }
            const rules = parsed.CORSConfiguration?.CORSRule ?? []
            corsConfigured = rules.length > 0
            corsRules = rules.map(r => ({
                origins: r.AllowedOrigin ?? [],
                methods: r.AllowedMethod ?? [],
            }))
        } else if (r.status === 404) {
            corsConfigured = false
            corsError = 'Sem regra CORS no bucket (HTTP 404).'
        } else {
            const t = await r.text()
            corsError = `HTTP ${r.status} — ${t.slice(0, 200)}`
        }
    } catch (e) {
        corsError = e instanceof Error ? e.message : String(e)
    }

    return NextResponse.json({
        ok: bucketReachable && corsConfigured,
        stage: corsConfigured ? 'all_ok' : 'cors',
        envs: envStatus,
        bucket: { reachable: bucketReachable, error: bucketError },
        cors: {
            configured: corsConfigured,
            rules: corsRules,
            error: corsError,
            recommended_rule: !corsConfigured ? {
                AllowedOrigins: [
                    'https://admin.formuladoboi.com',
                    'https://app.formuladoboi.com',
                    'https://formuladoboi.com',
                    'http://localhost:3000',
                ],
                AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD', 'DELETE'],
                AllowedHeaders: ['*'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3600,
            } : undefined,
            hint: !corsConfigured
                ? 'Configure CORS no Cloudflare Dashboard → R2 → seu bucket → Settings → CORS Policy. Cole a regra recommended_rule acima.'
                : undefined,
        },
    })
}
