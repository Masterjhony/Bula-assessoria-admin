// ─────────────────────────────────────────────────────────────────────────────
// Provedor de SCORE DE CRÉDITO + PROTESTOS por CPF (adaptador plugável).
//
// No Brasil NÃO existe API gratuita/oficial de score por CPF nem de protestos:
// os dados vêm de bureaus PAGOS (Serasa/SPC/Boa Vista/Quod) e de cartórios
// (CENPROT), normalmente via um agregador HTTP. Este módulo abstrai isso atrás
// de uma interface única para que a automação funcione fim-a-fim e baste plugar
// as credenciais quando o provedor for contratado.
//
// Configuração via env (.env.local):
//   CREDIT_PROVIDER_URL    → endpoint POST que recebe { cpf } e devolve JSON
//   CREDIT_PROVIDER_TOKEN  → bearer token / api key do provedor
// Sem essas variáveis o adaptador opera em MODO STUB: marca `pending: true` e
// NÃO inventa score/protestos.
// ─────────────────────────────────────────────────────────────────────────────

import { type Protesto, type ScoreFaixa, scoreToFaixa, onlyDigits } from '@/lib/clientes'

export interface CreditReport {
  score: number | null
  faixa: ScoreFaixa
  protestos: Protesto[]
  provider: string
  consultedAt: string // ISO
  pending: boolean // true quando o provedor não está configurado / não retornou
  message?: string
}

export interface CreditProvider {
  name: string
  configured: boolean
  consultarCpf(cpf: string): Promise<CreditReport>
}

// Tenta extrair protestos de formatos comuns de resposta de agregadores.
function parseProtestos(raw: unknown): Protesto[] {
  if (!raw || typeof raw !== 'object') return []
  const o = raw as Record<string, unknown>
  const arr =
    (Array.isArray(o.protestos) && o.protestos) ||
    (Array.isArray(o.protests) && o.protests) ||
    (Array.isArray((o.resultado as Record<string, unknown>)?.protestos) &&
      (o.resultado as Record<string, unknown>).protestos) ||
    []
  return (arr as Record<string, unknown>[]).map((p) => ({
    cartorio: p.cartorio ? String(p.cartorio) : undefined,
    cidade: p.cidade ? String(p.cidade) : undefined,
    uf: p.uf ? String(p.uf) : undefined,
    valor: p.valor != null ? Number(p.valor) || undefined : undefined,
    data: p.data ? String(p.data).slice(0, 10) : undefined,
    titulo: p.titulo ? String(p.titulo) : undefined,
  }))
}

function parseScore(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const candidates = [o.score, o.score_credito, o.pontuacao, (o.resultado as Record<string, unknown>)?.score]
  for (const c of candidates) {
    const n = Number(c)
    if (Number.isFinite(n) && n > 0) return Math.round(n)
  }
  return null
}

function stubReport(message: string): CreditReport {
  return {
    score: null,
    faixa: '',
    protestos: [],
    provider: 'stub',
    consultedAt: new Date().toISOString(),
    pending: true,
    message,
  }
}

class HttpCreditProvider implements CreditProvider {
  name = 'http'
  constructor(private url: string, private token: string) {}
  get configured() {
    return Boolean(this.url && this.token)
  }
  async consultarCpf(cpf: string): Promise<CreditReport> {
    const digits = onlyDigits(cpf)
    if (digits.length !== 11) return stubReport('CPF inválido (precisa de 11 dígitos).')
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ cpf: digits }),
        // evita travar a automação se o provedor demorar
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) return stubReport(`Provedor retornou HTTP ${res.status}.`)
      const raw = await res.json()
      const score = parseScore(raw)
      return {
        score,
        faixa: scoreToFaixa(score),
        protestos: parseProtestos(raw),
        provider: this.name,
        consultedAt: new Date().toISOString(),
        pending: false,
      }
    } catch (e) {
      return stubReport(`Falha ao consultar provedor: ${e instanceof Error ? e.message : 'erro'}`)
    }
  }
}

