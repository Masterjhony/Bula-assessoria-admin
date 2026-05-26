import { NextRequest, NextResponse } from 'next/server';
import { assertR2Admin, getR2UploadUrl, sanitizeR2Filename } from '@/lib/r2';

export const runtime = 'nodejs';

/** POST /api/r2/upload-url
 *  body: { filename: string, contentType?: string, ttl?: number }
 *  Retorna { url, key } — presigned PUT pra browser fazer upload direto.
 *  Limite single-PUT: 5GB. Acima disso, evoluir pra multipart upload. */
export async function POST(req: NextRequest) {
    try {
        await assertR2Admin();
        const body = await req.json().catch(() => ({}));
        const filename = typeof body?.filename === 'string' ? body.filename : '';
        if (!filename) return NextResponse.json({ error: 'filename obrigatório.' }, { status: 400 });

        const key = sanitizeR2Filename(filename);
        const { url } = await getR2UploadUrl(key, {
            contentType: body?.contentType,
            expiresInSeconds: body?.ttl,
        });
        return NextResponse.json({ url, key });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erro inesperado.';
        if (msg !== 'Não autenticado.' && msg !== 'Acesso negado.') {
            console.error('[r2/upload-url]', e);
        }
        const status = msg === 'Não autenticado.' ? 401
            : msg === 'Acesso negado.' ? 403
            : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}
