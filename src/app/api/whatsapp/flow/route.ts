import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const WHATSAPP_SERVER_URL = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001';

function getSupabaseAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
}

const DEFAULT_CONFIG = {
    welcome_message: `Olá {nome}! Seja bem vindo(a)! 🎉\n\nGostaríamos de te apresentar a *Fórmula do Boi*!\n\nAcesse nosso Marketplace e confira nossas ofertas exclusivas:\n👉 https://formuladoboi.com`,
    options: [] as { key: string; label: string; response: string }[],
    flow_timeout_minutes: 60,
};

export async function GET() {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'whatsapp_flow')
        .single();

    return NextResponse.json(data?.value ?? DEFAULT_CONFIG);
}

export async function PUT(request: NextRequest) {
    const body = await request.json();

    // Basic validation
    if (typeof body.welcome_message !== 'string') {
        return NextResponse.json({ error: 'welcome_message inválida' }, { status: 400 });
    }

    const config = {
        welcome_message: body.welcome_message,
        options: Array.isArray(body.options) ? body.options : [],
        flow_timeout_minutes: Number(body.flow_timeout_minutes) || 60,
    };

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
        .from('site_settings')
        .upsert({
            key: 'whatsapp_flow',
            value: config,
            description: 'Configuração do fluxo de mensagens WhatsApp automáticas',
            updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Notify VPS server to reload config (non-fatal if it fails)
    try {
        await fetch(`${WHATSAPP_SERVER_URL}/reload-config`, {
            method: 'POST',
            signal: AbortSignal.timeout(5000),
        });
    } catch {
        // Server will pick up the new config on its next periodic poll
    }

    return NextResponse.json({ success: true });
}
