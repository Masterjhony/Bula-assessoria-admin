import { onlyDigits } from '@/lib/clientes'

const FISCALAPI_BASE_URL = process.env.FISCALAPI_BASE_URL || 'https://api.fiscalapi.com.br'

const UF_SET = new Set([
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP',
  'TO',
])

const UF_BY_NAME: Record<string, string> = {
  ACRE: 'AC',
  ALAGOAS: 'AL',
  AMAZONAS: 'AM',
  AMAPA: 'AP',
  BAHIA: 'BA',
  CEARA: 'CE',
  DISTRITO_FEDERAL: 'DF',
  ESPIRITO_SANTO: 'ES',
  GOIAS: 'GO',
  MARANHAO: 'MA',
  MINAS_GERAIS: 'MG',
  MATO_GROSSO_DO_SUL: 'MS',
  MATO_GROSSO: 'MT',
  PARA: 'PA',
  PARAIBA: 'PB',
  PERNAMBUCO: 'PE',
  PIAUI: 'PI',
  PARANA: 'PR',
  RIO_DE_JANEIRO: 'RJ',
  RIO_GRANDE_DO_NORTE: 'RN',
  RONDONIA: 'RO',
  RORAIMA: 'RR',
  RIO_GRANDE_DO_SUL: 'RS',
  SANTA_CATARINA: 'SC',
  SERGIPE: 'SE',
  SAO_PAULO: 'SP',
  TOCANTINS: 'TO',
}

export interface StateRegistrationRecord {
  inscricao_estadual?: string
  razao_social?: string
  nome_fantasia?: string
  situacao_ie?: string
  uf_ie?: string
  tipo_ie?: string
  municipio?: string
  situacao_cadastral?: string
}

export interface StateRegistrationReport {
  inscricaoEstadual: string | null
  temInscricaoEstadual: 'Sim' | 'Não' | ''
  uf: string | null
  results: StateRegistrationRecord[]
  provider: string
  consultedAt: string
  pending: boolean
  message?: string
}

export function normalizeUf(input?: string | null): string | null {
  const raw = String(input ?? '').trim()
  if (!raw) return null

  const upper = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()

  if (UF_SET.has(upper)) return upper
  return UF_BY_NAME[upper] || null
}

function makeReport(params: Partial<StateRegistrationReport>): StateRegistrationReport {
  return {
    inscricaoEstadual: null,
    temInscricaoEstadual: '',
    uf: null,
    results: [],
    provider: 'fiscalapi',
    consultedAt: new Date().toISOString(),
    pending: false,
    ...params,
  }
}

function normalizeRecord(input: unknown): StateRegistrationRecord | null {
  if (!input || typeof input !== 'object') return null
  const row = input as Record<string, unknown>
  const out: StateRegistrationRecord = {
    inscricao_estadual: row.inscricao_estadual ? String(row.inscricao_estadual) : undefined,
    razao_social: row.razao_social ? String(row.razao_social) : undefined,
    nome_fantasia: row.nome_fantasia ? String(row.nome_fantasia) : undefined,
    situacao_ie: row.situacao_ie ? String(row.situacao_ie) : undefined,
    uf_ie: row.uf_ie ? String(row.uf_ie) : row.uf ? String(row.uf) : undefined,
    tipo_ie: row.tipo_ie ? String(row.tipo_ie) : undefined,
    municipio: row.municipio ? String(row.municipio) : undefined,
    situacao_cadastral: row.situacao_cadastral ? String(row.situacao_cadastral) : undefined,
  }
  return out.inscricao_estadual ? out : null
}

function parseFiscalApiResults(raw: unknown): StateRegistrationRecord[] {
  if (!raw || typeof raw !== 'object') return []
  const body = raw as Record<string, unknown>
  const topResults = Array.isArray(body.results) ? body.results : []

  const flattened: StateRegistrationRecord[] = []
  for (const item of topResults) {
    const row = normalizeRecord(item)
    if (row) {
      flattened.push(row)
      continue
    }

    if (item && typeof item === 'object') {
      const stateResult = item as Record<string, unknown>
      const uf = stateResult.uf ? String(stateResult.uf) : undefined
      const nested = Array.isArray(stateResult.results) ? stateResult.results : []
      for (const nestedItem of nested) {
        const nestedRow = normalizeRecord({ ...(nestedItem as Record<string, unknown>), uf })
        if (nestedRow) flattened.push(nestedRow)
      }
    }
  }
  return flattened
}

function pickBestResult(results: StateRegistrationRecord[]): StateRegistrationRecord | null {
  if (results.length === 0) return null
  return [...results].sort((a, b) => {
    const aActive = /ativ/i.test(`${a.situacao_ie || ''} ${a.situacao_cadastral || ''}`) ? 1 : 0
    const bActive = /ativ/i.test(`${b.situacao_ie || ''} ${b.situacao_cadastral || ''}`) ? 1 : 0
    return bActive - aActive
  })[0] || null
}

async function fiscalApiGet(path: string, params: Record<string, string>): Promise<unknown> {
  const key = process.env.FISCALAPI_API_KEY || ''
  if (!key) throw new Error('FISCALAPI_API_KEY ausente.')

  const url = new URL(path, FISCALAPI_BASE_URL)
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'X-API-Key': key },
    signal: AbortSignal.timeout(25_000),
  })

  if (!res.ok) {
    let code = `HTTP ${res.status}`
    try {
      const body = await res.json()
      const maybeCode = body?.code || body?.error_code || body?.error
      if (maybeCode) code = String(maybeCode)
    } catch {}
    throw new Error(code)
  }

  return res.json()
}

export async function consultarInscricaoEstadualPorCpf(input: {
  cpf: string
  uf?: string | null
  allowAllStates?: boolean
}): Promise<StateRegistrationReport> {
  const cpf = onlyDigits(input.cpf)
  if (cpf.length !== 11) {
    return makeReport({ pending: true, message: 'CPF invalido para consultar I.E.' })
  }

  const uf = normalizeUf(input.uf)
  if (!uf && !input.allowAllStates) {
    return makeReport({ pending: true, message: 'UF ausente; consulta de I.E. nao executada.' })
  }

  try {
    const raw = uf
      ? await fiscalApiGet('/api/consultar', { uf, cpf })
      : await fiscalApiGet('/api/consultar-ie-todos', { cpf })
    const results = parseFiscalApiResults(raw)
    const best = pickBestResult(results)
    return makeReport({
      inscricaoEstadual: best?.inscricao_estadual || null,
      temInscricaoEstadual: best?.inscricao_estadual ? 'Sim' : 'Não',
      uf: best?.uf_ie || uf || null,
      results,
    })
  } catch (e) {
    return makeReport({
      uf,
      pending: true,
      message: `Falha ao consultar I.E.: ${e instanceof Error ? e.message : 'erro'}`,
    })
  }
}
