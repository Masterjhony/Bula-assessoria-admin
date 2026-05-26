// ============================================================
// Gerador de PDF de Relatórios Operacionais (Projetos / Kanban)
// Brandbook Fórmula do Boi V1.0 — bronze envelhecido + preto absoluto
//
// Dois modos:
//   - 'executive'  → resumo para diretoria/grupo (capa + síntese + ranking)
//   - 'detailed'   → relatório completo (tudo + tarefas por responsável com checklists)
// ============================================================

import type { TacticalTask } from '@/app/sistema/actions/tactical-tasks'
import type { TacticalMember } from '@/app/sistema/actions/tactical-strategic'

export type ReportMode = 'executive' | 'detailed'

export type PdfFilters = {
    period: { from: string | null; to: string | null; label: string }
    responsible: string | null   // null = todos
    status: string | null
    priority: string | null
    strategicStage: string | null
    itemType: 'task' | 'checklist' | 'both'
    situation: 'all' | 'on_track' | 'overdue' | 'stale' | 'blocked' | 'no_due'
}

export type ChecklistItem = {
    id: string
    title: string
    completed: boolean
    assignee?: string | null
    due_date?: string | null
}

// ─── Formatters ────────────────────────────────────────────────────────────

const fmtNum = (v: number) => (Number(v) || 0).toLocaleString('pt-BR')
const fmtPct = (v: number) => `${(Math.max(0, Math.min(100, v)) || 0).toFixed(1).replace('.', ',')}%`
const fmtDateBR = (s?: string | null) => {
    if (!s) return '—'
    const [y, m, d] = String(s).slice(0, 10).split('-')
    if (!y || !m || !d) return '—'
    return `${d}/${m}/${y}`
}
const fmtDateExt = (s: string) => {
    const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
    const [y, m, d] = String(s || '').slice(0, 10).split('-')
    if (!y || !m || !d) return s || ''
    return `${parseInt(d, 10)} ${meses[parseInt(m, 10) - 1]} ${y}`
}

// ─── Asset loader ──────────────────────────────────────────────────────────

