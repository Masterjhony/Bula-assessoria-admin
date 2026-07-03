/**
 * Extração de dados de lotes de um catálogo de leilão (PDF) via IA.
 *
 * POST { catalogo_url, lotes: number[] } → { condicoes, lotes: [...] }
 *
 * O PDF é baixado server-side e enviado ao OpenRouter (Gemini lê PDF nativo).
 * A resposta alimenta a página Ferramentas → GIF de Lotes, que monta as
 * legendas no padrão de divulgação e envia GIF+texto pelo Baileys.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { DEFAULT_OPENROUTER_MODEL, parseLooseJson } from '@/lib/openrouter'

export const maxDuration = 300

const MAX_PDF_BYTES = 20 * 1024 * 1024

export interface LoteExtraido {
  lote: number
  nome: string
  rg: string | null
  nascimento: string | null
  idade: string | null
  categoria: string | null
  peso_atual_kg: number | null
  pai: string | null
  mae: string | null
  mgte: { valor: string; top: string } | null
  iqg: { valor: string; top: string } | null
  iabcz: { valor: string; deca: string; p: string | null } | null
  prenhe_de: string | null
  previsao_parto: string | null
  cria: { sexo: string; peso_kg: number | null; nascimento: string | null } | null
  obs: string | null
}

const PROMPT = (lotes: number[]) => `Você está lendo o catálogo (PDF) de um leilão de gado. Extraia os dados EXATOS dos lotes ${lotes.join(', ')}.
Responda SÓ com JSON válido:
{
 "condicoes": {"parcelas": "<ex: 30 PARCELAS 2+2+2+2+2+20, ou null>", "avista": "<ex: 8% DE DESCONTO, ou null>", "frete": "<resumo da regra de frete, ou null>"},
 "lotes": [{
   "lote": <número>, "nome": "<nome do animal>", "rg": "<RG>",
   "nascimento": "<dd/mm/aaaa>", "idade": "<como impresso>",
   "categoria": "<SOLTEIRA/PARIDA/etc como impresso>",
   "peso_atual_kg": <número ou null>,
   "pai": "<PAI do animal — no pedigree é o nome em destaque do lado esquerdo, formato 'NOME | RG'>",
   "mae": "<MÃE — nome em destaque do lado direito do pedigree, formato 'NOME | RG'>",
   "mgte": {"valor": "<ex 22,30>", "top": "<TOP da coluna MGTe>"},
   "iqg": {"valor": "...", "top": "..."},
   "iabcz": {"valor": "...", "deca": "...", "p": "<P% ou null>"},
   "prenhe_de": "<touro da prenhez ou null>", "previsao_parto": "<data ou null>",
   "cria": {"sexo": "MACHO|FEMEA", "peso_kg": <número|null>, "nascimento": "<data|null>"} ou null,
   "obs": "<condição especial ou null>"
 }]
}
Atenção: MGTe/IQG/iABCZ do animal do lote são os da tabela principal (colunas MGTe|TOP, IQG|TOP, iABCZ|DECA|P%) — não confunda com "AVALIAÇÃO DE VENTRE"/"AVALIAÇÃO DE CRIA".`

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY não configurada' }, { status: 501 })
  }

  const body = await request.json().catch(() => null) as { catalogo_url?: string; lotes?: number[] } | null
  const catalogoUrl = String(body?.catalogo_url || '').trim()
  const lotes = (body?.lotes ?? []).map(Number).filter(n => Number.isFinite(n) && n > 0)
  if (!catalogoUrl || lotes.length === 0) {
    return NextResponse.json({ error: 'catalogo_url e lotes são obrigatórios' }, { status: 400 })
  }
  if (lotes.length > 40) {
    return NextResponse.json({ error: 'Máximo de 40 lotes por extração' }, { status: 400 })
  }

  let pdf: ArrayBuffer
  try {
    const res = await fetch(catalogoUrl, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    pdf = await res.arrayBuffer()
  } catch (e) {
    return NextResponse.json({ error: `Falha ao baixar o catálogo: ${e instanceof Error ? e.message : e}` }, { status: 502 })
  }
  if (pdf.byteLength > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'Catálogo acima de 20MB — use uma versão comprimida' }, { status: 413 })
  }

  const b64 = Buffer.from(pdf).toString('base64')
  const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://bulaassessoria.com',
      'X-Title': 'Bula Assessoria CRM',
    },
    body: JSON.stringify({
      model: DEFAULT_OPENROUTER_MODEL,
      temperature: 0,
      max_tokens: 16000,
      usage: { include: true },
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT(lotes) },
          { type: 'file', file: { filename: 'catalogo.pdf', file_data: `data:application/pdf;base64,${b64}` } },
        ],
      }],
    }),
    signal: AbortSignal.timeout(240_000),
  })

  if (!orRes.ok) {
    const detail = await orRes.text().catch(() => '')
    return NextResponse.json({ error: `IA falhou (${orRes.status}): ${detail.slice(0, 300)}` }, { status: 502 })
  }

  const data = await orRes.json() as { choices?: Array<{ message?: { content?: string } }> }
  const parsed = parseLooseJson<{ condicoes?: Record<string, string | null>; lotes?: LoteExtraido[] }>(
    data.choices?.[0]?.message?.content ?? '',
  )
  if (!parsed?.lotes?.length) {
    return NextResponse.json({ error: 'IA não retornou lotes válidos — tente novamente' }, { status: 502 })
  }

  return NextResponse.json({ condicoes: parsed.condicoes ?? null, lotes: parsed.lotes })
}
