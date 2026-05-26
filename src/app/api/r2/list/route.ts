import { NextRequest, NextResponse } from 'next/server';
import { assertR2Admin, listR2Objects } from '@/lib/r2';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    try {
        await assertR2Admin();
        const { searchParams } = new URL(req.url);
        const continuationToken = searchParams.get('cursor') ?? undefined;
        const maxKeys = Number(searchParams.get('limit') ?? '1000');
        const result = await listR2Objects({ continuationToken, maxKeys });
        return NextResponse.json(result);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erro inesperado.';
        if (msg !== 'Não autenticado.' && msg !== 'Acesso negado.') {
            console.error('[r2/list]', e);
        }
        const status = msg === 'Não autenticado.' ? 401
            : msg === 'Acesso negado.' ? 403
            : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}
