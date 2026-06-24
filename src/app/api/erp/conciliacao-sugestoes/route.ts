import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

// Fila de conciliacao sugerida: para cada titulo em aberto (CR/CP) sem baixa
// bancaria, encontra movimentos do extrato com valor compativel e propoe o
// vinculo com score + evidencia. Nada e gravado aqui (so leitura); a aplicacao
// e feita via POST /aplicar apos aprovacao humana.

function norm(s: string) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}
function tokens(s: string): string[] {
  const STOP = new Set(['LEILAO', 'LEILÃO', 'PROGRAMA', 'REMATES', 'PIX', 'TED', 'DOC', 'EMIT', 'RECEB', 'OUTRA', 'CRED', 'DEB', 'DE', 'DO', 'DA', 'BULA', 'CONTA', 'PAGAMENTO', 'RECEBIMENTO', 'COMISSAO', 'IMPOSTO', 'DESPESAS', 'FOLHA', 'REF'])
  return norm(s).replace(/[^A-Z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 3 && !STOP.has(w))
}
function overlap(a: string, b: string) {
  const A = new Set(tokens(a)); const B = new Set(tokens(b))
  let n = 0; for (const t of A) if (B.has(t)) n++
  return n
}
function days(a?: string | null, b?: string | null) {
  if (!a || !b) return 9999
  return Math.abs((+new Date(a + 'T00:00:00Z') - +new Date(b + 'T00:00:00Z')) / 86400000)
}

type Mov = { id: string; data: string; valor: number; descricao: string; tipo: string; conta_bancaria_id: string; conta?: { nome?: string } | null }
type Titulo = { id: string; descricao: string; valor: number; status: string; vencimento: string | null; data_recebimento?: string | null }

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.error) return g.error
  const sb = admin()
  const [{ data: cr }, { data: cp }, { data: movs }] = await Promise.all([
    sb.from('erp_contas_receber').select('id,descricao,valor,status,vencimento,data_recebimento').in('status', ['aberto', 'vencido', 'parcial']),
    sb.from('erp_contas_pagar').select('id,descricao,valor,status,vencimento').in('status', ['aberto', 'vencido', 'parcial']),
    sb.from('erp_movimentos_bancarios').select('id,data,valor,descricao,tipo,conta_bancaria_id,conta_receber_id,conta_pagar_id,conta:erp_contas_bancarias!conta_bancaria_id(nome)'),
  ])
  const entradas = (movs || []).filter((m) => m.tipo === 'entrada' && !m.conta_receber_id) as unknown as Mov[]
  const saidas = (movs || []).filter((m) => m.tipo === 'saida' && !m.conta_pagar_id) as unknown as Mov[]

  function suggest(titulos: Titulo[], pool: Mov[], tipo: 'CR' | 'CP') {
    const out = []
    for (const t of titulos) {
      const v = Math.round(Number(t.valor) * 100) / 100
      if (v <= 0) continue
      const ref = t.data_recebimento || t.vencimento
      const cands = pool
        .filter((m) => Math.abs(Math.round(Number(m.valor) * 100) / 100 - v) < 0.01)
        .map((m) => {
          const d = days(m.data, ref)
          const ov = overlap(t.descricao, m.descricao)
          let score = 50
          if (d <= 3) score += 30; else if (d <= 10) score += 20; else if (d <= 30) score += 8
          score += Math.min(20, ov * 10)
          const ev: string[] = ['valor exato']
          if (d <= 30) ev.push(`data ~${Math.round(d)}d`)
          if (ov > 0) ev.push(`texto (${ov})`)
          return { m, score, ev }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
      if (!cands.length) continue
      out.push({
        tipo,
        titulo_id: t.id,
        titulo_descricao: t.descricao,
        titulo_valor: v,
        titulo_status: t.status,
        vencimento: t.vencimento,
        sugestoes: cands.map((c) => ({
          movimento_id: c.m.id,
          data: c.m.data,
          conta: c.m.conta?.nome || '',
          descricao_extrato: c.m.descricao,
          score: c.score,
          evidencia: c.ev.join(' · '),
        })),
      })
    }
    // melhores primeiro (maior score do topo)
    return out.sort((a, b) => (b.sugestoes[0]?.score || 0) - (a.sugestoes[0]?.score || 0))
  }

  const receber = suggest((cr || []) as Titulo[], entradas, 'CR')
  const pagar = suggest((cp || []) as Titulo[], saidas, 'CP')
  return ok({ receber, pagar, resumo: { receber: receber.length, pagar: pagar.length } })
}
