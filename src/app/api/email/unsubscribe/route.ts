/**
 * /api/email/unsubscribe (público)
 *
 * Endpoint chamado quando o destinatário clica no link do rodapé de qualquer
 * e-mail da Central. Valida o token HMAC assinado por sendCampaignEmail() e
 * marca o e-mail como opt-out (cache + lead). Retorna uma página HTML simples
 * confirmando.
 *
 * Compliance/LGPD: este endpoint é a única via "self-service" de descadastro
 * — campanhas SEMPRE incluem o link no rodapé via {{UNSUBSCRIBE_URL}}.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyUnsubscribeToken, setEmailOptout } from '@/lib/email-marketing'

function htmlResponse(body: string, status = 200) {
    return new NextResponse(
        `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fórmula do Boi · Descadastro</title><style>
            body{margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#0f0f0f;}
            .wrap{max-width:560px;margin:48px auto;padding:0 16px;}
            .card{background:#fff;border:1px solid #e5e5e5;border-radius:16px;overflow:hidden;}
            .header{background:#0a0a0a;color:#fff;padding:24px 32px;}
            .brand{font-size:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;}
            .sub{font-size:12px;color:#A0792E;margin-top:4px;}
            .body{padding:32px;font-size:15px;line-height:1.6;}
            .ok{color:#16a34a;font-weight:600;}
            .err{color:#dc2626;font-weight:600;}
            .foot{background:#fafafa;padding:16px 32px;border-top:1px solid #eee;font-size:12px;color:#888;text-align:center;}
            a.btn{display:inline-block;margin-top:16px;background:#A0792E;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;}
        </style></head><body><div class="wrap"><div class="card">
            <div class="header"><div class="brand">Fórmula do Boi</div><div class="sub">Preferências de e-mail</div></div>
            <div class="body">${body}</div>
            <div class="foot">© Fórmula do Boi · contato@formuladoboi.com</div>
        </div></div></body></html>`,
        {
            status,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        },
    )
}

export async function GET(req: NextRequest) {
    const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase()
    const token = req.nextUrl.searchParams.get('token')?.trim()

    if (!email || !token) {
        return htmlResponse(
            `<p class="err">Link inválido.</p>
             <p>Não conseguimos identificar o destinatário. Se você quer parar de receber e-mails da Fórmula do Boi, responda a última mensagem com a palavra <strong>DESCADASTRAR</strong>.</p>`,
            400,
        )
    }

    if (!verifyUnsubscribeToken(email, token)) {
        return htmlResponse(
            `<p class="err">Link expirado ou inválido.</p>
             <p>Por segurança, este link não foi reconhecido. Responda a última mensagem com a palavra <strong>DESCADASTRAR</strong> e cuidamos manualmente.</p>`,
            400,
        )
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    try {
        await setEmailOptout(supabase, email, { reason: 'unsubscribe_link' })
    } catch (e) {
        console.error('[email/unsubscribe] falha:', e instanceof Error ? e.message : e)
        return htmlResponse(
            `<p class="err">Tivemos um problema técnico.</p>
             <p>Tente novamente em alguns minutos ou responda a última mensagem com a palavra <strong>DESCADASTRAR</strong>.</p>`,
            500,
        )
    }

    return htmlResponse(
        `<p class="ok">Pronto, ${email} foi descadastrado.</p>
         <p>Você não vai mais receber e-mails automáticos da Fórmula do Boi nesse endereço.</p>
         <p style="color:#666;font-size:13px;">Se mudou de ideia, fale com a gente no WhatsApp ou responda qualquer mensagem nossa pedindo pra reativar — ajustamos rapidinho.</p>
         <a class="btn" href="https://formuladoboi.com">Voltar para o site</a>`,
    )
}
