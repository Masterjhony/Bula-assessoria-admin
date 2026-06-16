'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity, Briefcase, Calendar, ChevronDown, ChevronRight, DollarSign, Download,
  Edit2, FileBarChart, FileText, Loader2, Sparkles, TrendingUp, Trophy, Users,
} from 'lucide-react'
import { normalizeAssessorNome } from '@/lib/assessor-normalize'

// ── Types ───────────────────────────────────────────────────────────────────

type Assessor = {
  posicao: number; nome: string; empresa: string
  transacoes: number; animais: number; vgv: number
  ticket_medio: number; pct_total: number
}

type Fechamento = {
  id: string; nome: string; data: string; local: string
  lotes_ofertados: number; lotes_vendidos: number; animais_vendidos: number
  vgv_total: number; ticket_medio: number
  por_assessor: Assessor[]
  comissao_assessoria?: number; receita_bula?: number; sobra_bruta?: number
}

type Payload = {
  fechamentos: Fechamento[]
  range: { from: string | null; to: string | null }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0)

const fmtBRLCompact = (v: number) => {
  const abs = Math.abs(v); const sign = v < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(2).replace('.', ',')}M`
  if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toFixed(0)}k`
  return fmtBRL(v)
}
const fmtNum = (v: number) => (v || 0).toLocaleString('pt-BR')
const PCT = (v: number) => `${(v * 100).toFixed(1)}%`

const EMPRESA_BULA_FORMULA = 'Bula'
function normalizeEmpresaGrupo(empresa: string | null | undefined): string {
  const e = (empresa ?? '').trim()
  if (!e) return 'Não informado'
  const lower = e.toLowerCase()
  if (lower.startsWith('bula') || lower.startsWith('fórmula') || lower.startsWith('formula')) {
    return EMPRESA_BULA_FORMULA
  }
  return e
}

