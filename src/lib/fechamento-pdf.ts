// ============================================================
// Gerador de PDF de Fechamento de Leilão
// Brandbook Fórmula do Boi V1.0 — bronze envelhecido + preto absoluto
//
// Estrutura:
//   01 Capa            — preto absoluto · símbolo + wordmark · VGV destaque
//   02 Síntese         — KPIs + bloco financeiro + observações
//   03 Por Assessor    — tabela autotable
//   04 Por Estado      — tabela autotable
//   05 Compradores     — tabela autotable
//   06 Lances          — detalhamento martelo a martelo
//   07 Benchmark       — comparativo vs. média dos outros leilões (opcional)
// ============================================================

import { normalizeAssessorNome } from '@/lib/assessor-normalize'

type Assessor = {
  posicao?: number; nome?: string; empresa?: string
  transacoes?: number; animais?: number; vgv?: number
  ticket_medio?: number; pct_total?: number
}
type Estado = {
  uf?: string; estado?: string; lotes?: number; animais?: number
  vgv?: number; pct_total?: number
}
type Comprador = {
  rank?: number; fazenda?: string; comprador?: string; cidade?: string
  uf?: string; lotes?: number; animais?: number; vgv?: number
}
type Lance = {
  lote?: string; fazenda?: string; comprador?: string; uf?: string
  assessor?: string; empresa?: string; animais?: number
  parcela?: number; vgv?: number
}

export type FechamentoForPDF = {
  id: string; nome: string; data: string; local?: string
  lotes_ofertados?: number; lotes_vendidos?: number; animais_vendidos?: number
  vgv_total?: number; faturamento_total_leilao?: number | null
  ticket_medio?: number; maior_lance?: number
  compradores_unicos?: number; estados_alcancados?: number
  por_assessor?: Assessor[]; por_estado?: Estado[]
  compradores?: Comprador[]; lances?: Lance[]
  comissao_assessoria?: number | null; receita_bula?: number | null; sobra_bruta?: number | null
  observacoes?: string
}

const fmtBRL = (v: number | null | undefined) => {
  const n = Number(v) || 0
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const fmtBRLCompact = (v: number | null | undefined) => {
  const n = Number(v) || 0
  if (n >= 1_000_000) return 'R$ ' + (n / 1_000_000).toFixed(2).replace('.', ',') + 'M'
  if (n >= 1_000) return 'R$ ' + (n / 1_000).toFixed(0) + 'k'
  return fmtBRL(n)
}
const fmtPct = (v: number | null | undefined) => ((Number(v) || 0) * 100).toFixed(1).replace('.', ',') + '%'
const fmtNum = (v: number | null | undefined) => (Number(v) || 0).toLocaleString('pt-BR')
const fmtDateExt = (s: string) => {
  const meses = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ']
  const [y, m, d] = String(s || '').slice(0, 10).split('-')
  if (!y || !m || !d) return s || ''
  return `${parseInt(d, 10)} ${meses[parseInt(m, 10) - 1]} ${y}`
}

// ─── Carrega SVG → PNG dataURL via canvas ─────────────────────────────────
async function svgUrlToPng(url: string, targetWidthPx: number): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' })
    if (!res.ok) return null
    const svgText = await res.text()
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
      const blobUrl = URL.createObjectURL(blob)
      img.onload = () => {
        try {
          const ratio = (img.naturalHeight || img.height) / (img.naturalWidth || img.width || 1)
          const w = targetWidthPx
          const h = Math.round(targetWidthPx * ratio)
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) { URL.revokeObjectURL(blobUrl); return resolve(null) }
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(img, 0, 0, w, h)
          const png = canvas.toDataURL('image/png')
          URL.revokeObjectURL(blobUrl)
          resolve(png)
        } catch (e) { reject(e) }
      }
      img.onerror = (e) => { URL.revokeObjectURL(blobUrl); reject(e) }
      img.src = blobUrl
    })
  } catch {
    return null
  }
}

