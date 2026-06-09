import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fail, ok } from '@/lib/respond'

// Endpoint PÚBLICO da landing jmp.bulaassessoria.com (formulário Nelore JMP).
// Não exige usuário autenticado: grava o lead direto em crm_leads via service
// role. Só aceita os campos do formulário e mapeia para as colunas reais do
// CRM (mesmas usadas em src/app/sistema/actions/crm-leads.ts). Qualquer campo
// extra é ignorado — não confiamos no corpo da requisição.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  const nome = String(body.nome ?? '').trim()
  const email = String(body.email ?? '').trim()
  const whatsapp = String(body.whatsapp ?? '').trim()
  if (!nome) return fail('nome é obrigatório.')
  if (!email) return fail('email é obrigatório.')
  if (!whatsapp) return fail('whatsapp é obrigatório.')

  const str = (v: unknown) => {
    const s = String(v ?? '').trim()
    return s.length ? s : null
  }

  const lead = {
    nome,
    email,
    telefone: whatsapp,
    estado: str(body.uf),
    cidade: str(body.cidade),
    momento_pecuaria: str(body.momento),
    quantidade_animais: str(body.cabecas),
    interesse: str(body.interesse),
    status: 'Lead',
    is_mql: true,
    origem: 'Landing JMP — Nelore 13/14 jun',
    source: 'jmp-landing',
    source_page: 'jmp.bulaassessoria.com',
    landing_url:
      req.headers.get('referer') || 'https://jmp.bulaassessoria.com/',
    data_entrada: new Date().toISOString(),
  }

  const { data, error } = await supabaseAdmin()
    .from('crm_leads')
    .insert(lead)
    .select('id')
    .single()

  if (error) {
    console.error('[JMP lead] insert failed:', error.message)
    return fail('Não foi possível registrar a inscrição.', 500)
  }

  return ok({ id: data?.id })
}