function brDate(iso: string | null | undefined) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(c => {
    const s = String(c ?? '')
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(';')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function VendasPorAssessorPage() {
  const today = new Date()
  const defaultFrom = new Date(today.getFullYear(), today.getMonth() - 5, 1).toISOString().slice(0, 10)
  const defaultTo = today.toISOString().slice(0, 10)

  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Payload | null>(null)
  const [empresaFilter, setEmpresaFilter] = useState<'todos' | 'bula_formula' | 'outras'>('todos')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [generatingPdf, setGeneratingPdf] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ from, to }).toString()
      const res = await fetch(`/api/leiloes/relatorios?${qs}`, { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [from, to])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Agregação ─────────────────────────────────────────────────────────────
  type AssessorAgg = {
    nome: string; empresa: string;
    transacoes: number; animais: number; vgv: number;
    leiloes: { id: string; nome: string; data: string; transacoes: number; animais: number; vgv: number }[];
  }

  const { assessores, totalVgv, totalAnim, totalTrans } = useMemo(() => {
    const map = new Map<string, AssessorAgg>()
    for (const f of data?.fechamentos ?? []) {
      // Acumula por leilão antes de mesclar, para que entradas centralizadas
      // (ex.: Pedro Barnabé + Matheus Amormino → Marcelo Carneiro) somem
      // suas transações no mesmo leilão em vez de aparecerem duplicadas.
      const perLeilao = new Map<string, { nome: string; empresa: string; transacoes: number; animais: number; vgv: number }>()
      for (const a of f.por_assessor ?? []) {
        const canon = normalizeAssessorNome(a.nome)
        if (!canon) continue
        const cur = perLeilao.get(canon) ?? { nome: canon, empresa: a.empresa || '', transacoes: 0, animais: 0, vgv: 0 }
        cur.transacoes += a.transacoes || 0
        cur.animais += a.animais || 0
        cur.vgv += a.vgv || 0
        if (!cur.empresa && a.empresa) cur.empresa = a.empresa
        perLeilao.set(canon, cur)
      }
      for (const [canon, leilaoAgg] of perLeilao) {
        const cur = map.get(canon) ?? {
          nome: canon, empresa: leilaoAgg.empresa,
          transacoes: 0, animais: 0, vgv: 0, leiloes: [],
        }
        cur.transacoes += leilaoAgg.transacoes
        cur.animais += leilaoAgg.animais
        cur.vgv += leilaoAgg.vgv
        if (!cur.empresa && leilaoAgg.empresa) cur.empresa = leilaoAgg.empresa
        cur.leiloes.push({
          id: f.id, nome: f.nome, data: f.data,
          transacoes: leilaoAgg.transacoes, animais: leilaoAgg.animais, vgv: leilaoAgg.vgv,
        })
        map.set(canon, cur)
      }
    }
    for (const v of map.values()) v.leiloes.sort((x, y) => y.vgv - x.vgv)

    let arr = Array.from(map.values())
    if (empresaFilter === 'bula_formula') {
      arr = arr.filter(a => normalizeEmpresaGrupo(a.empresa) === EMPRESA_BULA_FORMULA)
    } else if (empresaFilter === 'outras') {
      arr = arr.filter(a => normalizeEmpresaGrupo(a.empresa) !== EMPRESA_BULA_FORMULA)
    }
    arr.sort((a, b) => b.vgv - a.vgv)

    const total = arr.reduce((s, a) => s + a.vgv, 0)
    const tAnim = arr.reduce((s, a) => s + a.animais, 0)
    const tTrans = arr.reduce((s, a) => s + a.transacoes, 0)

    return {
      assessores: arr.map((a, i) => ({
        ...a,
        pos: i + 1,
        pct: total > 0 ? a.vgv / total : 0,
        ticket: a.animais > 0 ? a.vgv / a.animais : 0,
      })),
      totalVgv: total, totalAnim: tAnim, totalTrans: tTrans,
    }
  }, [data, empresaFilter])

  const maxVgv = assessores[0]?.vgv ?? 1

  function toggleExpand(nome: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(nome)) next.delete(nome); else next.add(nome)
      return next
    })
  }

  // ── Exports ───────────────────────────────────────────────────────────────
  const exportCsvResumo = () => {
    const rows: (string | number)[][] = [
      ['Posição', 'Assessor', 'Empresa', 'Leilões', 'Transações', 'Animais', 'VGV (R$)', 'Ticket médio', '% do total'],
      ...assessores.map(a => [a.pos, a.nome, a.empresa, a.leiloes.length, a.transacoes, a.animais,
        Math.round(a.vgv), Math.round(a.ticket), (a.pct * 100).toFixed(2)]),
    ]
    downloadCSV(`vendas-por-assessor_${from}_${to}.csv`, rows)
  }

  const exportCsvDetalhado = () => {
    const rows: (string | number)[][] = [
      ['Assessor', 'Empresa', 'Leilão', 'Data', 'Transações', 'Animais', 'VGV (R$)'],
    ]
    for (const a of assessores) {
      for (const l of a.leiloes) {
        rows.push([a.nome, a.empresa, l.nome, l.data, l.transacoes, l.animais, Math.round(l.vgv)])
      }
    }
    downloadCSV(`vendas-por-assessor-detalhado_${from}_${to}.csv`, rows)
  }

  const exportPdf = async () => {
    setGeneratingPdf(true)
    try {
      const [{ default: jsPDF }, autoTable] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable').then(m => m.default),
      ])

      // A4 retrato — 210 x 297 mm
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()
      const M = 14 // margem

      // ── Header ────────────────────────────────────────────────────────────
      // Faixa dourada superior
      doc.setFillColor(160, 121, 46) // #A68B4B
      doc.rect(0, 0, pageW, 18, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.text('BULA ASSESSORIA', M, 11.5)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      const periodo = `Período ${brDate(from)} – ${brDate(to)}`
      doc.text(periodo, pageW - M, 11.5, { align: 'right' })

      // Título principal
      doc.setTextColor(28, 28, 28)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      doc.text('Vendas por Assessor', M, 31)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
      doc.setTextColor(110, 110, 110)
      const filtroLabel =
        empresaFilter === 'bula_formula' ? 'Apenas Bula' :
        empresaFilter === 'outras'       ? 'Apenas outras empresas' : 'Todas as empresas'
      const subt = `Base para conferência de bônus · ${assessores.length} assessores · ${filtroLabel}`
      doc.text(subt, M, 36.5)

      const geradoEm = new Date().toLocaleString('pt-BR')
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text(`Gerado em ${geradoEm}`, pageW - M, 36.5, { align: 'right' })

      // ── Cards de resumo ───────────────────────────────────────────────────
      const cardY = 43
      const cardH = 22
      const cardGap = 4
      const cardW = (pageW - M * 2 - cardGap * 3) / 4

      const cards = [
        { label: 'Assessores', value: String(assessores.length), gold: true },
        { label: 'VGV vinculado', value: fmtBRLCompact(totalVgv) },
        { label: 'Animais', value: fmtNum(totalAnim) },
        { label: 'Transações', value: fmtNum(totalTrans) },
      ]
      cards.forEach((c, i) => {
        const x = M + i * (cardW + cardGap)
        if (c.gold) {
          doc.setFillColor(252, 247, 235)
          doc.setDrawColor(212, 168, 92)
        } else {
          doc.setFillColor(250, 250, 250)
          doc.setDrawColor(225, 225, 225)
        }
        doc.roundedRect(x, cardY, cardW, cardH, 2, 2, 'FD')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(140, 140, 140)
        doc.text(c.label.toUpperCase(), x + 4, cardY + 6)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(14)
        doc.setTextColor(c.gold ? 160 : 28, c.gold ? 121 : 28, c.gold ? 46 : 28)
        doc.text(c.value, x + 4, cardY + 16)
      })

      // ── Tabela principal ──────────────────────────────────────────────────
      autoTable(doc, {
        startY: cardY + cardH + 6,
        margin: { left: M, right: M },
        head: [['#', 'Assessor', 'Empresa', 'Leilões', 'Trans.', 'Animais', 'Ticket méd.', 'VGV', '% Total']],
        body: assessores.map(a => [
          a.pos,
          a.nome,
          normalizeEmpresaGrupo(a.empresa),
          a.leiloes.length,
          a.transacoes,
          fmtNum(a.animais),
          fmtBRL(a.ticket),
          fmtBRL(a.vgv),
          PCT(a.pct),
        ]),
        foot: [['', 'TOTAL', '', '', String(totalTrans), fmtNum(totalAnim), '', fmtBRL(totalVgv), '100,0%']],
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.5, lineColor: [230, 230, 230], lineWidth: 0.1 },
        headStyles: { fillColor: [160, 121, 46], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        footStyles: { fillColor: [248, 244, 233], textColor: [50, 50, 50], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [251, 251, 251] },
        columnStyles: {
          0: { halign: 'center', cellWidth: 8 },
          3: { halign: 'right', cellWidth: 14 },
          4: { halign: 'right', cellWidth: 14 },
          5: { halign: 'right', cellWidth: 16 },
          6: { halign: 'right' },
          7: { halign: 'right', textColor: [160, 121, 46], fontStyle: 'bold' },
          8: { halign: 'right', cellWidth: 16 },
        },
      })

      // ── Detalhamento por assessor (1 seção por assessor) ──────────────────
      let cursorY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cardY + cardH + 6
      cursorY += 8

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(28, 28, 28)
      if (cursorY > pageH - 30) { doc.addPage(); cursorY = 20 }
      doc.text('Detalhamento por leilão', M, cursorY)
      cursorY += 5

      for (const a of assessores) {
        if (cursorY > pageH - 50) { doc.addPage(); cursorY = 20 }

        // Cabeçalho do assessor
        doc.setFillColor(248, 244, 233)
        doc.rect(M, cursorY, pageW - M * 2, 7, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9.5)
        doc.setTextColor(160, 121, 46)
        doc.text(`${a.pos}.  ${a.nome}`, M + 2, cursorY + 4.8)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(110, 110, 110)
        doc.text(normalizeEmpresaGrupo(a.empresa), M + 2 + doc.getTextWidth(`${a.pos}.  ${a.nome}`) + 4, cursorY + 4.8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(28, 28, 28)
        doc.text(`${a.leiloes.length} ${a.leiloes.length === 1 ? 'leilão' : 'leilões'}  •  ${fmtBRL(a.vgv)}`,
          pageW - M - 2, cursorY + 4.8, { align: 'right' })
        cursorY += 7

        autoTable(doc, {
          startY: cursorY,
          margin: { left: M, right: M },
          head: [['Leilão', 'Data', 'Trans.', 'Animais', 'VGV', '% do assessor']],
          body: a.leiloes.map(l => [
            l.nome, brDate(l.data), l.transacoes, fmtNum(l.animais), fmtBRL(l.vgv),
            a.vgv > 0 ? PCT(l.vgv / a.vgv) : '—',
          ]),
          styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.8, lineColor: [240, 240, 240], lineWidth: 0.1 },
          headStyles: { fillColor: [240, 240, 240], textColor: [80, 80, 80], fontSize: 7, fontStyle: 'bold' },
          columnStyles: {
            1: { cellWidth: 20 },
            2: { halign: 'right', cellWidth: 14 },
            3: { halign: 'right', cellWidth: 16 },
            4: { halign: 'right', cellWidth: 24, textColor: [160, 121, 46], fontStyle: 'bold' },
            5: { halign: 'right', cellWidth: 22 },
          },
        })
        cursorY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY
        cursorY += 4
      }

      // ── Comissões por Leilão ──────────────────────────────────────────────
      if ((data?.fechamentos ?? []).length) {
        cursorY += 6
        if (cursorY > pageH - 50) { doc.addPage(); cursorY = 20 }
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(28, 28, 28)
        doc.text('Comissões por leilão', M, cursorY)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(110, 110, 110)
        doc.text('Receita Bula, comissão repassada e sobra bruta', M, cursorY + 4)
        cursorY += 8

        const comItems = [...(data?.fechamentos ?? [])].sort((a, b) => a.data.localeCompare(b.data))
        const tVgv = comItems.reduce((s, f) => s + (f.vgv_total || 0), 0)
        const tRec = comItems.reduce((s, f) => s + (f.receita_bula || 0), 0)
        const tCom = comItems.reduce((s, f) => s + (f.comissao_assessoria || 0), 0)
        const tSob = comItems.reduce((s, f) => s + (f.sobra_bruta || 0), 0)

        autoTable(doc, {
          startY: cursorY,
          margin: { left: M, right: M },
          head: [['Leilão', 'Data', 'VGV', 'Receita', '% s/VGV', 'Comissão', 'Sobra']],
          body: comItems.map(f => {
            const pct = f.vgv_total ? (f.receita_bula || 0) / f.vgv_total : 0
            return [
              f.nome, brDate(f.data), fmtBRL(f.vgv_total),
              f.receita_bula ? fmtBRL(f.receita_bula) : '—',
              f.receita_bula ? PCT(pct) : '—',
              f.comissao_assessoria ? fmtBRL(f.comissao_assessoria) : '—',
              f.sobra_bruta ? fmtBRL(f.sobra_bruta) : '—',
            ]
          }),
          foot: [['', 'TOTAL', fmtBRL(tVgv), fmtBRL(tRec), tVgv ? PCT(tRec / tVgv) : '—', fmtBRL(tCom), fmtBRL(tSob)]],
          styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, lineColor: [230, 230, 230], lineWidth: 0.1 },
          headStyles: { fillColor: [160, 121, 46], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
          footStyles: { fillColor: [248, 244, 233], textColor: [50, 50, 50], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [251, 251, 251] },
          columnStyles: {
            1: { cellWidth: 20 },
            2: { halign: 'right', cellWidth: 22 },
            3: { halign: 'right', cellWidth: 22, textColor: [160, 121, 46], fontStyle: 'bold' },
            4: { halign: 'right', cellWidth: 16 },
            5: { halign: 'right', cellWidth: 22 },
            6: { halign: 'right', cellWidth: 22 },
          },
        })
        cursorY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY
      }

      // ── Faturamento / Comissão por Assessor (2%) ──────────────────────────
      cursorY += 8
      if (cursorY > pageH - 50) { doc.addPage(); cursorY = 20 }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(28, 28, 28)
      doc.text('Faturamento / comissão por assessor', M, cursorY)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(110, 110, 110)
      doc.text('Estimativa de comissão a 2% sobre VGV · pagamento real fica no ERP', M, cursorY + 4)
      cursorY += 8

      const TAXA = 0.02
      const tFat = assessores.reduce((s, a) => s + a.vgv, 0)
      const tComEst = tFat * TAXA

      autoTable(doc, {
        startY: cursorY,
        margin: { left: M, right: M },
        head: [['#', 'Assessor', 'Empresa', 'Leilões', 'Animais', 'Faturamento', 'Comissão (2%)']],
        body: assessores.map(a => [
          a.pos, a.nome, normalizeEmpresaGrupo(a.empresa),
          a.leiloes.length, fmtNum(a.animais), fmtBRL(a.vgv), fmtBRL(a.vgv * TAXA),
        ]),
        foot: [['', 'TOTAL', '', '', '', fmtBRL(tFat), fmtBRL(tComEst)]],
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, lineColor: [230, 230, 230], lineWidth: 0.1 },
        headStyles: { fillColor: [160, 121, 46], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        footStyles: { fillColor: [248, 244, 233], textColor: [50, 50, 50], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [251, 251, 251] },
        columnStyles: {
          0: { halign: 'center', cellWidth: 8 },
          3: { halign: 'right', cellWidth: 14 },
          4: { halign: 'right', cellWidth: 18 },
          5: { halign: 'right', textColor: [160, 121, 46], fontStyle: 'bold' },
          6: { halign: 'right', fontStyle: 'bold' },
        },
      })

      // ── Footer com paginação ──────────────────────────────────────────────
      const total = doc.getNumberOfPages()
      for (let i = 1; i <= total; i++) {
        doc.setPage(i)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(150, 150, 150)
        doc.text(`Vendas por Assessor · Bula Assessoria`, M, pageH - 6)
        doc.text(`Página ${i} de ${total}`, pageW - M, pageH - 6, { align: 'right' })
      }

      doc.save(`vendas-por-assessor_${from}_${to}.pdf`)
    } finally {
      setGeneratingPdf(false)
    }
  }

  return (
    <div className="dcl-root vpa-root">
      {/* Page header */}
      <div className="dcl-pagehead">
        <div>
          <h1>Vendas <span className="dcl-serif">por assessor</span></h1>
          <div className="dcl-sub">Produtividade comercial agregada · base para pagamento de bônus</div>
        </div>
        <div className="dcl-pagehead-right">
          <div className="vpa-rangebox">
            <Calendar size={13} className="vpa-rng-ico" />
            <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="vpa-rng-input" />
            <span className="vpa-rng-sep">→</span>
            <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="vpa-rng-input" />
          </div>
          <Link href="/leiloes/fechamento" className="vpa-link">
            <FileBarChart size={13} /> Ver fechamentos
            <ChevronRight size={12} />
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <div className="vpa-toolbar">
        <div className="vpa-filters">
          <span className="vpa-filter-label">Empresa:</span>
          {([
            { key: 'todos',         label: 'Todas' },
            { key: 'bula_formula',  label: 'Bula' },
            { key: 'outras',        label: 'Outras' },
          ] as const).map(opt => (
            <button
              key={opt.key}
              onClick={() => setEmpresaFilter(opt.key)}
              className={`vpa-filter-pill${empresaFilter === opt.key ? ' vpa-filter-on' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="vpa-actions">
          <button className="vpa-btn" onClick={exportCsvResumo} title="CSV — uma linha por assessor">
            <Download size={13} /> CSV resumo
          </button>
          <button className="vpa-btn" onClick={exportCsvDetalhado} title="CSV — uma linha por assessor × leilão">
            <Download size={13} /> CSV detalhado
          </button>
          <button className="vpa-btn vpa-btn-primary" onClick={exportPdf} disabled={generatingPdf || loading || !data}>
            {generatingPdf ? <Loader2 size={13} className="vpa-spin" /> : <FileText size={13} />}
            {generatingPdf ? 'Gerando…' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      {/* Body */}
      {loading || !data ? (
        <div className="vpa-loading">
          <Loader2 size={28} className="vpa-spin" />
          <span>Carregando relatório…</span>
        </div>
      ) : assessores.length === 0 ? (
        <div className="vpa-empty">
          <Sparkles size={28} />
          <h3>Nenhum assessor com vendas no período</h3>
          <p>Ajuste o intervalo de datas ou cadastre fechamentos com a aba Assessores preenchida.</p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="vpa-stats">
            <Stat label="Assessores ativos" value={String(assessores.length)} sub={assessores[0] ? `Líder: ${assessores[0].nome.split(' ')[0]}` : undefined} icon={<Users size={12} />} gold />
            <Stat label="VGV vinculado"     value={fmtBRLCompact(totalVgv)}  icon={<TrendingUp size={12} />} />
            <Stat label="Animais negociados" value={fmtNum(totalAnim)}        icon={<Trophy size={12} />} />
            <Stat label="Transações"        value={fmtNum(totalTrans)}       icon={<Briefcase size={12} />} />
          </div>

          {/* Ranking table */}
          <div className="vpa-table-wrap">
            <div className="vpa-table-head">
              <div>
                <h3>Ranking · clique em um assessor para ver os leilões</h3>
                <div className="vpa-sub">Comissão e pagamento ficam restritos ao ERP</div>
              </div>
              <span className="vpa-tag-gold">{assessores.length} assessores</span>
            </div>
            <div className="vpa-table-scroll">
              <table className="vpa-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }} aria-label="expandir"></th>
                    <th style={{ width: 50 }}>#</th>
                    <th>Assessor</th>
                    <th>Empresa</th>
                    <th>Leilões</th>
                    <th>Trans.</th>
                    <th>Animais</th>
                    <th>Ticket méd.</th>
                    <th>VGV</th>
                    <th>Participação</th>
                  </tr>
                </thead>
                <tbody>
                  {assessores.map(a => {
                    const isOpen = expanded.has(a.nome)
                    return (
                      <Fragment key={a.nome}>
                        <tr onClick={() => toggleExpand(a.nome)} style={{ cursor: 'pointer' }} className={isOpen ? 'vpa-row-open' : undefined}>
                          <td style={{ textAlign: 'center' }}>
                            <ChevronDown
                              size={14}
                              style={{
                                color: 'var(--dcl-ink-3)',
                                transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                                transition: 'transform .15s',
                              }}
                            />
                          </td>
                          <td>
                            <span className="vpa-rank" style={{ color: a.pos <= 3 ? 'var(--dcl-gold)' : 'var(--dcl-ink-4)' }}>{a.pos}</span>
                          </td>
                          <td><div className="vpa-name">{a.nome}</div></td>
                          <td>
                            <span className={`vpa-tag ${normalizeEmpresaGrupo(a.empresa) === EMPRESA_BULA_FORMULA ? 'vpa-tag-gold' : ''}`}>
                              {normalizeEmpresaGrupo(a.empresa)}
                            </span>
                          </td>
                          <td className="vpa-num">{a.leiloes.length}</td>
                          <td className="vpa-num">{a.transacoes}</td>
                          <td className="vpa-num">{fmtNum(a.animais)}</td>
                          <td className="vpa-num vpa-dim">{fmtBRL(a.ticket)}</td>
                          <td className="vpa-num vpa-gold">{fmtBRL(a.vgv)}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="vpa-bar" style={{ width: 80 }}>
                                <span style={{ width: `${(a.vgv / maxVgv) * 100}%` }} />
                              </div>
                              <span className="vpa-num" style={{ minWidth: 44, textAlign: 'right' }}>{PCT(a.pct)}</span>
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="vpa-row-detail">
                            <td colSpan={10} style={{ padding: 0 }}>
                              <div className="vpa-detail-inner">
                                <div className="vpa-detail-head">
                                  <span>Leilões em que <strong>{a.nome}</strong> participou</span>
                                  <span className="vpa-num">{a.leiloes.length} {a.leiloes.length === 1 ? 'leilão' : 'leilões'}</span>
                                </div>
                                <table className="vpa-detail-table">
                                  <thead>
                                    <tr>
                                      <th>Leilão</th>
                                      <th>Data</th>
                                      <th style={{ textAlign: 'right' }}>Transações</th>
                                      <th style={{ textAlign: 'right' }}>Animais</th>
                                      <th style={{ textAlign: 'right' }}>VGV</th>
                                      <th style={{ textAlign: 'right' }}>% do total dele</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {a.leiloes.map(l => (
                                      <tr key={l.id}>
                                        <td>{l.nome}</td>
                                        <td className="vpa-dim" style={{ fontSize: 11, fontFamily: 'var(--font-mono), ui-monospace, monospace' }}>{brDate(l.data)}</td>
                                        <td className="vpa-num">{l.transacoes}</td>
                                        <td className="vpa-num">{fmtNum(l.animais)}</td>
                                        <td className="vpa-num vpa-gold">{fmtBRL(l.vgv)}</td>
                                        <td className="vpa-num vpa-dim">{a.vgv > 0 ? PCT(l.vgv / a.vgv) : '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Comissões por Leilão ─────────────────────────── */}
          <ComissoesPorLeilao fechamentos={data.fechamentos} />

          {/* ── Faturamento / Comissão por Assessor ──────────── */}
          <FaturamentoPorAssessor assessores={assessores} />
        </>
      )}

      <style jsx global>{`
        .vpa-root { min-height: 100%; padding-bottom: 40px; }

        /* Range / link (mesmo padrão do dashboard) */
        .vpa-rangebox {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 10px; border-radius: 10px;
          background: var(--dcl-bg-card); border: 1px solid var(--dcl-line);
        }
        .vpa-rng-ico { color: var(--dcl-gold); }
        .vpa-rng-sep { color: var(--dcl-ink-3); font-size: 12px; }
        .vpa-rng-input {
          background: transparent; border: none; outline: none;
          color: var(--dcl-ink); font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12px; padding: 2px 0;
          color-scheme: dark;
        }
        :where(html:not(.dark)) .vpa-rng-input { color-scheme: light; }
        .vpa-link {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 12px; border-radius: 10px;
          background: var(--dcl-gold-bg); border: 1px solid var(--dcl-gold-line);
          color: var(--dcl-gold); font-size: 12px; font-weight: 500;
          text-decoration: none;
          transition: background .15s, border-color .15s;
        }
        .vpa-link:hover { background: rgba(200, 169, 110,0.14); border-color: rgba(200, 169, 110,0.45); }

        /* Toolbar */
        .vpa-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 14px; flex-wrap: wrap;
          margin: 18px 0 14px;
        }
        .vpa-filters { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .vpa-filter-label {
          font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--dcl-ink-3); margin-right: 4px;
        }
        .vpa-filter-pill {
          font-size: 11.5px; padding: 5px 11px; border-radius: 999px;
          background: var(--dcl-bg-card); border: 1px solid var(--dcl-line);
          color: var(--dcl-ink-2); cursor: pointer; font-family: inherit;
          transition: all .15s;
        }
        .vpa-filter-pill:hover { color: var(--dcl-ink); border-color: var(--dcl-gold-line); }
        .vpa-filter-on {
          background: linear-gradient(135deg, rgba(200, 169, 110,0.18), rgba(200, 169, 110,0.05));
          border-color: var(--dcl-gold-line);
          color: var(--dcl-gold);
        }
        .vpa-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .vpa-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 11px; border-radius: 8px;
          background: var(--dcl-bg-card); border: 1px solid var(--dcl-line);
          color: var(--dcl-ink-2); font-size: 11.5px; font-weight: 500;
          cursor: pointer; font-family: inherit;
          transition: border-color .15s, color .15s;
        }
        .vpa-btn:hover { border-color: var(--dcl-gold-line); color: var(--dcl-gold); }
        .vpa-btn-primary {
          background: linear-gradient(135deg, rgba(200, 169, 110,0.18), rgba(200, 169, 110,0.05));
          border-color: var(--dcl-gold-line);
          color: var(--dcl-gold);
        }
        .vpa-btn-primary:hover { background: rgba(200, 169, 110,0.22); }
        .vpa-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .vpa-spin { animation: vpa-spin 0.9s linear infinite; }
        @keyframes vpa-spin { to { transform: rotate(360deg); } }

        /* Stats */
        .vpa-stats {
          display: grid; gap: 12px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          margin-bottom: 16px;
        }
        @media (max-width: 900px) { .vpa-stats { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 540px) { .vpa-stats { grid-template-columns: 1fr; } }
        .vpa-stat {
          background: var(--dcl-bg-card); border: 1px solid var(--dcl-line);
          border-radius: 12px; padding: 14px 16px; min-height: 96px;
        }
        .vpa-stat-label {
          font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--dcl-ink-3); display: flex; align-items: center; gap: 6px;
        }
        .vpa-stat-val {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 22px; font-weight: 500; letter-spacing: -0.02em;
          margin-top: 8px; color: var(--dcl-ink);
        }
        .vpa-stat-sub { font-size: 11px; color: var(--dcl-ink-3); margin-top: 4px; }
        .vpa-stat-gold {
          background: linear-gradient(135deg, rgba(200, 169, 110,0.10), rgba(200, 169, 110,0.02));
          border-color: var(--dcl-gold-line);
        }
        .vpa-stat-gold .vpa-stat-val { color: var(--dcl-gold); }

        /* Loading / empty */
        .vpa-loading {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          padding: 80px 0; color: var(--dcl-ink-3);
        }
        .vpa-loading .vpa-spin { color: var(--dcl-gold); }
        .vpa-empty {
          text-align: center; padding: 80px 20px; color: var(--dcl-ink-3);
          border: 1px dashed var(--dcl-line); border-radius: 16px;
        }
        .vpa-empty svg { color: var(--dcl-gold); margin-bottom: 12px; }
        .vpa-empty h3 { color: var(--dcl-ink); font-size: 16px; margin: 0 0 6px; font-weight: 500; }
        .vpa-empty p { font-size: 13px; margin: 0; }

        /* Table */
        .vpa-table-wrap {
          background: var(--dcl-bg-card); border: 1px solid var(--dcl-line);
          border-radius: 16px; overflow: hidden;
        }
        .vpa-table-head {
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 18px; border-bottom: 1px solid var(--dcl-line);
        }
        .vpa-table-head h3 {
          margin: 0; font-size: 14px; font-weight: 500;
          color: var(--dcl-ink); letter-spacing: -0.005em;
        }
        .vpa-sub { color: var(--dcl-ink-3); font-size: 11.5px; margin-top: 2px; }
        .vpa-tag-gold {
          font-size: 10.5px; padding: 4px 10px; border-radius: 999px;
          background: var(--dcl-gold-bg); border: 1px solid var(--dcl-gold-line);
          color: var(--dcl-gold); font-weight: 500;
        }
        .vpa-tag {
          font-size: 10.5px; padding: 3px 9px; border-radius: 999px;
          background: var(--dcl-bg-card-2); border: 1px solid var(--dcl-line);
          color: var(--dcl-ink-3); font-weight: 500;
          white-space: nowrap;
        }
        .vpa-tag-gold {
          background: var(--dcl-gold-bg); border-color: var(--dcl-gold-line);
          color: var(--dcl-gold);
        }

        .vpa-table-scroll { overflow-x: auto; }
        .vpa-table {
          width: 100%; border-collapse: collapse; font-size: 13px;
        }
        .vpa-table thead th {
          font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--dcl-ink-3); font-weight: 600; text-align: left;
          padding: 12px 14px; border-bottom: 1px solid var(--dcl-line);
          background: var(--dcl-bg-card);
        }
        .vpa-table tbody td {
          padding: 12px 14px; border-bottom: 1px solid var(--dcl-line-soft);
          color: var(--dcl-ink-2); vertical-align: middle;
        }
        .vpa-table tbody tr:last-child td { border-bottom: none; }
        .vpa-table tbody tr:hover { background: rgba(200, 169, 110,0.04); }
        .vpa-row-open td { background: rgba(200, 169, 110,0.06) !important; }
        .vpa-row-detail td { background: var(--dcl-bg-card-2) !important; }
        .vpa-totals td {
          background: var(--dcl-bg-card-2) !important;
          border-top: 2px solid var(--dcl-line) !important;
          font-size: 13px;
        }
        .vpa-totals:hover td { background: var(--dcl-bg-card-2) !important; }
        .vpa-rank {
          font-family: var(--font-space-grotesk), system-ui, sans-serif;
          font-style: italic; font-size: 18px;
        }
        .vpa-name { color: var(--dcl-ink); font-weight: 500; }
        .vpa-num {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-variant-numeric: tabular-nums;
          font-size: 12.5px; color: var(--dcl-ink-2);
        }
        .vpa-dim { color: var(--dcl-ink-3); }
        .vpa-gold { color: var(--dcl-gold); font-weight: 500; }
        .vpa-bar {
          height: 6px; background: var(--dcl-bg-card-2);
          border-radius: 999px; overflow: hidden; flex: none;
        }
        .vpa-bar > span {
          display: block; height: 100%;
          background: linear-gradient(90deg, var(--dcl-gold), rgba(200, 169, 110,0.6));
          border-radius: 999px;
          transition: width .4s ease;
        }

        /* Detail */
        .vpa-detail-inner { padding: 14px 18px 18px; }
        .vpa-detail-head {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 11px; color: var(--dcl-ink-3); margin-bottom: 10px;
          letter-spacing: 0.04em; text-transform: uppercase;
        }
        .vpa-detail-head strong { color: var(--dcl-gold); font-weight: 500; }
        .vpa-detail-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .vpa-detail-table th {
          font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--dcl-ink-3); font-weight: 600;
          padding: 6px 10px; text-align: left;
          border-bottom: 1px solid var(--dcl-line);
        }
        .vpa-detail-table td {
          padding: 8px 10px; border-bottom: 1px solid var(--dcl-line-soft);
          color: var(--dcl-ink-2);
        }
        .vpa-detail-table tr:last-child td { border-bottom: none; }
      `}</style>
    </div>
  )
}

// ── Stat card ───────────────────────────────────────────────────────────────

function Stat({ label, value, sub, icon, gold }: {
  label: string; value: string; sub?: string; icon?: React.ReactNode; gold?: boolean
}) {
  return (
    <div className={`vpa-stat${gold ? ' vpa-stat-gold' : ''}`}>
      <div className="vpa-stat-label">{icon}{label}</div>
      <div className="vpa-stat-val">{value}</div>
      {sub && <div className="vpa-stat-sub">{sub}</div>}
    </div>
  )
}

// ── Comissões por Leilão ────────────────────────────────────────────────────

function ComissoesPorLeilao({ fechamentos }: { fechamentos: Fechamento[] }) {
  const items = useMemo(() =>
    [...fechamentos].sort((a, b) => a.data.localeCompare(b.data)), [fechamentos])

  const totalVgv = items.reduce((s, f) => s + (f.vgv_total || 0), 0)
  const totalReceita = items.reduce((s, f) => s + (f.receita_bula || 0), 0)
  const totalComissao = items.reduce((s, f) => s + (f.comissao_assessoria || 0), 0)
  const totalSobra = items.reduce((s, f) => s + (f.sobra_bruta || 0), 0)

  return (
    <div className="vpa-table-wrap" style={{ marginTop: 18 }}>
      <div className="vpa-table-head">
        <div>
          <h3>Comissões por leilão</h3>
          <div className="vpa-sub">Receita Bula, comissão repassada e sobra bruta</div>
        </div>
        <Link href="/leiloes/fechamento" className="vpa-link" style={{ fontSize: 11, padding: '5px 10px' }}>
          <Edit2 size={11} /> Editar fechamentos
        </Link>
      </div>
      <div className="vpa-table-scroll">
        <table className="vpa-table">
          <thead>
            <tr>
              <th>Leilão</th>
              <th>Data</th>
              <th>VGV</th>
              <th>Receita Bula</th>
              <th>% s/VGV</th>
              <th>Comissão assessoria</th>
              <th>Sobra bruta</th>
            </tr>
          </thead>
          <tbody>
            {items.map(f => {
              const pct = f.vgv_total ? (f.receita_bula || 0) / f.vgv_total : 0
              return (
                <tr key={f.id}>
                  <td style={{ maxWidth: 280 }}>
                    <div className="vpa-name">{f.nome}</div>
                  </td>
                  <td className="vpa-num vpa-dim">{brDate(f.data)}</td>
                  <td className="vpa-num">{fmtBRLCompact(f.vgv_total)}</td>
                  <td className="vpa-num vpa-gold">{f.receita_bula ? fmtBRL(f.receita_bula) : '—'}</td>
                  <td className="vpa-num vpa-dim">{f.receita_bula ? PCT(pct) : '—'}</td>
                  <td className="vpa-num">{f.comissao_assessoria ? fmtBRL(f.comissao_assessoria) : '—'}</td>
                  <td className="vpa-num" style={{ color: (f.sobra_bruta ?? 0) < 0 ? '#e57373' : undefined }}>
                    {f.sobra_bruta ? fmtBRL(f.sobra_bruta) : '—'}
                  </td>
                </tr>
              )
            })}
            <tr className="vpa-totals">
              <td colSpan={2} style={{ fontWeight: 600, color: 'var(--dcl-ink)' }}>Total</td>
              <td className="vpa-num" style={{ fontWeight: 600 }}>{fmtBRL(totalVgv)}</td>
              <td className="vpa-num vpa-gold" style={{ fontWeight: 600 }}>{fmtBRL(totalReceita)}</td>
              <td className="vpa-num" style={{ fontWeight: 600 }}>{totalVgv ? PCT(totalReceita / totalVgv) : '—'}</td>
              <td className="vpa-num" style={{ fontWeight: 600 }}>{fmtBRL(totalComissao)}</td>
              <td className="vpa-num" style={{ fontWeight: 600, color: totalSobra < 0 ? '#e57373' : undefined }}>{fmtBRL(totalSobra)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Faturamento / Comissão por Assessor ─────────────────────────────────────

type AssessorAggView = {
  nome: string; empresa: string; pos: number; pct: number; ticket: number;
  transacoes: number; animais: number; vgv: number;
  leiloes: { id: string; nome: string; data: string; transacoes: number; animais: number; vgv: number }[];
}

function FaturamentoPorAssessor({ assessores }: { assessores: AssessorAggView[] }) {
  // Comissão estimada = 2% sobre o VGV de cada assessor (regra praticada
  // tanto para FDB — Bulinha/Marcelo/Matheus — quanto para Bula Assessoria —
  // Douglas/Fábio/Leonardo, conforme memória feedback_comissao_fdb_assessores.md).
  const TAXA = 0.02
  const totalFat = assessores.reduce((s, a) => s + a.vgv, 0)
  const totalCom = assessores.reduce((s, a) => s + a.vgv * TAXA, 0)

  return (
    <div className="vpa-table-wrap" style={{ marginTop: 18 }}>
      <div className="vpa-table-head">
        <div>
          <h3>Faturamento / comissão por assessor</h3>
          <div className="vpa-sub">Estimativa de comissão a 2% sobre VGV · pagamento e detalhe ficam no ERP</div>
        </div>
        <span className="vpa-tag-gold">{assessores.length} assessores · 2% s/VGV</span>
      </div>
      <div className="vpa-table-scroll">
        <table className="vpa-table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>#</th>
              <th>Assessor</th>
              <th>Empresa</th>
              <th>Leilões</th>
              <th>Animais</th>
              <th>Faturamento (VGV)</th>
              <th>Comissão estimada (2%)</th>
            </tr>
          </thead>
          <tbody>
            {assessores.map(a => (
              <tr key={a.nome}>
                <td>
                  <span className="vpa-rank" style={{ color: a.pos <= 3 ? 'var(--dcl-gold)' : 'var(--dcl-ink-4)' }}>{a.pos}</span>
                </td>
                <td><div className="vpa-name">{a.nome}</div></td>
                <td>
                  <span className={`vpa-tag ${normalizeEmpresaGrupo(a.empresa) === EMPRESA_BULA_FORMULA ? 'vpa-tag-gold' : ''}`}>
                    {normalizeEmpresaGrupo(a.empresa)}
                  </span>
                </td>
                <td className="vpa-num">{a.leiloes.length}</td>
                <td className="vpa-num">{fmtNum(a.animais)}</td>
                <td className="vpa-num vpa-gold">{fmtBRL(a.vgv)}</td>
                <td className="vpa-num" style={{ fontWeight: 500 }}>{fmtBRL(a.vgv * TAXA)}</td>
              </tr>
            ))}
            <tr className="vpa-totals">
              <td colSpan={5} style={{ fontWeight: 600, color: 'var(--dcl-ink)' }}>Total</td>
              <td className="vpa-num vpa-gold" style={{ fontWeight: 600 }}>{fmtBRL(totalFat)}</td>
              <td className="vpa-num" style={{ fontWeight: 600 }}>{fmtBRL(totalCom)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{
        padding: '10px 18px', fontSize: 11, color: 'var(--dcl-ink-3)',
        borderTop: '1px solid var(--dcl-line)', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Activity size={11} style={{ color: 'var(--dcl-gold)' }} />
        Estimativa informativa. Comissões reais lançadas no ERP podem diferir conforme acordos individuais.
      </div>
    </div>
  )
}
