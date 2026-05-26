import { NextRequest } from 'next/server'
import { requireUser, supabaseAdmin } from '@/lib/supabase'
import { fail, ok, unauthorized } from '@/lib/respond'

type Ctx = { params: { id: string } }

async function update(req: NextRequest, params: { id: string }) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const { data, error } = await supabaseAdmin()
    .from('leads')
    .update(body)
    .eq('id', params.id)
    .select('*')
    .single()
  if (error) return fail(error.message, 400)
  return ok(data)
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  return update(req, params)
}
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return update(req, params)
}

// O frontend usa POST /api/bula/leads/:id quando qualifica um lead.
// Acao: marcar lead como qualificado + criar deal no funil "clientes".
export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const admin = supabaseAdmin()

  const { data: lead, error: errLead } = await admin
    .from('leads')
    .update({ ...body, status: 'qualificado' })
    .eq('id', params.id)
    .select('*')
    .single()
  if (errLead) return fail(errLead.message, 400)

  const { data: funil } = await admin
    .from('crm_funis')
    .select('id')
    .eq('slug', 'clientes')
    .single()

  if (funil?.id) {
    await admin.from('crm_deals').insert({
      funil_id: funil.id,
      etapa_id: 'prospect',
      nome: lead.nome,
      telefone: lead.telefone,
      localizacao: lead.regiao,
      valor: lead.orcamento || 0,
      temperatura: 'morno',
      notas: lead.interesse ? `Interesse: ${lead.interesse}` : '',
    })
  }

  return ok(lead)
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const { error } = await supabaseAdmin().from('leads').delete().eq('id', params.id)
  if (error) return fail(error.message, 400)
  return ok({ ok: true })
}
