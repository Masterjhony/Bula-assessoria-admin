import { NextResponse } from 'next/server';

const GLM_API_KEY = process.env.GLM_API_KEY ?? 'cc315be9de774348a411618c653faad0.ITLRcDX7Memszozq';
const BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

// Lista abrangente baseada na documentação oficial atual
const CANDIDATE_MODELS = [
    // Docs de quickstart (curl examples) — mais prováveis de funcionar
    'glm-5',
    'glm-5-turbo',
    'glm-4.7',
    'glm-4.7-flash',
    'glm-4.7-flashx',
    // Mencionados em tool-calling docs
    'glm-4-air',
    'glm-4-airx',
    'glm-4-alltools',
    // Versões com data
    'glm-4-flash-250414',
    'glm-4-flashx-250414',
    // Versões numeradas antigas
    'glm-4.6',
    'glm-4.5-air',
    'glm-4-long',
    // Nomes antigos
    'glm-4-flash',
    'glm-4',
    'glm-3-turbo',
];

export async function GET() {
    const results: Record<string, string> = {};

    // Tenta listar modelos via /models endpoint (OpenAI-compat)
    let availableModels: string[] | null = null;
    try {
        const modelsRes = await fetch(`${BASE_URL}/models`, {
            headers: { Authorization: `Bearer ${GLM_API_KEY}` },
        });
        if (modelsRes.ok) {
            const modelsData = await modelsRes.json();
            availableModels = modelsData?.data?.map((m: { id: string }) => m.id) ?? null;
        }
    } catch {
        // endpoint não disponível
    }

    // Testa cada modelo candidato
    for (const model of CANDIDATE_MODELS) {
        try {
            const res = await fetch(`${BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${GLM_API_KEY}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: 'hi' }],
                    max_tokens: 5,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                results[model] = '✅ FUNCIONA';
            } else {
                results[model] = `❌ ${data?.error?.code}: ${data?.error?.message}`;
            }
        } catch (e) {
            results[model] = `💥 ${e instanceof Error ? e.message : 'falha de rede'}`;
        }
    }

    return NextResponse.json({
        key_prefix: GLM_API_KEY.slice(0, 10) + '...',
        models_endpoint: availableModels ?? 'não disponível',
        results,
    });
}
