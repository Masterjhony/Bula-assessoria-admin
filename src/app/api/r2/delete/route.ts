import { NextRequest, NextResponse } from 'next/server';
import { assertR2Admin, deleteR2Object } from '@/lib/r2';

export const runtime = 'nodejs';

/** POST /api/r2/delete  body: { key: string } */
export async function POST(req: NextRequest) {
    try {
        await assertR2Admin();
        const body = await req.json().catch(() => ({}));
        const key = typeof body?.key === 'string' ? body.key : '';
        if (!key) return NextResponse.json({ error: 'key obrigatório.' }, { status: 400 });

        await deleteR2Object(key);
        return NextResponse.json({ ok: true });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erro inesperado.';
        if (msg !== 'Não autenticado.' && msg !== 'Acesso negado.' && !msg.startsWith('Key')) {
            console.error('[r2/delete]', e);
        }
        const status = msg === 'Não autenticado.' ? 401
            : msg === 'Acesso negado.' ? 403
            : msg.startsWith('Key') ? 400
            : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}
