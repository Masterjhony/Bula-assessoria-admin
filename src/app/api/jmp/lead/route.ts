import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fail, ok } from '@/lib/respond'
import { DEFAULT_JMP_CONTENT, sanitizeContent } from '@/lib/jmp-content'
import { sendJmpWelcomeEmail } from '@/lib/jmp-welcome-email'
import { enrollLeadInEmailFlow } from '@/lib/jmp-email-flow'
import { appendLeadToSheet } from '@/lib/jmp-sheets'

const CONTENT_TABLE = 'jmp_landing_content'
const CONTENT_ROW_ID = 'default'

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

  const leadCtx = {
    nome,
    email,
    whatsapp,
    uf: str(body.uf),
    cidade: str(body.cidade),
    momento: str(body.momento),
    cabecas: str(body.cabecas),
    interesse: str(body.interesse),
  }

  // Conteúdo (templates de e-mail). Carregado uma vez para welcome + fluxo.
  const { data: contentRow } = await supabaseAdmin()
    .from(CONTENT_TABLE)
    .select('data')
    .eq('id', CONTENT_ROW_ID)
    .maybeSingle()
    .then((r) => r, () => ({ data: null }))
  const content = contentRow?.data ? sanitizeContent(contentRow.data) : DEFAULT_JMP_CONTENT

  // Cada efeito colateral é best-effort — nunca derruba o cadastro do lead.
  try {
    await sendJmpWelcomeEmail(content, leadCtx)
  } catch (e) {
    console.error('[JMP lead] welcome email failed:', e)
  }

  try {
    await enrollLeadInEmailFlow(content, { ...leadCtx, leadId: data?.id ?? null })
  } catch (e) {
    console.error('[JMP lead] email flow enroll failed:', e)
  }

  try {
    await appendLeadToSheet({ ...leadCtx, leadId: data?.id ?? null, createdAt: new Date() })
  } catch (e) {
    console.error('[JMP lead] sheets append failed:', e)
  }

  return ok({ id: data?.id })
}