async function svgUrlToPng(url: string, targetWidthPx: number): Promise<string | null> {
    try {
        const res = await fetch(url, { cache: 'force-cache' })
        if (!res.ok) return null
        const svgText = await res.text()
        return await new Promise((resolve, reject) => {
            const img = new Image()
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

// ─── Computations ──────────────────────────────────────────────────────────

const DONE_STATUS = 'Completa'
const STALE_DAYS = 7

function isOverdue(t: TacticalTask, now: Date): boolean {
    return !!t.due_date && t.status !== DONE_STATUS && new Date(t.due_date) < now
}
function isStale(t: TacticalTask, now: Date): boolean {
    const ref = new Date(t.status_changed_at || t.created_at)
    const days = (now.getTime() - ref.getTime()) / 86400000
    return days > STALE_DAYS && t.status !== DONE_STATUS
}
export type Metrics = {
    total: number
    byStatus: Map<string, number>
    em_andamento: number
    atrasadas: number
    paradas: number
    completas: number
    bloqueadas: number
    sem_prazo: number
    checklistTotal: number
    checklistPendentes: number
    checklistAtrasadas: number
    checklistConcluidas: number
    taxaConclusao: number    // 0..100
    responsavelMaiorCarga: { name: string; count: number } | null
    byResponsavel: Map<string, {
        total: number
        em_andamento: number
        atrasadas: number
        completas: number
        checklistTotal: number
        checklistPendentes: number
    }>
}

export function computeMetrics(tasks: TacticalTask[]): Metrics {
    const now = new Date()
    const byStatus = new Map<string, number>()
    const byResponsavel = new Map<string, Metrics['byResponsavel'] extends Map<string, infer V> ? V : never>()

    let em_andamento = 0, atrasadas = 0, paradas = 0, completas = 0, bloqueadas = 0, sem_prazo = 0
    let checklistTotal = 0, checklistPendentes = 0, checklistAtrasadas = 0, checklistConcluidas = 0

    const tocaResp = (name: string) => {
        if (!byResponsavel.has(name)) {
            byResponsavel.set(name, {
                total: 0, em_andamento: 0, atrasadas: 0, completas: 0,
                checklistTotal: 0, checklistPendentes: 0,
            })
        }
        return byResponsavel.get(name)!
    }

    for (const t of tasks) {
        const st = t.status || '—'
        byStatus.set(st, (byStatus.get(st) || 0) + 1)
        if (st === 'Em andamento') em_andamento++
        if (st === DONE_STATUS) completas++
        if (st === 'Bloqueado') bloqueadas++

        if (isOverdue(t, now)) atrasadas++
        if (isStale(t, now)) paradas++
        if (!t.due_date) sem_prazo++

        const cleanAssignees = (t.assignees || [])
            .map(a => (a ? String(a).trim() : ''))
            .filter(Boolean)
        const assignees = cleanAssignees.length > 0 ? cleanAssignees : ['Sem responsável']
        for (const a of assignees) {
            const rec = tocaResp(a)
            rec.total++
            if (st === 'Em andamento') rec.em_andamento++
            if (st === DONE_STATUS) rec.completas++
            if (isOverdue(t, now)) rec.atrasadas++
        }

        for (const c of (t.checklists || [])) {
            checklistTotal++
            if (c.completed) checklistConcluidas++
            else {
                checklistPendentes++
                if (c.due_date && new Date(c.due_date) < now) checklistAtrasadas++
            }
            // Atribuição do item de checklist:
            //   • se o item tem assignee próprio → vale o do item;
            //   • senão → herda TODOS os responsáveis do card pai (não só o primeiro).
            // Quando o card pai também está sem responsável, o item cai em
            // 'Sem responsável' — preservando visibilidade dos cards realmente
            // órfãos.
            const ownAssignee = (c.assignee && String(c.assignee).trim()) ? String(c.assignee).trim() : null
            const cAssignees = ownAssignee ? [ownAssignee] : assignees
            for (const cA of cAssignees) {
                const rec = tocaResp(cA)
                rec.checklistTotal++
                if (!c.completed) rec.checklistPendentes++
            }
        }
    }

    let responsavelMaiorCarga: { name: string; count: number } | null = null
    for (const [name, rec] of byResponsavel.entries()) {
        if (name === 'Sem responsável') continue
        const open = rec.total - rec.completas + rec.checklistPendentes
        if (!responsavelMaiorCarga || open > responsavelMaiorCarga.count) {
            responsavelMaiorCarga = { name, count: open }
        }
    }

    const total = tasks.length
    const taxaConclusao = total > 0 ? (completas / total) * 100 : 0

    return {
        total, byStatus,
        em_andamento, atrasadas, paradas, completas, bloqueadas, sem_prazo,
        checklistTotal, checklistPendentes, checklistAtrasadas, checklistConcluidas,
        taxaConclusao, responsavelMaiorCarga, byResponsavel,
    }
}

// ─── Filtering ─────────────────────────────────────────────────────────────

export function applyFilters(all: TacticalTask[], filters: PdfFilters): TacticalTask[] {
    const now = new Date()
    return all.filter(t => {
        if (filters.responsible && !(t.assignees || []).includes(filters.responsible)) return false
        if (filters.status && t.status !== filters.status) return false
        if (filters.priority && t.priority !== filters.priority) return false
        if (filters.strategicStage && t.strategic_stage !== filters.strategicStage) return false
        if (filters.itemType === 'checklist' && (!t.checklists || t.checklists.length === 0)) return false
        switch (filters.situation) {
            case 'overdue': return isOverdue(t, now)
            case 'stale': return isStale(t, now)
            case 'blocked': return t.status === 'Bloqueado'
            case 'no_due': return !t.due_date
            case 'on_track':
                return t.status !== DONE_STATUS && !isOverdue(t, now) && !isStale(t, now) && t.status !== 'Bloqueado'
            default: return true
        }
    })
}

// ============================================================
// PDF Generation
// ============================================================

export async function generateTacticalPlanPDF(
    tasks: TacticalTask[],
    members: TacticalMember[],
    filters: PdfFilters,
    mode: ReportMode,
): Promise<void> {
    const [{ default: jsPDF }, autoTable] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable').then(m => m.default),
    ])

    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    type LastAutoTable = { lastAutoTable?: { finalY: number } }
    const PW = doc.internal.pageSize.getWidth()
    const PH = doc.internal.pageSize.getHeight()
    const M = 16

    // Brandbook palette
    const BRONZE: [number, number, number] = [160, 121, 46]      // #A0792E
    const BRONZE_700: [number, number, number] = [107, 79, 30]
    const BRONZE_300: [number, number, number] = [212, 168, 92]
    const BRONZE_100: [number, number, number] = [232, 203, 133]
    const PRETO: [number, number, number] = [0, 0, 0]
    const INK: [number, number, number] = [10, 10, 10]
    const GRAY_600: [number, number, number] = [74, 74, 74]
    const GRAY_400: [number, number, number] = [120, 120, 120]
    const GRAY_300: [number, number, number] = [160, 160, 160]
    const TECH_GREEN: [number, number, number] = [127, 212, 160]
    const TECH_RED: [number, number, number] = [192, 80, 77]
    const TECH_AMBER: [number, number, number] = [219, 168, 88]
    const BRANCO: [number, number, number] = [255, 255, 255]
    const PAPER: [number, number, number] = [251, 250, 246]
    const PAPER_LINE: [number, number, number] = [228, 220, 200]
    const ROW_ALT: [number, number, number] = [248, 244, 233]

    // Logos
    const [bullWhite, bullBronze] = await Promise.all([
        svgUrlToPng('/brand/bull-white.svg', 600),
        svgUrlToPng('/brand/bull-bronze.svg', 200),
    ])

    const metrics = computeMetrics(tasks)
    const now = new Date()

    // ════════════ CAPA ════════════
    doc.setFillColor(...PRETO)
    doc.rect(0, 0, PW, PH, 'F')

    // Marca top
    doc.setFillColor(...BRONZE)
    doc.rect(M, 18, 2.5, 2.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...BRONZE_300)
    doc.text('FÓRMULA DO BOI · OPERAÇÕES', M + 5, 20)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY_400)
    doc.text(`§ ${mode === 'executive' ? 'RELATÓRIO EXECUTIVO' : 'RELATÓRIO DETALHADO'}`, PW - M, 20, { align: 'right' })

    // Bull logo central
    if (bullWhite) {
        const bullH = 32
        const bullW = bullH * (360 / 200)
        doc.addImage(bullWhite, 'PNG', (PW - bullW) / 2, 42, bullW, bullH, undefined, 'FAST')
    }

    // Wordmark
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...BRONZE_300)
    doc.text('FÓRMULA DO BOI', PW / 2, 85, { align: 'center', charSpace: 0.4 })

    // Linha decorativa
    doc.setDrawColor(...BRONZE)
    doc.setLineWidth(0.4)
    doc.line(PW / 2 - 35, 89, PW / 2 + 35, 89)

    // Categoria
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...BRONZE_300)
    doc.text('— RELATÓRIOS OPERACIONAIS —', PW / 2, 95, { align: 'center', charSpace: 0.5 })

    // Título
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(28)
    doc.setTextColor(...BRANCO)
    doc.text('Status, atrasos', PW / 2, 116, { align: 'center' })
    doc.text('e entregas da equipe', PW / 2, 128, { align: 'center' })

    // Subtítulo (filtros / período)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)
    doc.setTextColor(...BRONZE_300)
    doc.text(filters.period.label || 'Período completo', PW / 2, 138, { align: 'center' })

    // Statement card — KPI hero
    const stmtY = 152
    doc.setFillColor(15, 11, 4)
    doc.setDrawColor(...BRONZE)
    doc.setLineWidth(0.5)
    doc.roundedRect(M, stmtY, PW - M * 2, 38, 2, 2, 'FD')
    doc.setDrawColor(...BRONZE_700)
    doc.setLineWidth(0.15)
    doc.roundedRect(M + 2, stmtY + 2, PW - M * 2 - 4, 34, 1.5, 1.5, 'D')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...BRONZE)
    doc.text('— TAXA DE CONCLUSÃO', M + 7, stmtY + 9, { charSpace: 0.3 })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(26)
    doc.setTextColor(...BRONZE_100)
    doc.text(fmtPct(metrics.taxaConclusao), M + 7, stmtY + 24)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY_300)
    doc.text(
        `${fmtNum(metrics.completas)} de ${fmtNum(metrics.total)} tarefas  ·  ${fmtNum(metrics.em_andamento)} em andamento  ·  ${fmtNum(metrics.atrasadas)} atrasadas`,
        M + 7, stmtY + 32
    )

    // 4 KPI cards
    const kpiY = stmtY + 44
    const kpiW = (PW - M * 2 - 6) / 2
    const kpiH = 22
    const capaKpis: { label: string; value: string }[] = [
        { label: 'TAREFAS TOTAIS', value: fmtNum(metrics.total) },
        { label: 'ATRASADAS', value: fmtNum(metrics.atrasadas) },
        { label: 'CHECKLISTS PENDENTES', value: fmtNum(metrics.checklistPendentes) },
        { label: 'PARADAS (>7d)', value: fmtNum(metrics.paradas) },
    ]
    capaKpis.forEach((k, i) => {
        const x = M + (i % 2) * (kpiW + 6)
        const y = kpiY + Math.floor(i / 2) * (kpiH + 5)
        doc.setFillColor(15, 11, 4)
        doc.setDrawColor(...BRONZE_700)
        doc.setLineWidth(0.25)
        doc.roundedRect(x, y, kpiW, kpiH, 1.5, 1.5, 'FD')
        doc.setFillColor(...BRONZE)
        doc.rect(x, y, 0.8, kpiH, 'F')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(...BRONZE_300)
        doc.text(k.label, x + 5, y + 7, { charSpace: 0.3 })
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(14)
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
    doc.text(`gerado em ${now.toLocaleString('pt-BR')}`, M, PH - 7)

    // ─── Helpers páginas internas ───────────────────────────────────────
    let secao = ''
    let pageNum = 1
    const desenhaFooter = () => {
        doc.setDrawColor(...PAPER_LINE)
        doc.setLineWidth(0.3)
        doc.line(M, PH - 14, PW - M, PH - 14)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.5)
        doc.setTextColor(...GRAY_600)
        doc.text(`● RELATÓRIO OPERACIONAL  ·  ${fmtDateExt(now.toISOString().slice(0, 10))}`, M, PH - 9)
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
        doc.setFillColor(...PAPER)
        doc.rect(0, 0, PW, PH, 'F')
        doc.setFillColor(...PRETO)
        doc.rect(0, 0, PW, 14, 'F')
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
        doc.text('FÓRMULA DO BOI · OPERAÇÕES', M + 10, 8.5, { charSpace: 0.2 })
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...GRAY_400)
        doc.text(`§ ${nomeSecao.toUpperCase()}`, PW - M, 8.5, { align: 'right' })
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
    const ensureSpace = (y: number, needed: number, sectionName: string): number => {
        if (y + needed > PH - 18) {
            return novaPagina(sectionName)
        }
        return y
    }

    // ════════════ 02 SÍNTESE ════════════
    let y = novaPagina('Síntese')
    y = tituloSecao(y, '02 SÍNTESE', 'Raio-X da operação', 'Indicadores macro · tarefas, checklists e gargalos da equipe')

    // Card hero — Taxa de conclusão
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
    doc.text('— TAXA DE CONCLUSÃO NO PERÍODO', M + 6, y + 7, { charSpace: 0.3 })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.setTextColor(...BRONZE_100)
    doc.text(fmtPct(metrics.taxaConclusao), M + 6, y + 18)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRAY_300)
    doc.text(
        `${fmtNum(metrics.completas)} completas  ·  ${fmtNum(metrics.em_andamento)} em andamento  ·  ${fmtNum(metrics.total)} no total`,
        PW - M - 6, y + 18, { align: 'right' }
    )
    y += 30

    // 4 cards principais
    const k4: { l: string; v: string; sub: string }[] = [
        { l: 'TAREFAS TOTAIS', v: fmtNum(metrics.total), sub: 'cards no Kanban' },
        { l: 'EM ANDAMENTO', v: fmtNum(metrics.em_andamento), sub: 'ativas agora' },
        { l: 'ATRASADAS', v: fmtNum(metrics.atrasadas), sub: 'prazo vencido' },
        { l: 'PARADAS', v: fmtNum(metrics.paradas), sub: `sem mover há ${STALE_DAYS}+ dias` },
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

    // 4 cards secundários — checklists & carga
    const k4b: { l: string; v: string; sub: string; color: [number, number, number] }[] = [
        { l: 'CHECKLISTS PENDENTES', v: fmtNum(metrics.checklistPendentes), sub: `de ${fmtNum(metrics.checklistTotal)} itens`, color: TECH_AMBER },
        { l: 'CHECKLISTS ATRASADAS', v: fmtNum(metrics.checklistAtrasadas), sub: 'com prazo vencido', color: TECH_RED },
        { l: 'BLOQUEADAS', v: fmtNum(metrics.bloqueadas), sub: 'aguardando dependência', color: TECH_AMBER },
        { l: 'MAIOR CARGA', v: metrics.responsavelMaiorCarga?.name ?? '—', sub: metrics.responsavelMaiorCarga ? `${metrics.responsavelMaiorCarga.count} itens abertos` : '—', color: BRONZE_300 },
    ]
    k4b.forEach((k, i) => {
        const x = M + i * (kw + 3)
        doc.setFillColor(...BRANCO)
        doc.setDrawColor(...PAPER_LINE)
        doc.setLineWidth(0.3)
        doc.roundedRect(x, y, kw, kh, 1.5, 1.5, 'FD')
        doc.setFillColor(...k.color)
        doc.rect(x, y, kw, 0.6, 'F')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.2)
        doc.setTextColor(...BRONZE_700)
        doc.text(k.l, x + 4, y + 6, { charSpace: 0.3 })
        doc.setFont('helvetica', 'bold')
        const valFs = k.v.length > 14 ? 10 : k.v.length > 10 ? 12 : 16
        doc.setFontSize(valFs)
        doc.setTextColor(...INK)
        const cut = k.v.length > 22 ? k.v.slice(0, 22) + '…' : k.v
        doc.text(cut, x + 4, y + 15)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.5)
        doc.setTextColor(...GRAY_600)
        doc.text(k.sub, x + 4, y + 19.5)
    })
    y += kh + 8

    // ──── Distribuição por status ────
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...BRONZE)
    doc.text('— STATUS GERAL DAS TAREFAS', M, y, { charSpace: 0.3 })
    doc.setDrawColor(...BRONZE)
    doc.setLineWidth(0.2)
    doc.line(M + 60, y - 1, PW - M, y - 1)
    y += 4

    const statusRows: (string | number)[][] = []
    const sortedStatus = Array.from(metrics.byStatus.entries())
        .sort((a, b) => b[1] - a[1])
    for (const [st, n] of sortedStatus) {
        const pct = metrics.total > 0 ? (n / metrics.total) * 100 : 0
        let obs = ''
        const stl = st.toLowerCase()
        if (stl.includes('ide')) obs = 'Ainda sem execução'
        else if (stl.includes('fazer')) obs = 'Próximas prioridades'
        else if (stl.includes('andamento')) obs = 'Em execução agora'
        else if (stl.includes('completa')) obs = 'Entregue'
        else if (stl.includes('recorrente')) obs = 'Operação contínua'
        else if (stl.includes('bloqueado')) obs = 'Aguardando dependência'
        statusRows.push([st, fmtNum(n), fmtPct(pct), obs])
    }
    autoTable(doc, {
        startY: y,
        head: [['Status', 'Quantidade', '%', 'Observação']],
        body: statusRows,
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, textColor: INK, lineColor: PAPER_LINE, lineWidth: 0.1 },
        headStyles: { fillColor: PRETO, textColor: BRONZE_300, fontStyle: 'bold', fontSize: 8, halign: 'left' },
        alternateRowStyles: { fillColor: ROW_ALT },
        columnStyles: {
            0: { cellWidth: 50 },
            1: { halign: 'right', cellWidth: 30 },
            2: { halign: 'right', cellWidth: 25 },
            3: { cellWidth: 'auto', textColor: GRAY_600 },
        },
        margin: { left: M, right: M },
        didDrawPage: () => desenhaFooter(),
    })
    y = (doc as unknown as LastAutoTable).lastAutoTable!.finalY + 8

    // ════════════ 03 POR RESPONSÁVEL — TABELA ════════════
    y = ensureSpace(y, 60, 'Por Responsável')
    y = tituloSecao(y, '03 POR RESPONSÁVEL', 'Carga e entregas', 'Tarefas e checklists abertos por membro da equipe')

    const respRows: (string | number)[][] = []
    const sortedResp = Array.from(metrics.byResponsavel.entries())
        .sort((a, b) => (b[1].total - b[1].completas) - (a[1].total - a[1].completas))
    for (const [name, rec] of sortedResp) {
        const abertas = rec.total - rec.completas
        respRows.push([
            name,
            fmtNum(rec.total),
            fmtNum(rec.em_andamento),
            fmtNum(rec.atrasadas),
            fmtNum(rec.completas),
            fmtNum(abertas),
            fmtNum(rec.checklistPendentes),
        ])
    }
    autoTable(doc, {
        startY: y,
        head: [['Responsável', 'Total', 'Em andam.', 'Atrasadas', 'Completas', 'Abertas', 'Checklist pend.']],
        body: respRows,
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, textColor: INK, lineColor: PAPER_LINE, lineWidth: 0.1 },
        headStyles: { fillColor: PRETO, textColor: BRONZE_300, fontStyle: 'bold', fontSize: 8, halign: 'right' },
        alternateRowStyles: { fillColor: ROW_ALT },
        columnStyles: {
            0: { halign: 'left', cellWidth: 50, fontStyle: 'bold' },
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right', textColor: TECH_RED },
            4: { halign: 'right', textColor: TECH_GREEN },
            5: { halign: 'right' },
            6: { halign: 'right', textColor: TECH_AMBER },
        },
        margin: { left: M, right: M },
        didDrawPage: () => desenhaFooter(),
    })
    y = (doc as unknown as LastAutoTable).lastAutoTable!.finalY + 8

    // ════════════ 04 ATRASADAS (sempre) ════════════
    const overdue = tasks.filter(t => isOverdue(t, now))
        .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
    if (overdue.length > 0) {
        y = ensureSpace(y, 50, 'Atrasadas')
        y = tituloSecao(y, '04 ATRASADAS', 'Prazo vencido', `${overdue.length} tarefa${overdue.length === 1 ? '' : 's'} com prazo vencido — atenção imediata`)

        const overdueRows = overdue.map(t => [
            t.title,
            (t.assignees || []).join(', ') || '—',
            t.status,
            t.priority,
            fmtDateBR(t.due_date),
            `${Math.floor((now.getTime() - new Date(t.due_date!).getTime()) / 86400000)}d`,
        ])
        autoTable(doc, {
            startY: y,
            head: [['Tarefa', 'Responsável', 'Status', 'Prioridade', 'Vencimento', 'Atraso']],
            body: overdueRows,
            styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.6, textColor: INK, lineColor: PAPER_LINE, lineWidth: 0.1 },
            headStyles: { fillColor: PRETO, textColor: BRONZE_300, fontStyle: 'bold', fontSize: 7.8 },
            alternateRowStyles: { fillColor: ROW_ALT },
            columnStyles: {
                0: { cellWidth: 'auto', fontStyle: 'bold' },
                1: { cellWidth: 36, textColor: GRAY_600 },
                2: { cellWidth: 24 },
                3: { cellWidth: 20 },
                4: { cellWidth: 22, halign: 'right' },
                5: { cellWidth: 16, halign: 'right', textColor: TECH_RED, fontStyle: 'bold' },
            },
            margin: { left: M, right: M },
            didDrawPage: () => desenhaFooter(),
        })
        y = (doc as unknown as LastAutoTable).lastAutoTable!.finalY + 8
    }

    // ════════════ DETAILED MODE ════════════
    if (mode === 'detailed') {
        // ──── 05 TAREFAS POR RESPONSÁVEL (com checklists) ────
        const grouped = new Map<string, TacticalTask[]>()
        for (const t of tasks) {
            const assignees = (t.assignees && t.assignees.length > 0) ? t.assignees : ['Sem responsável']
            for (const a of assignees) {
                if (!grouped.has(a)) grouped.set(a, [])
                grouped.get(a)!.push(t)
            }
        }
        const sortedGroups = Array.from(grouped.entries())
            .sort((a, b) => b[1].length - a[1].length)

        for (const [name, list] of sortedGroups) {
            y = novaPagina(`Detalhes · ${name}`)
            y = tituloSecao(y, '05 DETALHAMENTO', name, `${list.length} tarefa${list.length === 1 ? '' : 's'} sob este responsável`)

            for (const t of list) {
                const checklistCount = (t.checklists || []).length
                // estimate height needed: header (16) + status block (8) + per-checklist (5) + footer gap (6)
                const estHeight = 24 + Math.min(checklistCount, 8) * 5
                y = ensureSpace(y, estHeight, `Detalhes · ${name}`)

                // Card header
                doc.setFillColor(...BRANCO)
                doc.setDrawColor(...PAPER_LINE)
                doc.setLineWidth(0.3)
                doc.roundedRect(M, y, PW - M * 2, 14, 1.5, 1.5, 'FD')
                doc.setFillColor(...(isOverdue(t, now) ? TECH_RED : (t.status === DONE_STATUS ? TECH_GREEN : BRONZE)))
                doc.rect(M, y, 0.8, 14, 'F')

                // Title
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(10.5)
                doc.setTextColor(...INK)
                const title = t.title.length > 70 ? t.title.slice(0, 70) + '…' : t.title
                doc.text(title, M + 4, y + 6)

                // Meta line
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(7.3)
                doc.setTextColor(...GRAY_600)
                const metaParts = [
                    t.status,
                    `Prioridade: ${t.priority}`,
                    t.due_date ? `Vence: ${fmtDateBR(t.due_date)}` : 'Sem prazo',
                    t.strategic_stage ? `Etapa: ${t.strategic_stage}` : null,
                    isOverdue(t, now) ? '● ATRASADA' : null,
                ].filter(Boolean).join('  ·  ')
                doc.text(metaParts, M + 4, y + 11)
                y += 16

                // Checklists
                if (checklistCount > 0) {
                    doc.setFont('helvetica', 'bold')
                    doc.setFontSize(7)
                    doc.setTextColor(...BRONZE)
                    const done = (t.checklists || []).filter(c => c.completed).length
                    doc.text(`CHECKLIST  ·  ${done}/${checklistCount} concluído${checklistCount === 1 ? '' : 's'}`, M + 4, y, { charSpace: 0.3 })
                    y += 3.5

                    for (const c of (t.checklists || [])) {
                        y = ensureSpace(y, 6, `Detalhes · ${name}`)
                        // Box
                        doc.setDrawColor(...(c.completed ? TECH_GREEN : GRAY_300))
                        doc.setLineWidth(0.3)
                        doc.rect(M + 6, y - 2.5, 2.4, 2.4, c.completed ? 'F' : 'D')
                        if (c.completed) {
                            doc.setFillColor(...TECH_GREEN)
                            doc.rect(M + 6, y - 2.5, 2.4, 2.4, 'F')
                            doc.setDrawColor(...BRANCO)
                            doc.setLineWidth(0.4)
                            doc.line(M + 6.5, y - 1.4, M + 7.1, y - 0.6)
                            doc.line(M + 7.1, y - 0.6, M + 8.2, y - 2.1)
                        }
                        doc.setFont('helvetica', c.completed ? 'normal' : 'bold')
                        doc.setFontSize(8)
                        doc.setTextColor(...(c.completed ? GRAY_400 : INK))
                        const cTitle = c.title.length > 75 ? c.title.slice(0, 75) + '…' : c.title
                        doc.text(cTitle, M + 10, y - 0.3)

                        // Suffix (assignee + due)
                        const suffix: string[] = []
                        if (c.assignee) suffix.push(c.assignee)
                        if (c.due_date) {
                            const overdueChk = !c.completed && new Date(c.due_date) < now
                            suffix.push((overdueChk ? '● ' : '') + fmtDateBR(c.due_date))
                        }
                        if (suffix.length > 0) {
                            doc.setFont('helvetica', 'normal')
                            doc.setFontSize(7)
                            doc.setTextColor(...GRAY_400)
                            doc.text(suffix.join('  ·  '), PW - M - 4, y - 0.3, { align: 'right' })
                        }
                        y += 4.5
                    }
                    y += 2
                } else {
                    doc.setFont('helvetica', 'italic')
                    doc.setFontSize(7)
                    doc.setTextColor(...GRAY_400)
                    doc.text('Sem checklist nesta tarefa.', M + 4, y)
                    y += 4
                }
                y += 3
            }
        }
    } else {
        // ════════════ Executive — Ranking de carga ════════════
        if (sortedResp.length > 0) {
            y = ensureSpace(y, 60, 'Ranking de carga')
            y = tituloSecao(y, '05 RANKING DE CARGA', 'Top responsáveis', 'Quem tem mais itens abertos hoje')

            const top = sortedResp.slice(0, 8)
            for (const [name, rec] of top) {
                y = ensureSpace(y, 14, 'Ranking de carga')
                const abertas = rec.total - rec.completas
                const pctComp = rec.total > 0 ? (rec.completas / rec.total) * 100 : 0

                doc.setFillColor(...BRANCO)
                doc.setDrawColor(...PAPER_LINE)
                doc.setLineWidth(0.3)
                doc.roundedRect(M, y, PW - M * 2, 12, 1.2, 1.2, 'FD')
                doc.setFillColor(...BRONZE)
                doc.rect(M, y, 0.8, 12, 'F')

                doc.setFont('helvetica', 'bold')
                doc.setFontSize(10)
                doc.setTextColor(...INK)
                doc.text(name, M + 4, y + 5)
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(7.5)
                doc.setTextColor(...GRAY_600)
                doc.text(
                    `${abertas} abertas  ·  ${rec.atrasadas} atrasadas  ·  ${rec.checklistPendentes} checklist pend.  ·  ${pctComp.toFixed(0)}% concluídas`,
                    M + 4, y + 9.5
                )

                // Mini bar progress
                const barX = PW - M - 50
                const barY = y + 4
                const barW = 46
                const barH = 4
                doc.setFillColor(...PAPER_LINE)
                doc.roundedRect(barX, barY, barW, barH, 0.8, 0.8, 'F')
                doc.setFillColor(...BRONZE)
                doc.roundedRect(barX, barY, Math.max(0.6, (pctComp / 100) * barW), barH, 0.8, 0.8, 'F')

                y += 14
            }
        }
    }

    // ─── Save ──────────────────────────────────────────────────────────
    const suffix = mode === 'executive' ? 'executivo' : 'detalhado'
    const dateTag = now.toISOString().slice(0, 10)
    doc.save(`relatorio-operacional-${suffix}-${dateTag}.pdf`)
}
