'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  type Leiloeira, type ClienteLeiloeiraStatus, type CadastroStatus,
  coerceRequisitos,
} from '@/lib/leiloeiras'

type LeiloeiraRow = {
  id: string; nome: string; email_cadastro: string | null; contato: string | null
  requisitos: unknown; observacoes: string | null; ativo: boolean | null; created_at: string | null
}

function mapLeiloeira(r: LeiloeiraRow): Leiloeira {
  return {
    id: r.id,
    nome: r.nome,
    emailCadastro: r.email_cadastro || '',
    contato: r.contato || '',
    requisitos: coerceRequisitos(r.requisitos),
    observacoes: r.observacoes || '',
    ativo: r.ativo !== false,
    createdAt: r.created_at || undefined,
  }
}

export async function getLeiloeiras(): Promise<Leiloeira[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('leiloeiras')
    .select('id, nome, email_cadastro, contato, requisitos, observacoes, ativo, created_at')
    .order('nome', { ascending: true })
  if (error) {
    console.warn('[leiloeiras] tabela indisponível:', error.message)
    return []
  }
  return (data ?? []).map((r) => mapLeiloeira(r as LeiloeiraRow))
}

export interface LeiloeiraInput {
  id?: string
  nome: string
  emailCadastro?: string
  contato?: string
  requisitos?: { requireIe?: boolean; scoreMin?: number; documentos?: string[] }
  observacoes?: string
  ativo?: boolean
}

export async function saveLeiloeira(input: LeiloeiraInput): Promise<Leiloeira> {
  const supabase = await createClient()
  if (!input.nome?.trim()) throw new Error('Nome da leiloeira é obrigatório.')

  const payload = {
    nome: input.nome.trim(),
    email_cadastro: (input.emailCadastro ?? '').trim(),
    contato: (input.contato ?? '').trim(),
    requisitos: coerceRequisitos(input.requisitos),
    observacoes: (input.observacoes ?? '').trim(),
    ativo: input.ativo ?? true,
  }

  const query = input.id
    ? supabase.from('leiloeiras').update(payload).eq('id', input.id)
    : supabase.from('leiloeiras').insert(payload)

  const { data, error } = await query
    .select('id, nome, email_cadastro, contato, requisitos, observacoes, ativo, created_at')
    .single()
  if (error) throw new Error(`Erro ao salvar leiloeira: ${error.message}`)
  revalidatePath('/sistema/clientes/cadastro-leiloeiras')
  revalidatePath('/sistema/clientes')
  return mapLeiloeira(data as LeiloeiraRow)
}

export async function deleteLeiloeira(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('leiloeiras').delete().eq('id', id)
  if (error) throw new Error(`Erro ao excluir leiloeira: ${error.message}`)
  revalidatePath('/sistema/clientes/cadastro-leiloeiras')
  revalidatePath('/sistema/clientes')
}

// ── status de cadastro por cliente × leiloeira ──
type StatusRow = {
  leiloeira_id: string; status: string | null; enviado_at: string | null; aprovado_at: string | null
}

export async function getClienteLeiloeiraStatus(matchKey: string): Promise<ClienteLeiloeiraStatus[]> {
  if (!matchKey) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cliente_leiloeira_cadastro')
    .select('leiloeira_id, status, enviado_at, aprovado_at')
    .eq('cliente_key', matchKey)
  if (error) {
    console.warn('[leiloeiras] status indisponível:', error.message)
    return []
  }
  return (data ?? []).map((r) => {
    const row = r as StatusRow
    return {
      leiloeiraId: row.leiloeira_id,
      status: (['pendente', 'enviado', 'aprovado', 'recusado'].includes(row.status || '')
        ? row.status
        : 'pendente') as CadastroStatus,
      enviadoAt: row.enviado_at || undefined,
      aprovadoAt: row.aprovado_at || undefined,
    }
  })
}

/** Marca/atualiza o status do cadastro do cliente numa leiloeira (upsert). */
export async function setClienteLeiloeiraStatus(
  matchKey: string,
  leiloeiraId: string,
  status: CadastroStatus,
): Promise<void> {
  const supabase = await createClient()
  if (!matchKey || !leiloeiraId) throw new Error('Cliente e leiloeira são obrigatórios.')

  const patch: Record<string, unknown> = { cliente_key: matchKey, leiloeira_id: leiloeiraId, status }
  if (status === 'enviado') patch.enviado_at = new Date().toISOString()
  if (status === 'aprovado') patch.aprovado_at = new Date().toISOString()

  const { error } = await supabase
    .from('cliente_leiloeira_cadastro')
    .upsert(patch, { onConflict: 'cliente_key,leiloeira_id' })
  if (error) throw new Error(`Erro ao atualizar status: ${error.message}`)
  revalidatePath('/sistema/clientes')
}