class StubCreditProvider implements CreditProvider {
  name = 'stub'
  configured = false
  async consultarCpf(): Promise<CreditReport> {
    return stubReport('Provedor de crédito não configurado (defina CREDIT_PROVIDER_URL/TOKEN ou INFOSIMPLES_TOKEN).')
  }
}

// Direct Data: score QUOD (/api/Score) + protestos IEPTB Online — o relatório
// completo numa passada. `pending` quando AMBAS as consultas falharem; se só
// uma falhar, entrega a outra com a ressalva na mensagem.
class DirectdCreditProvider implements CreditProvider {
  name = 'directd'
  configured = true
  async consultarCpf(cpf: string): Promise<CreditReport> {
    const digits = onlyDigits(cpf)
    if (digits.length !== 11) return stubReport('CPF inválido (precisa de 11 dígitos).')
    const { consultarScoreDirectd, consultarProtestosDirectd } = await import('@/lib/directd-provider')
    const [s, p] = await Promise.all([
      consultarScoreDirectd(digits),
      consultarProtestosDirectd(digits),
    ])
    if (s.pending && p.pending) {
      return stubReport(`Direct Data indisponível: ${s.message || p.message || 'erro'}`)
    }
    const notes: string[] = []
    if (s.pending) notes.push(`score pendente (${s.message || 'erro'})`)
    if (p.pending) notes.push(`protestos pendentes (${p.message || 'erro'})`)
    return {
      score: s.score,
      faixa: scoreToFaixa(s.score),
      protestos: p.protestos.map((x) => ({
        cartorio: x.cartorio, cidade: x.cidade, uf: x.uf,
        valor: x.valor, data: x.data, titulo: x.titulo,
      })),
      provider: this.name,
      consultedAt: new Date().toISOString(),
      pending: false,
      message: notes.length ? `Parcial: ${notes.join('; ')}` : 'Score QUOD + protestos IEPTB (Direct Data).',
    }
  }
}

// Infosimples: protestos REAIS via CENPROT (ieptb/protestos). Score de bureau
// (Serasa/SPC) não é oferecido — devolvemos score null com protestos válidos,
// que é o dado que pesa na aprovação manual. `pending` só quando a consulta
// em si falhou (aí não gravamos "sem protestos" indevidamente).
class InfosimplesCreditProvider implements CreditProvider {
  name = 'infosimples'
  configured = true
  async consultarCpf(cpf: string): Promise<CreditReport> {
    const digits = onlyDigits(cpf)
    if (digits.length !== 11) return stubReport('CPF inválido (precisa de 11 dígitos).')
    const { consultarProtestosInfosimples } = await import('@/lib/infosimples-provider')
    const r = await consultarProtestosInfosimples(digits)
    return {
      score: null,
      faixa: '',
      protestos: r.protestos.map((p) => ({
        cartorio: p.cartorio,
        cidade: p.cidade,
        uf: p.uf,
        valor: p.valor,
        data: p.data,
        titulo: p.titulo,
      })),
      provider: this.name,
      consultedAt: new Date().toISOString(),
      pending: r.pending,
      message: r.pending
        ? r.message
        : 'Protestos via CENPROT (Infosimples). Score de bureau não disponível neste provedor.',
    }
  }
}

export function getCreditProvider(): CreditProvider {
  const url = process.env.CREDIT_PROVIDER_URL || ''
  const token = process.env.CREDIT_PROVIDER_TOKEN || ''
  if (url && token) return new HttpCreditProvider(url, token)
  // Direct Data na frente: é o único com score de bureau (QUOD) + protestos
  // sem exigir habilitação/GOV.BR. Infosimples fica de fallback (protestos).
  if (process.env.DIRECTD_TOKEN) return new DirectdCreditProvider()
  if (process.env.INFOSIMPLES_TOKEN) return new InfosimplesCreditProvider()
  return new StubCreditProvider()
}

export async function consultarCredito(cpf: string): Promise<CreditReport> {
  return getCreditProvider().consultarCpf(cpf)
}