// ─── Carrega PNG → dataURL preservando aspect ratio ───────────────────────
async function pngUrlToDataUrl(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const img = new Image()
      const reader = new FileReader()
      reader.onload = () => {
        img.onload = () => resolve({ data: reader.result as string, w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = (e) => reject(e)
        img.src = reader.result as string
      }
      reader.onerror = (e) => reject(e)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ─── Carrega PNG e inverte cor pintando o alpha mask de branco ────────────
// Útil quando temos uma logo preta sobre transparente e precisamos exibi-la
// sobre fundo escuro (capa preta).
async function pngUrlToWhiteMaskDataUrl(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const img = new Image()
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas')
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight
            const ctx = canvas.getContext('2d')
            if (!ctx) return resolve(null)
            ctx.drawImage(img, 0, 0)
            const id = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const data = id.data
            for (let i = 0; i < data.length; i += 4) {
              // Mantém alpha; pinta RGB de branco em qualquer pixel visível
              if (data[i + 3] > 0) {
                data[i] = 255
                data[i + 1] = 255
                data[i + 2] = 255
              }
            }
            ctx.putImageData(id, 0, 0)
            resolve({ data: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height })
          } catch (e) { reject(e) }
        }
        img.onerror = (e) => reject(e)
        img.src = reader.result as string
      }
      reader.onerror = (e) => reject(e)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ─── Benchmark helpers ─────────────────────────────────────────────────────
type BenchMetric = {
  label: string
  atual: number
  media: number
  unit: 'BRL' | 'INT' | 'PCT'
  higherIsBetter: boolean
}
function buildBenchmark(fech: FechamentoForPDF, outros: FechamentoForPDF[]): BenchMetric[] {
  const validos = outros.filter(o => o.id !== fech.id)
  const n = validos.length
  if (n === 0) return []
  const avg = (key: keyof FechamentoForPDF) =>
    validos.reduce((s, o) => s + (Number(o[key] as number) || 0), 0) / n
  // Cobertura = VGV nosso / faturamento total do leilão.
  const cobOf = (o: FechamentoForPDF) => {
    const v = Number(o.vgv_total) || 0
    const f = Number(o.faturamento_total_leilao) || 0
    return f > 0 && v > 0 ? v / f : 0
  }
  const cobAtual = cobOf(fech)
  const cobMedia = validos.reduce((s, o) => s + cobOf(o), 0) / n
  return [
    { label: 'VGV total',           atual: fech.vgv_total || 0,           media: avg('vgv_total'),       unit: 'BRL', higherIsBetter: true },
    { label: 'Ticket médio',        atual: fech.ticket_medio || 0,        media: avg('ticket_medio'),    unit: 'BRL', higherIsBetter: true },
    { label: 'Lotes vendidos',      atual: fech.lotes_vendidos || 0,      media: avg('lotes_vendidos'),  unit: 'INT', higherIsBetter: true },
    { label: 'Animais',             atual: fech.animais_vendidos || 0,    media: avg('animais_vendidos'),unit: 'INT', higherIsBetter: true },
    { label: 'Compradores únicos',  atual: fech.compradores_unicos || 0,  media: avg('compradores_unicos'),unit:'INT',higherIsBetter:true },
    { label: 'Cobertura',           atual: cobAtual,                      media: cobMedia,                unit: 'PCT', higherIsBetter: true },
    { label: 'Receita Bula',        atual: fech.receita_bula || 0,        media: avg('receita_bula'),    unit: 'BRL', higherIsBetter: true },
    { label: 'Sobra bruta',         atual: fech.sobra_bruta || 0,         media: avg('sobra_bruta'),     unit: 'BRL', higherIsBetter: true },
  ]
}
const fmtBench = (v: number, u: 'BRL' | 'INT' | 'PCT') => {
  if (u === 'BRL') return fmtBRLCompact(v)
  if (u === 'PCT') return ((v || 0) * 100).toFixed(1).replace('.', ',') + '%'
  return fmtNum(v)
}

// ============================================================
export async function generateFechamentoPDF(
  fech: FechamentoForPDF,
  outros: FechamentoForPDF[] = []
): Promise<void> {
  const [{ default: jsPDF }, autoTable] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable').then(m => m.default),
  ])

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const PW = doc.internal.pageSize.getWidth()
  const PH = doc.internal.pageSize.getHeight()
  const M = 16

  // Brandbook palette
  const BRONZE: [number, number, number] = [160, 121, 46]      // #A68B4B
  const BRONZE_700: [number, number, number] = [107, 79, 30]   // #6B4F1E
  const BRONZE_300: [number, number, number] = [212, 168, 92]  // #C8A96E
  const BRONZE_100: [number, number, number] = [232, 203, 133] // #E4C99E
  const PRETO: [number, number, number] = [0, 0, 0]
  const INK: [number, number, number] = [10, 10, 10]
  const INK2: [number, number, number] = [20, 20, 20]
  const GRAY_600: [number, number, number] = [74, 74, 74]
  const GRAY_400: [number, number, number] = [120, 120, 120]
  const GRAY_300: [number, number, number] = [160, 160, 160]
  const GRAY_200: [number, number, number] = [200, 200, 200]
  const GRAY_100: [number, number, number] = [232, 232, 232]
  const TECH_GREEN: [number, number, number] = [127, 212, 160]
  const TECH_RED: [number, number, number] = [192, 80, 77]
  const BRANCO: [number, number, number] = [255, 255, 255]
  const PAPER: [number, number, number] = [251, 250, 246]
  const PAPER_LINE: [number, number, number] = [228, 220, 200]
  const ROW_ALT: [number, number, number] = [248, 244, 233]
  const TABLE_LINE: [number, number, number] = [232, 203, 133]

  // Logos (com fallback se SVG/PNG não carregar)
  const [bullWhite, bullBronze, wordmarkBronze, bulaWhite] = await Promise.all([
    svgUrlToPng('/brand/bull-white.svg', 600),
    svgUrlToPng('/brand/bull-bronze.svg', 200),
    svgUrlToPng('/brand/logo-bronze.svg', 800),
    // Logo Bula Assessoria Pecuária (peão + gado + lettering) — preta sobre transparente.
    // Convertemos pra branco preservando alpha pra usar sobre fundo preto.
    pngUrlToWhiteMaskDataUrl('/logo-bula.png'),
  ])

  // ════════════ CAPA ════════════
  doc.setFillColor(...PRETO)
  doc.rect(0, 0, PW, PH, 'F')

  // Marca top — barra fina + tag
  doc.setFillColor(...BRONZE)
  doc.rect(M, 18, 2.5, 2.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...BRONZE_300)
  doc.text('BULA ASSESSORIA', M + 5, 20)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY_400)
  doc.text('§ FECHAMENTO DE LEILÃO', PW - M, 20, { align: 'right' })

  // Marca — logo Bula Assessoria centralizado
  const brandY = 38
  const brandH = 26
  // Bula Assessoria — usa ratio real do PNG carregado (lockup horizontal) com fallback
  const bulaRatio = bulaWhite ? (bulaWhite.w / bulaWhite.h) : 2.66
  const bulaW = brandH * bulaRatio
  const bulaX = (PW - bulaW) / 2

  if (bulaWhite) {
    doc.addImage(bulaWhite.data, 'PNG', bulaX, brandY, bulaW, brandH, undefined, 'FAST')
  } else {
    // Fallback texto
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(...BRANCO)
    doc.text('BULA', PW / 2, brandY + brandH / 2, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...BRONZE_300)
    doc.text('ASSESSORIA PECUÁRIA', PW / 2, brandY + brandH / 2 + 6, { align: 'center', charSpace: 0.3 })
  }

  // Wordmark
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...BRONZE_300)
  doc.text('BULA ASSESSORIA', PW / 2, brandY + brandH + 7, { align: 'center', charSpace: 0.4 })

  // Linha bronze decorativa
  doc.setDrawColor(...BRONZE)
  doc.setLineWidth(0.4)
  doc.line(PW / 2 - 35, brandY + brandH + 10, PW / 2 + 35, brandY + brandH + 10)

  // Categoria
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...BRONZE_300)
  doc.text('— RELATÓRIO OFICIAL DE FECHAMENTO —', PW / 2, brandY + brandH + 16, { align: 'center', charSpace: 0.5 })

  // Título grande
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(...BRANCO)
  const tituloLinhas = doc.splitTextToSize(fech.nome || 'Fechamento', PW - M * 4) as string[]
  let titY = brandY + brandH + 30
  tituloLinhas.forEach(l => {
    doc.text(l, PW / 2, titY, { align: 'center' })
    titY += 10
  })

  // Sub: data + local
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(...BRONZE_300)
  doc.text(
    `${fmtDateExt(fech.data)}${fech.local ? '  ·  ' + fech.local : ''}`,
    PW / 2, titY + 4, { align: 'center' }
  )

  // Statement card — VGV destaque
  const stmtY = titY + 14
  doc.setFillColor(15, 11, 4)
  doc.setDrawColor(...BRONZE)
  doc.setLineWidth(0.5)
  doc.roundedRect(M, stmtY, PW - M * 2, 38, 2, 2, 'FD')

  // borda interna decorativa
  doc.setDrawColor(...BRONZE_700)
  doc.setLineWidth(0.15)
  doc.roundedRect(M + 2, stmtY + 2, PW - M * 2 - 4, 34, 1.5, 1.5, 'D')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...BRONZE)
  doc.text('— VGV TOTAL DA COBERTURA', M + 7, stmtY + 9, { charSpace: 0.3 })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.setTextColor(...BRONZE_100)
  doc.text(fmtBRL(fech.vgv_total), M + 7, stmtY + 24)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY_300)
  doc.text(
    `${fech.lotes_vendidos || 0} de ${fech.lotes_ofertados || 0} lotes  ·  ${fech.animais_vendidos || 0} animais  ·  ${fech.compradores_unicos || 0} compradores  ·  ${fech.estados_alcancados || 0} estados`,
    M + 7, stmtY + 32
  )

  // KPIs grid 2×2
  const kpiY = stmtY + 44
  const kpiW = (PW - M * 2 - 6) / 2
  const kpiH = 22
  const capaKpis: { label: string; value: string }[] = [
    { label: 'TICKET MÉDIO',          value: fmtBRL(fech.ticket_medio) },
    { label: 'MAIOR PARCELA',         value: fmtBRL(fech.maior_lance) },
    { label: 'RECEITA BULA',          value: fmtBRL(fech.receita_bula) },
    { label: 'SOBRA BRUTA',           value: fmtBRL(fech.sobra_bruta) },
  ]
  capaKpis.forEach((k, i) => {
    const x = M + (i % 2) * (kpiW + 6)
    const y = kpiY + Math.floor(i / 2) * (kpiH + 5)
    doc.setFillColor(15, 11, 4)
    doc.setDrawColor(...BRONZE_700)
    doc.setLineWidth(0.25)
    doc.roundedRect(x, y, kpiW, kpiH, 1.5, 1.5, 'FD')
    // accent stripe
    doc.setFillColor(...BRONZE)
    doc.rect(x, y, 0.8, kpiH, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...BRONZE_300)
    doc.text(k.label, x + 5, y + 7, { charSpace: 0.3 })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...BRANCO)
    doc.text(k.value, x + 5, y + 17)
  })

  // Footer da capa
  doc.setDrawColor(...BRONZE_700)
  doc.setLineWidth(0.2)
  doc.line(M, PH - 18, PW - M, PH - 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...GRAY_400)
  doc.text('● BULA ASSESSORIA  ·  CONFIDENCIAL · USO INTERNO', M, PH - 12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BRONZE)
  doc.text('§ CAPA  ·  01', PW - M, PH - 12, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(...GRAY_600)
  doc.text(`gerado em ${new Date().toLocaleString('pt-BR')}`, M, PH - 7)

  // ─── Helpers páginas internas ────────────────────────────────────────
  let secao = ''
  let pageNum = 1
  const desenhaFooter = () => {
    doc.setDrawColor(...PAPER_LINE)
    doc.setLineWidth(0.3)
    doc.line(M, PH - 14, PW - M, PH - 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...GRAY_600)
    const titleShort = (fech.nome || '').length > 60 ? (fech.nome || '').slice(0, 60) + '…' : (fech.nome || '')
    doc.text(`● ${titleShort.toUpperCase()}  ·  ${fmtDateExt(fech.data)}`, M, PH - 9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BRONZE)
    doc.text(`§ ${secao.toUpperCase()}`, PW / 2, PH - 9, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY_600)
    doc.text(`${String(pageNum).padStart(2, '0')} / —`, PW - M, PH - 9, { align: 'right' })
  }
  const novaPagina = (nomeSecao: string) => {
    doc.addPage()
    pageNum++
    secao = nomeSecao
    // Fundo papel
    doc.setFillColor(...PAPER)
    doc.rect(0, 0, PW, PH, 'F')
    // Header preto fino
    doc.setFillColor(...PRETO)
    doc.rect(0, 0, PW, 14, 'F')
    // Logo Bula pequeno (à esquerda)
    if (bulaWhite) {
      const bh = 7
      const bw = bh * (bulaWhite.w / bulaWhite.h)
      doc.addImage(bulaWhite.data, 'PNG', M, (14 - bh) / 2, bw, bh, undefined, 'FAST')
    } else {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...BRONZE_300)
      doc.text('BULA ASSESSORIA', M, 8.5, { charSpace: 0.2 })
    }
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY_400)
    doc.text(`§ ${nomeSecao.toUpperCase()}`, PW - M, 8.5, { align: 'right' })
    // Faixa bronze sob header
    doc.setFillColor(...BRONZE)
    doc.rect(0, 14, PW, 0.5, 'F')
    doc.setFillColor(...BRONZE_700)
    doc.rect(0, 14.5, PW, 0.2, 'F')
    desenhaFooter()
    return 24
  }
  const tituloSecao = (y: number, num: string, titulo: string, sub?: string) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...BRONZE)
    doc.text(`— ${num}`, M, y, { charSpace: 0.4 })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(...INK)
    doc.text(titulo, M, y + 10)
    if (sub) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...GRAY_600)
      doc.text(sub, M, y + 16)
    }
    return y + 24
  }

  // ════════════ 02 SÍNTESE (compacta) ════════════
  let y = novaPagina('Síntese')
  y = tituloSecao(y, '02 SÍNTESE', 'Visão consolidada', 'Indicadores macro do leilão e da nossa cobertura')

  // Card VGV — mais compacto
  doc.setFillColor(...PRETO)
  doc.roundedRect(M, y, PW - M * 2, 26, 2.5, 2.5, 'F')
  doc.setDrawColor(...BRONZE)
  doc.setLineWidth(0.4)
  doc.roundedRect(M, y, PW - M * 2, 26, 2.5, 2.5, 'D')
  doc.setFillColor(...BRONZE)
  doc.rect(M, y, 0.8, 26, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...BRONZE_300)
  doc.text('— VGV TOTAL DA COBERTURA', M + 6, y + 7, { charSpace: 0.3 })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...BRONZE_100)
  doc.text(fmtBRL(fech.vgv_total), M + 6, y + 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...GRAY_300)
  doc.text(
    `Ticket médio ${fmtBRL(fech.ticket_medio)}  ·  Maior parcela ${fmtBRL(fech.maior_lance)}`,
    PW - M - 6, y + 18, { align: 'right' }
  )
  y += 30

  // 4 KPIs em grid compacto
  const k4: { l: string; v: string; sub: string }[] = [
    { l: 'LOTES VENDIDOS', v: `${fech.lotes_vendidos || 0}`, sub: `de ${fech.lotes_ofertados || 0} ofertados` },
    { l: 'ANIMAIS',        v: `${fech.animais_vendidos || 0}`, sub: 'comercializados' },
    { l: 'COMPRADORES',    v: `${fech.compradores_unicos || 0}`, sub: 'únicos' },
    { l: 'ESTADOS',        v: `${fech.estados_alcancados || 0}`, sub: 'alcançados' },
  ]
  const kw = (PW - M * 2 - 9) / 4
  const kh = 22
  k4.forEach((k, i) => {
    const x = M + i * (kw + 3)
    doc.setFillColor(...BRANCO)
    doc.setDrawColor(...PAPER_LINE)
    doc.setLineWidth(0.3)
    doc.roundedRect(x, y, kw, kh, 1.5, 1.5, 'FD')
    doc.setFillColor(...BRONZE)
    doc.rect(x, y, kw, 0.6, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.2)
    doc.setTextColor(...BRONZE_700)
    doc.text(k.l, x + 4, y + 6, { charSpace: 0.3 })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...INK)
    doc.text(k.v, x + 4, y + 15)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...GRAY_600)
    doc.text(k.sub, x + 4, y + 19.5)
  })
  y += kh + 5

  // Bloco financeiro compacto
  const finH = 26
  doc.setFillColor(...PRETO)
  doc.roundedRect(M, y, PW - M * 2, finH, 2.5, 2.5, 'F')
  doc.setDrawColor(...BRONZE_700)
  doc.setLineWidth(0.3)
  doc.roundedRect(M, y, PW - M * 2, finH, 2.5, 2.5, 'D')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...BRONZE)
  doc.text('— RESULTADO FINANCEIRO', M + 5, y + 7, { charSpace: 0.3 })
  const fin: { label: string; value: string; color: [number, number, number]; sub?: string }[] = [
    { label: 'Receita Bula', value: fmtBRL(fech.receita_bula), color: TECH_GREEN, sub: 'a receber' },
    { label: 'Comissões', value: '− ' + fmtBRL(fech.comissao_assessoria), color: TECH_RED, sub: 'a pagar' },
    { label: 'Sobra bruta', value: fmtBRL(fech.sobra_bruta), color: BRONZE_100, sub: 'líquido' },
  ]
  const finW = (PW - M * 2 - 10) / 3
  fin.forEach((f, i) => {
    const fx = M + 5 + i * finW
    if (i > 0) {
      doc.setDrawColor(...BRONZE_700)
      doc.setLineWidth(0.2)
      doc.line(fx - 2, y + 12, fx - 2, y + finH - 4)
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...GRAY_300)
    doc.text(f.label.toUpperCase(), fx, y + 14, { charSpace: 0.3 })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...f.color)
    doc.text(f.value, fx, y + 21)
    if (f.sub) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6)
      doc.setTextColor(...GRAY_400)
      doc.text(f.sub, fx + finW - 6, y + 14, { align: 'right', charSpace: 0.2 })
    }
  })
  y += finH + 6

  // Observações
  if (fech.observacoes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...BRONZE)
    doc.text('— OBSERVAÇÕES', M, y, { charSpace: 0.3 })
    doc.setDrawColor(...BRONZE)
    doc.setLineWidth(0.2)
    doc.line(M + 30, y - 1, PW - M, y - 1)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...INK2)
    const obsLinhas = doc.splitTextToSize(fech.observacoes, PW - M * 2) as string[]
    const espacoDisp = PH - 22 - y
    const linhasMax = Math.max(0, Math.floor(espacoDisp / 3.6) - 1)
    doc.text(obsLinhas.slice(0, linhasMax), M, y, { lineHeightFactor: 1.4 })
  }

  // ─── Helper: inicia seção, continuando na mesma página se couber ───
  const FOOTER_RESERVED = 22
  function iniciarSecao(
    nomeSecao: string,
    tituloNum: string,
    titulo: string,
    sub?: string,
    espacoMinimo = 50
  ): number {
    type LastAutoTable = { lastAutoTable?: { finalY: number } }
    const last = (doc as unknown as LastAutoTable).lastAutoTable?.finalY
    const tituloH = 26
    if (last !== undefined && last + tituloH + espacoMinimo + FOOTER_RESERVED <= PH) {
      // Mesma página: divisor sutil + título
      const sepY = last + 6
      doc.setDrawColor(...PAPER_LINE)
      doc.setLineWidth(0.3)
      doc.line(M, sepY, PW - M, sepY)
      secao = nomeSecao // próximo desenhaFooter() refletirá esse nome
      return tituloSecao(sepY + 8, tituloNum, titulo, sub)
    }
    // Nova página
    const yTop = novaPagina(nomeSecao)
    return tituloSecao(yTop, tituloNum, titulo, sub)
  }

  // ════════════ 03 POR ASSESSOR ════════════
  // Consolida Pedro Barnabé / Matheus Amormino sob Marcelo Carneiro (diretiva
  // 11/05/2026). Pedro/Matheus aparecem como sub-rótulo no nome do Marcelo
  // para preservar a discriminação informativa.
  const porAssessorRaw = Array.isArray(fech.por_assessor) ? fech.por_assessor : []
  const porAssessorMap = new Map<string, {
    canon: string; empresa: string; transacoes: number; animais: number;
    vgv: number; pct_total: number; origens: string[]
  }>()
  for (const a of porAssessorRaw) {
    const canon = normalizeAssessorNome(a.nome) || (a.nome ?? '')
    if (!canon) continue
    const cur = porAssessorMap.get(canon) ?? {
      canon, empresa: a.empresa ?? '', transacoes: 0, animais: 0,
      vgv: 0, pct_total: 0, origens: [],
    }
    cur.transacoes += a.transacoes ?? 0
    cur.animais += a.animais ?? 0
    cur.vgv += a.vgv ?? 0
    cur.pct_total += a.pct_total ?? 0
    if (!cur.empresa && a.empresa) cur.empresa = a.empresa
    const original = (a.nome ?? '').trim()
    if (original && original !== canon) cur.origens.push(original)
    porAssessorMap.set(canon, cur)
  }
  const porAssessor = Array.from(porAssessorMap.values())
    .sort((a, b) => b.vgv - a.vgv)
    .map((a, i) => ({
      posicao: i + 1,
      nome: a.canon,
      empresa: a.empresa,
      transacoes: a.transacoes,
      animais: a.animais,
      vgv: a.vgv,
      ticket_medio: a.animais > 0 ? a.vgv / a.animais : 0,
      pct_total: a.pct_total,
      origens: a.origens,
    }))
  if (porAssessor.length) {
    y = novaPagina('Por Assessor')
    y = tituloSecao(y, '03 POR ASSESSOR', 'Cobertura individual', `${porAssessor.length} assessor(es) atuaram nesta cobertura`)
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 22 },
      head: [['#', 'Assessor', 'Casa', 'Lances', 'Animais', 'Ticket méd.', 'VGV', '% Cobertura']],
      body: porAssessor.map((a, i) => [
        a.posicao ?? (i + 1),
        a.origens.length
          ? `${a.nome}\ninclui ${a.origens.join(' · ')}`
          : (a.nome ?? ''),
        a.empresa ?? '',
        a.transacoes ?? 0,
        a.animais ?? 0,
        fmtBRL(a.ticket_medio),
        fmtBRL(a.vgv),
        fmtPct(a.pct_total),
      ]),
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.6, lineColor: TABLE_LINE, lineWidth: 0.1, textColor: INK2 },
      headStyles: { fillColor: PRETO, textColor: BRONZE_100, fontStyle: 'bold', fontSize: 8, cellPadding: 3 },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: {
        0: { halign: 'center', cellWidth: 9, fontStyle: 'bold', textColor: BRONZE },
        1: { fontStyle: 'bold' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right', font: 'courier', fontSize: 8.5 },
        6: { halign: 'right', font: 'courier', fontStyle: 'bold', textColor: BRONZE_700 },
        7: { halign: 'right', font: 'courier', textColor: BRONZE },
      },
      didDrawPage: () => desenhaFooter(),
    })
  }

  // ════════════ 04 POR ESTADO ════════════
  const porEstado = Array.isArray(fech.por_estado) ? fech.por_estado : []
  if (porEstado.length) {
    // ~10mm por linha + header (12mm) + título (26mm) ≈ 38mm + 10*N
    const espacoMin = 38 + 9 * porEstado.length
    y = iniciarSecao('Por Estado', '04 POR ESTADO', 'Distribuição geográfica', `${porEstado.length} UF(s) na cobertura`, espacoMin)
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 22 },
      head: [['UF', 'Estado', 'Lotes', 'Animais', 'VGV', '% Cobertura']],
      body: porEstado.map(e => [
        e.uf || '—',
        e.estado || '',
        e.lotes ?? 0,
        e.animais ?? 0,
        fmtBRL(e.vgv),
        fmtPct(e.pct_total),
      ]),
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.6, lineColor: TABLE_LINE, lineWidth: 0.1, textColor: INK2 },
      headStyles: { fillColor: PRETO, textColor: BRONZE_100, fontStyle: 'bold', fontSize: 8, cellPadding: 3 },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: {
        0: { halign: 'center', cellWidth: 14, fontStyle: 'bold', font: 'courier', textColor: BRONZE },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right', font: 'courier', fontStyle: 'bold', textColor: BRONZE_700 },
        5: { halign: 'right', font: 'courier', textColor: BRONZE },
      },
      didDrawPage: () => desenhaFooter(),
    })
  }

  // ════════════ 05 COMPRADORES ════════════
  const compradores = Array.isArray(fech.compradores) ? fech.compradores : []
  if (compradores.length) {
    const espacoMin = 38 + 9 * compradores.length
    y = iniciarSecao('Compradores', '05 COMPRADORES', 'Clientes trazidos', `${compradores.length} comprador(es) único(s) na cobertura`, espacoMin)
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 22 },
      head: [['#', 'Comprador', 'Fazenda', 'Cidade / UF', 'Lotes', 'Animais', 'VGV']],
      body: compradores.map((c, i) => [
        c.rank ?? (i + 1),
        c.comprador ?? '',
        c.fazenda ?? '',
        [c.cidade, c.uf].filter(Boolean).join('/') || '—',
        c.lotes ?? 0,
        c.animais ?? 0,
        fmtBRL(c.vgv),
      ]),
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.8, lineColor: TABLE_LINE, lineWidth: 0.1, textColor: INK2 },
      headStyles: { fillColor: PRETO, textColor: BRONZE_100, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8, fontStyle: 'bold', textColor: BRONZE },
        1: { fontStyle: 'bold' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right', font: 'courier', fontStyle: 'bold', textColor: BRONZE_700 },
      },
      didDrawPage: () => desenhaFooter(),
    })
  }

  // ════════════ 06 LANCES ════════════
  const lances = Array.isArray(fech.lances) ? fech.lances : []
  if (lances.length) {
    const espacoMin = 38 + 8 * lances.length
    y = iniciarSecao('Lances', '06 LANCES', 'Detalhamento martelo a martelo', `${lances.length} lance(s) registrado(s)`, espacoMin)
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 22 },
      head: [['Lote', 'Comprador', 'UF', 'Assessor', 'Casa', 'Anim.', 'Parcela', 'VGV']],
      body: lances.map(l => {
        const canon = normalizeAssessorNome(l.assessor) || (l.assessor ?? '')
        const original = (l.assessor ?? '').trim()
        const assessorCell = original && original !== canon
          ? `${canon}\n(${original})`
          : canon
        return [
          l.lote || '—',
          l.comprador ?? '',
          l.uf || '—',
          assessorCell,
          l.empresa ?? '',
          l.animais ?? 0,
          fmtBRL(l.parcela),
          fmtBRL(l.vgv),
        ]
      }),
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.4, lineColor: TABLE_LINE, lineWidth: 0.1, textColor: INK2 },
      headStyles: { fillColor: PRETO, textColor: BRONZE_100, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: {
        0: { halign: 'center', font: 'courier', fontStyle: 'bold', textColor: BRONZE, cellWidth: 22 },
        2: { halign: 'center', font: 'courier', cellWidth: 10 },
        5: { halign: 'right', cellWidth: 10 },
        6: { halign: 'right', font: 'courier' },
        7: { halign: 'right', font: 'courier', fontStyle: 'bold', textColor: BRONZE_700 },
      },
      didDrawPage: () => desenhaFooter(),
    })
  }

  // ════════════ 07 BENCHMARK ════════════
  const bench = buildBenchmark(fech, outros)
  if (bench.length) {
    // ~22mm sumário + 7mm header + 9mm × 8 linhas + título 26mm = ~127mm
    y = iniciarSecao('Benchmark', '07 BENCHMARK', 'Vs. média dos outros leilões',
      `Comparativo com ${outros.filter(o => o.id !== fech.id).length} outro(s) leilão/ões no recorte`, 127)
    const n = outros.filter(o => o.id !== fech.id).length

    // Card preto com sumário
    const acima = bench.filter(b => {
      if (b.media === 0) return false
      return b.higherIsBetter ? b.atual >= b.media : b.atual <= b.media
    }).length
    const abaixo = bench.length - acima
    doc.setFillColor(...PRETO)
    doc.roundedRect(M, y, PW - M * 2, 22, 2.5, 2.5, 'F')
    doc.setDrawColor(...BRONZE_700)
    doc.setLineWidth(0.3)
    doc.roundedRect(M, y, PW - M * 2, 22, 2.5, 2.5, 'D')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...BRONZE_300)
    doc.text('— DESEMPENHO RELATIVO', M + 6, y + 8, { charSpace: 0.3 })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...BRANCO)
    doc.text(`${acima} / ${bench.length} métricas acima da média`, M + 6, y + 17)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY_300)
    const baseline = `Baseline: média de ${n} leilão(ões) — `
    doc.text(baseline, PW - M - 6, y + 17, { align: 'right' })
    y += 28

    // Tabela com barras visuais
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...BRONZE)
    doc.text('— COMPARATIVO POR MÉTRICA', M, y, { charSpace: 0.3 })
    doc.setDrawColor(...BRONZE)
    doc.setLineWidth(0.2)
    doc.line(M + 60, y - 1, PW - M, y - 1)
    y += 5

    // header
    const colW = {
      label: 50,
      atual: 32,
      media: 32,
      delta: 18,
      bar: PW - M * 2 - 50 - 32 - 32 - 18 - 4,
    }
    let cx = M
    doc.setFillColor(...PRETO)
    doc.rect(cx, y, PW - M * 2, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...BRONZE_100)
    doc.text('MÉTRICA', cx + 3, y + 4.7, { charSpace: 0.3 })
    cx += colW.label
    doc.text('ATUAL', cx + colW.atual - 3, y + 4.7, { align: 'right', charSpace: 0.3 })
    cx += colW.atual
    doc.text(`MÉDIA (n=${n})`, cx + colW.media - 3, y + 4.7, { align: 'right', charSpace: 0.3 })
    cx += colW.media
    doc.text('Δ%', cx + colW.delta - 3, y + 4.7, { align: 'right', charSpace: 0.3 })
    cx += colW.delta + 4
    doc.text('VISUAL', cx, y + 4.7, { charSpace: 0.3 })
    y += 7

    bench.forEach((b, i) => {
      const rowY = y + i * 9
      // alt row
      if (i % 2 === 1) {
        doc.setFillColor(...ROW_ALT)
        doc.rect(M, rowY, PW - M * 2, 9, 'F')
      }
      // label
      cx = M
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(...INK2)
      doc.text(b.label, cx + 3, rowY + 5.6)
      cx += colW.label
      // atual
      doc.setFont('courier', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(...BRONZE_700)
      doc.text(fmtBench(b.atual, b.unit), cx + colW.atual - 3, rowY + 5.6, { align: 'right' })
      cx += colW.atual
      // media
      doc.setFont('courier', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(...GRAY_600)
      doc.text(fmtBench(b.media, b.unit), cx + colW.media - 3, rowY + 5.6, { align: 'right' })
      cx += colW.media
      // delta %
      const delta = b.media === 0 ? 0 : (b.atual - b.media) / b.media
      const positive = b.higherIsBetter ? delta >= 0 : delta <= 0
      const deltaTxt = (delta >= 0 ? '+' : '') + (delta * 100).toFixed(1).replace('.', ',') + '%'
      doc.setFont('courier', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(...(positive ? TECH_GREEN : TECH_RED))
      doc.text(deltaTxt, cx + colW.delta - 3, rowY + 5.6, { align: 'right' })
      cx += colW.delta + 4
      // visual bar (centered at 0%, scale ±100%)
      const barX = cx
      const barY = rowY + 3.5
      const barH = 2
      const barW = colW.bar
      // background
      doc.setFillColor(245, 240, 225)
      doc.rect(barX, barY, barW, barH, 'F')
      // center line
      doc.setDrawColor(...BRONZE_700)
      doc.setLineWidth(0.15)
      doc.line(barX + barW / 2, barY - 1, barX + barW / 2, barY + barH + 1)
      // fill (proporcional ao delta, clamp ±100%)
      const clamped = Math.max(-1, Math.min(1, delta))
      const fillW = (Math.abs(clamped) * barW) / 2
      const fillX = clamped >= 0 ? barX + barW / 2 : barX + barW / 2 - fillW
      doc.setFillColor(...(positive ? TECH_GREEN : TECH_RED))
      doc.rect(fillX, barY, fillW, barH, 'F')
    })
  }

  // ════════════ Atualiza paginação total ════════════
  const totalPaginas = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages()
  for (let p = 2; p <= totalPaginas; p++) {
    doc.setPage(p)
    doc.setFillColor(...PAPER)
    doc.rect(PW - M - 22, PH - 12, 22, 6, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...GRAY_600)
    doc.text(`${String(p).padStart(2, '0')} / ${String(totalPaginas).padStart(2, '0')}`, PW - M, PH - 9, { align: 'right' })
  }

  // Save
  const safeName = (fech.nome || 'fechamento')
    .replace(/[^\wÀ-ÿ\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
  const safeDate = String(fech.data || '').slice(0, 10).replace(/-/g, '')
  doc.save(`Fechamento_${safeName}_${safeDate}.pdf`)

  // Reduz lint warning sobre logos não usados (bull/wordmark Fórmula do Boi removidos
  // do cabeçalho — relatório passou a usar somente a marca Bula Assessoria)
  void bullWhite
  void bullBronze
  void wordmarkBronze
  void GRAY_100
}

// ============================================================
// PDF CONSOLIDADO de fechamentos (multi-leilão, filtrado)
//
// Um único documento com o recorte que o usuário filtrou na tela de
// relatórios (ex.: todos os "EAO", um período, um assessor específico).
// Modo geral: síntese + tabela de leilões (+ financeiro se o payload trouxe,
// i.e. finance-admin) + ranking por assessor + por estado.
// Modo assessor (opts.assessor): vira "Vendas por Assessor" — só os leilões
// em que ele vendeu, VGV/participação dele e as vendas lote a lote. Sem
// valores de comissão (comissão fica restrita ao ERP).
// ============================================================

export type ConsolidadoOpts = {
  titulo?: string
  periodo?: string          // ex.: '01/04/2026 a 21/07/2026'
  filtros?: string[]        // descrições dos filtros aplicados (aparecem na capa)
  assessor?: string | null  // nome canônico → relatório de vendas do assessor
}

export async function generateConsolidadoPDF(
  fechsIn: FechamentoForPDF[],
  opts: ConsolidadoOpts = {}
): Promise<void> {
  const assessor = (opts.assessor || '').trim() || null

  // Agrega as linhas do assessor dentro de um fechamento (grafias já
  // canonicalizadas podem gerar 2+ entradas no mesmo leilão).
  const assessorNoLeilao = (f: FechamentoForPDF) => {
    if (!assessor) return null
    let transacoes = 0, animais = 0, vgv = 0, achou = false
    for (const a of f.por_assessor ?? []) {
      if (normalizeAssessorNome(a.nome) !== assessor) continue
      achou = true
      transacoes += Number(a.transacoes) || 0
      animais += Number(a.animais) || 0
      vgv += Number(a.vgv) || 0
    }
    return achou ? { transacoes, animais, vgv } : null
  }

  let fechs = [...fechsIn].sort((a, b) => String(a.data).localeCompare(String(b.data)))
  if (assessor) fechs = fechs.filter(f => assessorNoLeilao(f))
  if (!fechs.length) { alert('Nenhum fechamento no recorte selecionado.'); return }

  // Totais do recorte
  const num = (v: unknown) => Number(v) || 0
  const tot = {
    leiloes: fechs.length,
    lotesV: fechs.reduce((s, f) => s + num(f.lotes_vendidos), 0),
    lotesO: fechs.reduce((s, f) => s + num(f.lotes_ofertados), 0),
    animais: fechs.reduce((s, f) => s + num(f.animais_vendidos), 0),
    vgv: fechs.reduce((s, f) => s + num(f.vgv_total), 0),
    compradores: fechs.reduce((s, f) => s + num(f.compradores_unicos), 0),
    fat: fechs.reduce((s, f) => s + num(f.faturamento_total_leilao), 0),
    receita: fechs.reduce((s, f) => s + num(f.receita_bula), 0),
    comissao: fechs.reduce((s, f) => s + num(f.comissao_assessoria), 0),
    sobra: fechs.reduce((s, f) => s + num(f.sobra_bruta), 0),
  }
  const assAgg = assessor
    ? fechs.reduce((acc, f) => {
        const a = assessorNoLeilao(f)!
        acc.transacoes += a.transacoes; acc.animais += a.animais; acc.vgv += a.vgv
        return acc
      }, { transacoes: 0, animais: 0, vgv: 0 })
    : null
  const temFin = !assessor && fechs.some(f => f.receita_bula != null && num(f.receita_bula) > 0)
  const vgvDestaque = assAgg ? assAgg.vgv : tot.vgv

  const [{ default: jsPDF }, autoTable] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable').then(m => m.default),
  ])
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const PW = doc.internal.pageSize.getWidth()
  const PH = doc.internal.pageSize.getHeight()
  const M = 16

  const BRONZE: [number, number, number] = [160, 121, 46]
  const BRONZE_700: [number, number, number] = [107, 79, 30]
  const BRONZE_300: [number, number, number] = [212, 168, 92]
  const BRONZE_100: [number, number, number] = [232, 203, 133]
  const PRETO: [number, number, number] = [0, 0, 0]
  const INK: [number, number, number] = [10, 10, 10]
  const INK2: [number, number, number] = [20, 20, 20]
  const GRAY_600: [number, number, number] = [74, 74, 74]
  const GRAY_400: [number, number, number] = [120, 120, 120]
  const GRAY_300: [number, number, number] = [160, 160, 160]
  const TECH_GREEN: [number, number, number] = [127, 212, 160]
  const TECH_RED: [number, number, number] = [192, 80, 77]
  const BRANCO: [number, number, number] = [255, 255, 255]
  const PAPER: [number, number, number] = [251, 250, 246]
  const PAPER_LINE: [number, number, number] = [228, 220, 200]
  const ROW_ALT: [number, number, number] = [248, 244, 233]
  const TABLE_LINE: [number, number, number] = [232, 203, 133]

  const bulaWhite = await pngUrlToWhiteMaskDataUrl('/logo-bula.png')

  // ════════════ CAPA ════════════
  doc.setFillColor(...PRETO)
  doc.rect(0, 0, PW, PH, 'F')
  doc.setFillColor(...BRONZE)
  doc.rect(0, 0, PW, 1.2, 'F')
  if (bulaWhite) {
    const bh = 16
    const bw = bh * (bulaWhite.w / bulaWhite.h)
    doc.addImage(bulaWhite.data, 'PNG', M, 26, bw, bh, undefined, 'FAST')
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...BRONZE_300)
    doc.text('BULA ASSESSORIA', M, 36, { charSpace: 0.6 })
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY_400)
  doc.text('RELATÓRIO GERADO EM ' + new Date().toLocaleDateString('pt-BR'), PW - M, 32, { align: 'right' })

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...BRONZE)
  doc.text(assessor ? '— VENDAS POR ASSESSOR' : '— RELATÓRIO CONSOLIDADO DE FECHAMENTOS', M, 78, { charSpace: 0.6 })
  doc.setFontSize(30); doc.setTextColor(...BRANCO)
  const tituloCapa = assessor || opts.titulo || 'Fechamentos de Leilões'
  const tituloLines = doc.splitTextToSize(tituloCapa, PW - M * 2)
  doc.text(tituloLines, M, 92)
  let capaY = 92 + tituloLines.length * 12

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...BRONZE_300)
  if (opts.periodo) { doc.text('Período: ' + opts.periodo, M, capaY + 4); capaY += 8 }
  for (const filtro of opts.filtros || []) {
    doc.setTextColor(...GRAY_300)
    doc.text('· ' + filtro, M, capaY + 4); capaY += 7
  }

  // Destaque VGV
  const cardY = Math.max(capaY + 12, 150)
  doc.setDrawColor(...BRONZE); doc.setLineWidth(0.5)
  doc.roundedRect(M, cardY, PW - M * 2, 42, 3, 3, 'D')
  doc.setFillColor(...BRONZE); doc.rect(M, cardY, 1.2, 42, 'F')
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...BRONZE_300)
  doc.text(assessor ? '— VGV VENDIDO PELO ASSESSOR' : '— VGV TOTAL DA COBERTURA', M + 8, cardY + 10, { charSpace: 0.4 })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.setTextColor(...BRONZE_100)
  doc.text(fmtBRL(vgvDestaque), M + 8, cardY + 24)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY_300)
  const capaSub = assessor
    ? tot.leiloes + ' leilões · ' + assAgg!.transacoes + ' vendas · ' + assAgg!.animais + ' animais'
    : tot.leiloes + ' leilões · ' + tot.lotesV + ' lotes vendidos · ' + fmtNum(tot.animais) + ' animais'
  doc.text(capaSub, M + 8, cardY + 34)

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY_400)
  doc.text('Documento interno — Bula Assessoria Pecuária', M, PH - 16)

  // ════════════ Infra de páginas papel ════════════
  let pageNum = 1
  let secao = ''
  const desenhaFooter = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY_600)
    doc.text(('BULA ASSESSORIA · ' + (assessor || opts.titulo || 'CONSOLIDADO').toUpperCase()).slice(0, 70), M, PH - 9)
    doc.text(String(pageNum).padStart(2, '0') + ' / —', PW - M, PH - 9, { align: 'right' })
    void secao
  }
  const novaPagina = (nomeSecao: string) => {
    doc.addPage(); pageNum++; secao = nomeSecao
    doc.setFillColor(...PAPER); doc.rect(0, 0, PW, PH, 'F')
    doc.setFillColor(...PRETO); doc.rect(0, 0, PW, 14, 'F')
    if (bulaWhite) {
      const bh = 7
      const bw = bh * (bulaWhite.w / bulaWhite.h)
      doc.addImage(bulaWhite.data, 'PNG', M, (14 - bh) / 2, bw, bh, undefined, 'FAST')
    } else {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BRONZE_300)
      doc.text('BULA ASSESSORIA', M, 8.5, { charSpace: 0.2 })
    }
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY_400); doc.setFontSize(7)
    doc.text('§ ' + nomeSecao.toUpperCase(), PW - M, 8.5, { align: 'right' })
    doc.setFillColor(...BRONZE); doc.rect(0, 14, PW, 0.5, 'F')
    doc.setFillColor(...BRONZE_700); doc.rect(0, 14.5, PW, 0.2, 'F')
    desenhaFooter()
    return 24
  }
  const tituloSecao = (y: number, numTxt: string, titulo: string, sub?: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BRONZE)
    doc.text('— ' + numTxt, M, y, { charSpace: 0.4 })
    doc.setFontSize(22); doc.setTextColor(...INK)
    doc.text(titulo, M, y + 10)
    if (sub) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY_600)
      doc.text(sub, M, y + 16)
    }
    return y + 24
  }
  const tableTheme = {
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.6, lineColor: TABLE_LINE, lineWidth: 0.1, textColor: INK2 },
    headStyles: { fillColor: PRETO, textColor: BRONZE_100, fontStyle: 'bold' as const, fontSize: 8, cellPadding: 3 },
    alternateRowStyles: { fillColor: ROW_ALT },
    footStyles: { fillColor: BRANCO, textColor: INK, fontStyle: 'bold' as const, fontSize: 8.5, lineColor: TABLE_LINE, lineWidth: 0.1 },
    margin: { left: M, right: M, bottom: 22 },
    didDrawPage: () => desenhaFooter(),
  }

  // ════════════ 01 SÍNTESE ════════════
  let y = novaPagina('Síntese')
  y = tituloSecao(y, '01 SÍNTESE', 'Visão consolidada', opts.periodo ? 'Recorte: ' + opts.periodo : undefined)

  const k4 = assessor
    ? [
        { l: 'LEILÕES', v: String(tot.leiloes), sub: 'com vendas do assessor' },
        { l: 'VENDAS', v: String(assAgg!.transacoes), sub: 'transações' },
        { l: 'ANIMAIS', v: fmtNum(assAgg!.animais), sub: 'comercializados' },
        { l: 'TICKET MÉDIO', v: fmtBRLCompact(assAgg!.animais ? assAgg!.vgv / assAgg!.animais : 0), sub: 'por animal' },
      ]
    : [
        { l: 'LEILÕES', v: String(tot.leiloes), sub: 'no recorte' },
        { l: 'LOTES', v: String(tot.lotesV), sub: tot.lotesO ? 'de ' + tot.lotesO + ' ofertados' : 'vendidos' },
        { l: 'ANIMAIS', v: fmtNum(tot.animais), sub: 'comercializados' },
        { l: 'COMPRADORES', v: fmtNum(tot.compradores), sub: 'soma por leilão' },
      ]
  const kw = (PW - M * 2 - 9) / 4
  k4.forEach((k, i) => {
    const x = M + i * (kw + 3)
    doc.setFillColor(...BRANCO); doc.setDrawColor(...PAPER_LINE); doc.setLineWidth(0.3)
    doc.roundedRect(x, y, kw, 22, 1.5, 1.5, 'FD')
    doc.setFillColor(...BRONZE); doc.rect(x, y, kw, 0.6, 'F')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2); doc.setTextColor(...BRONZE_700)
    doc.text(k.l, x + 4, y + 6, { charSpace: 0.3 })
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...INK)
    doc.text(k.v, x + 4, y + 15)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY_600)
    doc.text(k.sub, x + 4, y + 19.5)
  })
  y += 27

  // Card VGV
  doc.setFillColor(...PRETO)
  doc.roundedRect(M, y, PW - M * 2, 26, 2.5, 2.5, 'F')
  doc.setDrawColor(...BRONZE); doc.setLineWidth(0.4)
  doc.roundedRect(M, y, PW - M * 2, 26, 2.5, 2.5, 'D')
  doc.setFillColor(...BRONZE); doc.rect(M, y, 0.8, 26, 'F')
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...BRONZE_300)
  doc.text(assessor ? '— VGV VENDIDO PELO ASSESSOR' : '— VGV TOTAL DO RECORTE', M + 6, y + 7, { charSpace: 0.3 })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor(...BRONZE_100)
  doc.text(fmtBRL(vgvDestaque), M + 6, y + 18)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY_300)
  const mediaLeilao = tot.leiloes ? vgvDestaque / tot.leiloes : 0
  doc.text(
    'Média por leilão ' + fmtBRLCompact(mediaLeilao) + (!assessor && tot.fat ? '  ·  Cobertura ' + fmtPct(tot.vgv / tot.fat) : ''),
    PW - M - 6, y + 18, { align: 'right' }
  )
  y += 31

  // Financeiro (só geral + finance-admin)
  if (temFin) {
    doc.setFillColor(...PRETO)
    doc.roundedRect(M, y, PW - M * 2, 26, 2.5, 2.5, 'F')
    doc.setDrawColor(...BRONZE_700); doc.setLineWidth(0.3)
    doc.roundedRect(M, y, PW - M * 2, 26, 2.5, 2.5, 'D')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...BRONZE)
    doc.text('— RESULTADO FINANCEIRO DO RECORTE', M + 5, y + 7, { charSpace: 0.3 })
    const fin: { label: string; value: string; color: [number, number, number] }[] = [
      { label: 'Receita Bula', value: fmtBRL(tot.receita), color: TECH_GREEN },
      { label: 'Comissões assessoria', value: '- ' + fmtBRL(tot.comissao), color: TECH_RED },
      { label: 'Sobra bruta', value: fmtBRL(tot.sobra), color: BRONZE_100 },
    ]
    const finW = (PW - M * 2 - 10) / 3
    fin.forEach((f, i) => {
      const fx = M + 5 + i * finW
      if (i > 0) { doc.setDrawColor(...BRONZE_700); doc.setLineWidth(0.2); doc.line(fx - 2, y + 12, fx - 2, y + 22) }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY_300)
      doc.text(f.label.toUpperCase(), fx, y + 13, { charSpace: 0.2 })
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...f.color)
      doc.text(f.value, fx, y + 20)
    })
    y += 31
  }

  // ════════════ 02 LEILÕES DO RECORTE ════════════
  y = novaPagina('Leilões')
  y = tituloSecao(
    y, '02 LEILÕES',
    assessor ? 'Leilões com vendas de ' + assessor : 'Leilões do recorte',
    tot.leiloes + ' fechamento(s), em ordem cronológica'
  )

  if (assessor) {
    autoTable(doc, {
      startY: y,
      head: [['Data', 'Leilão', 'Vendas', 'Animais', 'VGV do assessor', '% do leilão']],
      body: fechs.map(f => {
        const a = assessorNoLeilao(f)!
        const pct = num(f.vgv_total) > 0 ? a.vgv / num(f.vgv_total) : 0
        return [fmtDateExt(f.data), f.nome, a.transacoes, a.animais, fmtBRL(a.vgv), fmtPct(pct)]
      }),
      foot: [['Total', '', String(assAgg!.transacoes), String(assAgg!.animais), fmtBRL(assAgg!.vgv), '']],
      columnStyles: {
        0: { cellWidth: 24 },
        2: { halign: 'right' }, 3: { halign: 'right' },
        4: { halign: 'right', font: 'courier', fontStyle: 'bold', textColor: BRONZE_700 },
        5: { halign: 'right', font: 'courier', textColor: BRONZE },
      },
      ...tableTheme,
    })
  } else {
    const head = ['Data', 'Leilão', 'Lotes', 'Animais', 'VGV', 'Ticket']
    if (temFin) head.push('Receita Bula', 'Sobra')
    autoTable(doc, {
      startY: y,
      head: [head],
      body: fechs.map(f => {
        const row: (string | number)[] = [
          fmtDateExt(f.data), f.nome, num(f.lotes_vendidos), num(f.animais_vendidos),
          fmtBRLCompact(f.vgv_total), fmtBRLCompact(f.ticket_medio),
        ]
        if (temFin) row.push(fmtBRLCompact(f.receita_bula), fmtBRLCompact(f.sobra_bruta))
        return row
      }),
      foot: [(() => {
        const row: string[] = ['Total', '', String(tot.lotesV), fmtNum(tot.animais), fmtBRLCompact(tot.vgv), '']
        if (temFin) row.push(fmtBRLCompact(tot.receita), fmtBRLCompact(tot.sobra))
        return row
      })()],
      columnStyles: {
        0: { cellWidth: 24 },
        2: { halign: 'right' }, 3: { halign: 'right' },
        4: { halign: 'right', font: 'courier', fontStyle: 'bold', textColor: BRONZE_700 },
        5: { halign: 'right', font: 'courier' },
        6: { halign: 'right', font: 'courier', textColor: [46, 106, 74] as [number, number, number] },
        7: { halign: 'right', font: 'courier' },
      },
      ...tableTheme,
    })
  }

  // ════════════ 03 POR ASSESSOR (modo geral) ════════════
  if (!assessor) {
    const map = new Map<string, { nome: string; empresas: Set<string>; leiloes: Set<string>; transacoes: number; animais: number; vgv: number }>()
    for (const f of fechs) {
      for (const a of f.por_assessor ?? []) {
        const canon = normalizeAssessorNome(a.nome)
        if (!canon) continue
        const cur = map.get(canon) ?? { nome: canon, empresas: new Set(), leiloes: new Set(), transacoes: 0, animais: 0, vgv: 0 }
        if (a.empresa) cur.empresas.add(a.empresa)
        cur.leiloes.add(f.id)
        cur.transacoes += num(a.transacoes); cur.animais += num(a.animais); cur.vgv += num(a.vgv)
        map.set(canon, cur)
      }
    }
    const ranking = [...map.values()].sort((a, b) => b.vgv - a.vgv)
    if (ranking.length) {
      const totalVgvAss = ranking.reduce((s, a) => s + a.vgv, 0) || 1
      y = novaPagina('Por Assessor')
      y = tituloSecao(y, '03 POR ASSESSOR', 'Ranking de vendas', ranking.length + ' assessores no recorte (nomes unificados)')
      autoTable(doc, {
        startY: y,
        head: [['#', 'Assessor', 'Casa', 'Leilões', 'Vendas', 'Animais', 'VGV', '% do total']],
        body: ranking.map((a, i) => [
          i + 1, a.nome, [...a.empresas].join(' · '), a.leiloes.size, a.transacoes, a.animais, fmtBRL(a.vgv), fmtPct(a.vgv / totalVgvAss),
        ]),
        columnStyles: {
          0: { halign: 'center', cellWidth: 9, fontStyle: 'bold', textColor: BRONZE },
          1: { fontStyle: 'bold' },
          3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
          6: { halign: 'right', font: 'courier', fontStyle: 'bold', textColor: BRONZE_700 },
          7: { halign: 'right', font: 'courier', textColor: BRONZE },
        },
        ...tableTheme,
      })
    }

    // ════════════ 04 POR ESTADO ════════════
    const ufMap = new Map<string, { uf: string; estado: string; lotes: number; animais: number; vgv: number }>()
    for (const f of fechs) {
      for (const e of f.por_estado ?? []) {
        const uf = (e.uf || '').toUpperCase().trim()
        if (!uf) continue
        const cur = ufMap.get(uf) ?? { uf, estado: e.estado || uf, lotes: 0, animais: 0, vgv: 0 }
        cur.lotes += num(e.lotes); cur.animais += num(e.animais); cur.vgv += num(e.vgv)
        ufMap.set(uf, cur)
      }
    }
    const ufs = [...ufMap.values()].sort((a, b) => b.vgv - a.vgv)
    if (ufs.length) {
      const totalVgvUf = ufs.reduce((s, u) => s + u.vgv, 0) || 1
      y = novaPagina('Por Estado')
      y = tituloSecao(y, '04 POR ESTADO', 'Distribuição geográfica', ufs.length + ' UF(s) no recorte')
      autoTable(doc, {
        startY: y,
        head: [['UF', 'Estado', 'Lotes', 'Animais', 'VGV', '% do total']],
        body: ufs.map(u => [u.uf, u.estado, u.lotes, u.animais, fmtBRL(u.vgv), fmtPct(u.vgv / totalVgvUf)]),
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 14, textColor: BRONZE },
          2: { halign: 'right' }, 3: { halign: 'right' },
          4: { halign: 'right', font: 'courier', fontStyle: 'bold', textColor: BRONZE_700 },
          5: { halign: 'right', font: 'courier', textColor: BRONZE },
        },
        ...tableTheme,
      })
    }
  }

  // ════════════ 03 VENDAS DETALHADAS (modo assessor) ════════════
  if (assessor) {
    const vendas: { data: string; leilao: string; lote: string; comprador: string; uf: string; animais: number; vgv: number }[] = []
    for (const f of fechs) {
      for (const l of f.lances ?? []) {
        if (normalizeAssessorNome(l.assessor) !== assessor) continue
        vendas.push({
          data: f.data, leilao: f.nome, lote: String(l.lote ?? ''),
          comprador: [l.comprador, l.fazenda].filter(Boolean).join(' · '),
          uf: l.uf || '', animais: num(l.animais), vgv: num(l.vgv),
        })
      }
    }
    if (vendas.length) {
      y = novaPagina('Vendas detalhadas')
      y = tituloSecao(y, '03 VENDAS', 'Martelo a martelo', vendas.length + ' vendas atribuídas ao assessor no recorte')
      autoTable(doc, {
        startY: y,
        head: [['Data', 'Leilão', 'Lote', 'Comprador', 'UF', 'Animais', 'VGV']],
        body: vendas.map(v => [fmtDateExt(v.data), v.leilao, v.lote || '—', v.comprador || '—', v.uf || '—', v.animais || '', fmtBRL(v.vgv)]),
        foot: [['Total', '', '', '', '', String(vendas.reduce((s, v) => s + v.animais, 0)), fmtBRL(vendas.reduce((s, v) => s + v.vgv, 0))]],
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 44 },
          5: { halign: 'right' },
          6: { halign: 'right', font: 'courier', fontStyle: 'bold', textColor: BRONZE_700 },
        },
        ...tableTheme,
      })
      const lastY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
      if (lastY && lastY < PH - 30) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY_600)
        doc.text('Vendas individuais vêm do registro martelo a martelo e podem diferir do resumo consolidado do fechamento.', M, lastY + 6)
      }
    }
  }

  // ════════════ Paginação final ════════════
  const totalPaginas = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages()
  for (let p = 2; p <= totalPaginas; p++) {
    doc.setPage(p)
    doc.setFillColor(...PAPER)
    doc.rect(PW - M - 22, PH - 12, 22, 6, 'F')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY_600)
    doc.text(String(p).padStart(2, '0') + ' / ' + String(totalPaginas).padStart(2, '0'), PW - M, PH - 9, { align: 'right' })
  }

  const safe = (s: string) => s.replace(/[^\wÀ-ÿ\s-]/g, '').trim().replace(/\s+/g, '_')
  const nomeArq = assessor
    ? 'Vendas_' + safe(assessor) + '_' + new Date().toISOString().slice(0, 10) + '.pdf'
    : 'Fechamentos_Consolidado_' + safe(opts.titulo || 'recorte') + '_' + new Date().toISOString().slice(0, 10) + '.pdf'
  doc.save(nomeArq)
}
