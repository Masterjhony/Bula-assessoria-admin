/**
 * Página pública de habilitação (/habilitacao) — contrato compartilhado entre
 * as rotas (/api/habilitacao/*) e o formulário.
 *
 * Fluxo em 2 tempos por causa do limite de ~4.5MB do body na Vercel: o submit
 * grava os DADOS e devolve signed upload URLs; o browser sobe cada documento
 * DIRETO no Supabase Storage (bucket cliente-documentos, o mesmo do funil
 * WhatsApp); o confirm registra os arquivos em crm_lead_documentos e dispara o
 * sync de habilitação (checklist + ficha, o mesmo pipeline do concierge).
 */

import type { LeadDocTipo } from './whatsapp-lead-documents'
import type { DocTipoSemantico } from './crm-habilitacao'

/** Os 4 documentos do dossiê (régua 22/07), com as equivalências no rótulo. */
export const HABILITACAO_DOC_SLOTS: Array<{
    slot: DocTipoSemantico
    tipoDoc: LeadDocTipo
    label: string
    hint: string
}> = [
    {
        slot: 'identidade',
        tipoDoc: 'cpf',
        label: 'Documento pessoal com foto',
        hint: 'RG, CNH ou CPF — um deles resolve. Foto legível ou PDF.',
    },
    {
        slot: 'comprovante_endereco',
        tipoDoc: 'endereco',
        label: 'Comprovante de residência',
        hint: 'Conta de luz, água ou telefone recente em seu nome.',
    },
    {
        slot: 'certidao_matricula',
        tipoDoc: 'matricula',
        label: 'Certidão de ônus ou matrícula da fazenda',
        hint: 'Certidão de ônus, matrícula ou escritura. Fazenda arrendada: contrato de arrendamento.',
    },
    {
        slot: 'comprovante_renda',
        tipoDoc: 'renda',
        label: 'Comprovante de renda',
        hint: 'Declaração de Imposto de Renda OU extrato bancário dos últimos 3 meses.',
    },
]

export const HABILITACAO_MAX_FILE_BYTES = 25 * 1024 * 1024 // limite do bucket
export const HABILITACAO_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'

/** Validação de CPF com dígitos verificadores (profissionalismo no form). */
export function cpfValido(raw: string): boolean {
    const cpf = raw.replace(/\D/g, '')
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
    const dv = (base: string) => {
        let sum = 0
        for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (base.length + 1 - i)
        const r = (sum * 10) % 11
        return r === 10 ? 0 : r
    }
    return dv(cpf.slice(0, 9)) === Number(cpf[9]) && dv(cpf.slice(0, 10)) === Number(cpf[10])
}
