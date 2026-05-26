'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// ClickSign foi cortado nesta versão do web-bula. A integração permanece
// EXCLUSIVA do Fórmula do Boi. Aqui mantemos só upload manual de PDF +
// CRUD de status. Os types/funcs ClickSign existem como stubs apenas para
// não quebrar a tipagem no ContractsView (que ainda exibe os campos).

export interface ClickSignSignerRecord {
  key: string
  name: string
  email: string
  request_signature_key: string
  signed_at?: string | null
}

export interface Contract {
  id: string
  client_name: string
  title: string
  status: 'Ativo' | 'Pendente' | 'Vencido' | 'Cancelado'
  value?: number | null
  start_date?: string | null
  end_date?: string | null
  file_url?: string | null
  file_path?: string | null
  file_name?: string | null
  notes?: string | null
  // Campos abaixo são sempre null no web-bula (ClickSign cortado).
  clicksign_document_key?: string | null
  clicksign_status?: string | null
  clicksign_url?: string | null
  clicksign_signers?: ClickSignSignerRecord[] | null
  clicksign_sent_at?: string | null
  clicksign_finished_at?: string | null
  clicksign_signed_url?: string | null
  created_at: string
  updated_at: string
}

export type ContractInput = Omit<
  Contract,
  | 'id' | 'created_at' | 'updated_at'
  | 'clicksign_document_key' | 'clicksign_status' | 'clicksign_url'
  | 'clicksign_signers' | 'clicksign_sent_at' | 'clicksign_finished_at'
  | 'clicksign_signed_url'
>

export interface ClickSignSendInput {
  contractId: string
  signers: Array<{
    name: string
    email: string
    phone_number?: string
    documentation?: string
    auths?: Array<'email' | 'sms' | 'whatsapp' | 'pix' | 'icp_brasil'>
    sign_as?: string
  }>
  deadlineAt?: string
  message?: string
  sequenceEnabled?: boolean
}

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function ensureBucket(admin: ReturnType<typeof getAdminClient>) {
  const { error } = await admin.storage.createBucket('contracts', { public: true })
  if (error && !error.message.includes('already exists')) throw new Error(error.message)
}

export async function uploadContractFile(formData: FormData): Promise<{ url: string; path: string; name: string }> {
  const file = formData.get('file') as File
  if (!file) throw new Error('Nenhum arquivo enviado')
  const admin = getAdminClient()
  await ensureBucket(admin)
  const safeName = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = `${Date.now()}_${safeName}`
  const bytes = await file.arrayBuffer()
  const { error } = await admin.storage.from('contracts').upload(filePath, bytes, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (error) throw new Error(error.message)
  const { data } = admin.storage.from('contracts').getPublicUrl(filePath)
  return { url: data.publicUrl, path: filePath, name: file.name }
}

export async function deleteContractFile(filePath: string): Promise<void> {
  const admin = getAdminClient()
  await admin.storage.from('contracts').remove([filePath])
}

export async function getContracts(): Promise<Contract[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tactical_contracts')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) { console.error('getContracts:', error); return [] }
  return data as Contract[]
}

export async function createContract(input: ContractInput): Promise<Contract> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tactical_contracts')
    .insert([input])
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/sistema/contratos')
  return data as Contract
}

export async function updateContract(id: string, input: Partial<ContractInput>): Promise<Contract> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tactical_contracts')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/sistema/contratos')
  return data as Contract
}

export async function deleteContract(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tactical_contracts')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/sistema/contratos')
}

// ─── Stubs ClickSign (cortado) ──────────────────────────────────────────
// Mantemos as assinaturas para que ContractsView continue compilando;
// chamar qualquer uma destas funções resulta em erro com mensagem clara.

const CLICKSIGN_DISABLED = 'ClickSign não está disponível neste ambiente. Use upload de PDF.'

export async function sendContractToClickSign(_input: ClickSignSendInput): Promise<Contract> {
  throw new Error(CLICKSIGN_DISABLED)
}
export async function syncContractFromClickSign(_contractId: string): Promise<Contract> {
  throw new Error(CLICKSIGN_DISABLED)
}
export async function syncAllContractsFromClickSign(): Promise<{ imported: number; skipped: number; error?: string }> {
  return { imported: 0, skipped: 0, error: CLICKSIGN_DISABLED }
}
export async function cancelContractClickSign(_contractId: string): Promise<Contract> {
  throw new Error(CLICKSIGN_DISABLED)
}
