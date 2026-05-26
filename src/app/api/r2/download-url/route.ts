import { NextRequest, NextResponse } from 'next/server';
import { assertR2Admin, getR2DownloadUrl, stripR2Prefix } from '@/lib/r2';

export const runtime = 'nodejs';

/** GET /api/r2/download-url?key=<key>&ttl=<segundos>
 *  Retorna { url, expiresIn } — link assinado para baixar 1 objeto. */
export async function GET(req: NextRequest) {
    try {
        await assertR2Admin();
        const { searchParams } = new URL(req.url);
        const key = searchParams.get('key');
        if (!key) return NextResponse.json({ error: 'key obrigatório.' }, { status: 400 });
        const ttl = Number(searchParams.get('ttl') ?? '3600');

        const url = await getR2DownloadUrl(key, {
            expiresInSeconds: ttl,
            downloadAs: stripR2Prefix(key).split('/').pop(),
        });
        return NextResponse.json({ url, expiresIn: ttl });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erro inesperado.';
        if (msg !== 'Não autenticado.' && msg !== 'Acesso negado.' && !msg.startsWith('Key')) {
            console.error('[r2/download-url]', e);
        }
        const status = msg === 'Não autenticado.' ? 401
            : msg === 'Acesso negado.' ? 403
            : msg.startsWith('Key') ? 400
            : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}
