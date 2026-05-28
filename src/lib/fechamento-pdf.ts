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
  vgv_total?: number; ticket_medio?: number; maior_lance?: number
  compradores_unicos?: number; estados_alcancados?: number
  por_assessor?: Assessor[]; por_estado?: Estado[]
  compradores?: Comprador[]; lances?: Lance[]
  comissao_assessoria?: number; receita_bula?: number; sobra_bruta?: number
  observacoes?: string
}

const fmtBRL = (v: number | undefined) => {
  const n = Number(v) || 0
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const fmtBRLCompact = (v: number | undefined) => {
  const n = Number(v) || 0
  if (n >= 1_000_000) return 'R$ ' + (n / 1_000_000).toFixed(2).replace('.', ',') + 'M'
  if (n >= 1_000) return 'R$ ' + (n / 1_000).toFixed(0) + 'k'
  return fmtBRL(n)
}
const fmtPct = (v: number | undefined) => ((Number(v) || 0) * 100).toFixed(1).replace('.', ',') + '%'
const fmtNum = (v: number | undefined) => (Number(v) || 0).toLocaleString('pt-BR')
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
  const cobAtual = (fech.lotes_ofertados || 0) > 0 ? (fech.lotes_vendidos || 0) / (fech.lotes_ofertados || 1) : 0
  const cobMedia = validos.reduce((s, o) => {
    const c = (o.lotes_ofertados || 0) > 0 ? (o.lotes_vendidos || 0) / (o.lotes_ofertados || 1) : 0
    return s + c
  }, 0) / n
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
  doc.text('FÓRMULA DO BOI · BULA ASSESSORIA', M + 5, 20)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY_400)
  doc.text('§ FECHAMENTO DE LEILÃO', PW - M, 20, { align: 'right' })

  // Co-branding — Fórmula bull + divisor + Bula Assessoria (lado a lado)
  const brandY = 38
  const brandH = 24
  const bullW = brandH * (360 / 200) // bull: ratio 1.8:1
  // Bula Assessoria — usa ratio real do PNG carregado (lockup horizontal) com fallback
  const bulaRatio = bulaWhite ? (bulaWhite.w / bulaWhite.h) : 2.66
  const bulaW = brandH * bulaRatio
  const dividerW = 14
  const totalW = bullW + dividerW + bulaW
  const groupX = (PW - totalW) / 2

  if (bullWhite) {
    doc.addImage(bullWhite, 'PNG', groupX, brandY, bullW, brandH, undefined, 'FAST')
  }

  // Divisor central — linha vertical fina + "×" bronze
  const divX = groupX + bullW + dividerW / 2
  doc.setDrawColor(...BRONZE_700)
  doc.setLineWidth(0.3)
  doc.line(divX, brandY + 4, divX, brandY + brandH - 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...BRONZE)
  doc.text('×', divX, brandY + brandH / 2 + 1, { align: 'center' })

  if (bulaWhite) {
    doc.addImage(bulaWhite.data, 'PNG', groupX + bullW + dividerW, brandY, bulaW, brandH, undefined, 'FAST')
  } else {
    // Fallback texto
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...BRANCO)
    doc.text('BULA', groupX + bullW + dividerW + bulaW / 2, brandY + brandH / 2 + 2, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...BRONZE_300)
    doc.text('ASSESSORIA PECUÁRIA', groupX + bullW + dividerW + bulaW / 2, brandY + brandH / 2 + 7, { align: 'center', charSpace: 0.3 })
  }

  // Wordmark "FÓRMULA DO BOI · BULA ASSESSORIA"
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...BRONZE_300)
  doc.text('FÓRMULA DO BOI  ×  BULA ASSESSORIA', PW / 2, brandY + brandH + 7, { align: 'center', charSpace: 0.4 })

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
  doc.text('● FÓRMULA DO BOI BRAND GUIDELINES V1.0  ·  CONFIDENCIAL · USO INTERNO', M, PH - 12)
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
    // Bull bronze pequeno (à esquerda)
    if (bullBronze) {
      const bw = 7
      const bh = bw * (200 / 360)
      doc.addImage(bullBronze, 'PNG', M, (14 - bh) / 2, bw, bh, undefined, 'FAST')
    } else {
      doc.setFillColor(...BRONZE)
      doc.rect(M, 5.5, 3.5, 3.5, 'F')
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...BRONZE_300)
    doc.text('FÓRMULA DO BOI · BULA ASSESSORIA', M + 10, 8.5, { charSpace: 0.2 })
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

  // Reduz lint warning sobre wordmarkBronze não usado (reservado pra v2 com lockup)
  void wordmarkBronze
  void GRAY_100
}
