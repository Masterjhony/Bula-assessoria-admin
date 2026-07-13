import type { Relatorio, RelatorioLote } from '@/lib/videoextrator'

type AnaliseResumo = {
  indice_assertividade?: number | null
  assertividade?: {
    buyer_recall_pct?: number | null
    value_accuracy_pct?: number | null
  } | null
} | null

function numero(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function totalLote(lote: RelatorioLote): number | null {
  return numero(lote.valor_total_negociado)
    ?? numero(lote.financeiro?.total_confirmado)
    ?? numero(lote.valor_total_estimado)
    ?? numero(lote.financeiro?.valor_total)
}

function statusLote(lote: RelatorioLote): string {
  const parcial = String(lote.status_parcial || '').toUpperCase()
  if (parcial === 'VENDIDO_CONFIRMADO') return 'Vendido confirmado'
  if (parcial === 'A_CONFIRMAR') return 'A confirmar'
  if (parcial === 'EM_DISPUTA') return 'Em disputa'
  if (String(lote.motivo || '').toUpperCase() === 'VENDIDO') return 'Vendido'
  if (String(lote.motivo || '').toUpperCase() === 'NAO_VENDIDO') return 'Não vendido'
  return parcial || 'Pendente'
}

function pendenciasLote(lote: RelatorioLote): string[] {
  const items: string[] = []
  if (!lote.numero_lote || String(lote.numero_lote).startsWith('AUTO-')) items.push('número não confirmado')
  if (statusLote(lote).toLowerCase().includes('vendido') && totalLote(lote) == null) items.push('total financeiro incompleto')
  if (String(lote.comprador_status || '').toLowerCase() === 'pendente' || !lote.comprador) items.push('comprador pendente')
  if (numero(lote.confianca) != null && Number(lote.confianca) < 0.75) items.push('baixa confiança')
  if (String(lote.qa_flags || '').includes('cross_modal_disagreement')) items.push('divergência áudio/vídeo')
  if (String(lote.status_parcial || '').toUpperCase() === 'A_CONFIRMAR') items.push('martelo a confirmar')
  return [...new Set(items)]
}

function nomeArquivo(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'leilao'
}

function brl(value: number | null | undefined): string {
  return value == null
    ? '—'
    : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function volumeRelatorio(relatorio: Relatorio): number {
  return numero(relatorio.volume_total_estimado)
    ?? numero(relatorio.volume_total_confirmado)
    ?? numero(relatorio.volume_total)
    ?? 0
}

export async function exportarRelatorioExcel(nome: string, relatorio: Relatorio, analise: AnaliseResumo) {
  const XLSX = await import('xlsx')
  const agora = new Date()
  const pendentes = (relatorio.lotes || []).filter((lote) => pendenciasLote(lote).length > 0)
  const resumo = [
    ['Evento', nome],
    ['Vídeo', relatorio.video_id],
    ['Gerado em', agora.toLocaleString('pt-BR')],
    ['Lotes identificados', relatorio.total_lotes],
    ['Vendas confirmadas', relatorio.vendidos],
    ['Não vendidos', relatorio.nao_vendidos],
    ['Volume estimado', volumeRelatorio(relatorio)],
    ['Volume confirmado', numero(relatorio.volume_total_confirmado)],
    ['Cobertura financeira', relatorio.cobertura_total_pct == null ? null : `${relatorio.cobertura_total_pct}%`],
    ['Índice de assertividade', analise?.indice_assertividade == null ? null : `${Math.round(analise.indice_assertividade)}%`],
    ['Pendências para revisão', pendentes.length],
  ]
  const lotes = (relatorio.lotes || []).map((lote) => ({
    Lote: lote.numero_lote || '',
    Status: statusLote(lote),
    'Animal / descrição': lote.identificacao_animal || lote.nome_animal || lote.descricao_lote || '',
    Comprador: lote.comprador || '',
    'Status comprador': lote.comprador_status || 'pendente',
    Assessor: lote.assessor_nome || '',
    Assessoria: lote.assessoria_comprador || lote.assessoria || '',
    'Valor por parcela': numero(lote.valor_parcela) ?? numero(lote.valor_final),
    Parcelas: numero(lote.total_parcelas),
    Animais: numero(lote.quantidade_animais),
    Unidade: lote.unidade_preco || '',
    'Valor total': totalLote(lote),
    Confiança: numero(lote.confianca),
    Pendências: pendenciasLote(lote).join('; '),
  }))
  const compradores = (relatorio.top_compradores || []).map((item, index) => ({
    Posição: index + 1,
    Comprador: item.nome,
    Volume: item.volume,
  }))
  const pendencias = pendentes.map((lote) => ({
    Lote: lote.numero_lote || '',
    Pendências: pendenciasLote(lote).join('; '),
    Evidência: lote.buyer_evidence_json?.evidence_text || '',
  }))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(resumo), 'Resumo')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(lotes), 'Lotes')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pendencias), 'Pendências')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(compradores), 'Compradores')
  workbook.Sheets.Lotes['!cols'] = [12, 22, 45, 28, 18, 24, 24, 18, 10, 10, 16, 18, 12, 42].map((wch) => ({ wch }))
  workbook.Sheets.Pendências['!cols'] = [{ wch: 12 }, { wch: 55 }, { wch: 80 }]
  XLSX.writeFile(workbook, `relatorio-${nomeArquivo(nome)}-${agora.toISOString().slice(0, 10)}.xlsx`)
}

export async function exportarRelatorioPdf(nome: string, relatorio: Relatorio, analise: AnaliseResumo) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = autoTableModule.default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pendentes = (relatorio.lotes || []).filter((lote) => pendenciasLote(lote).length > 0)
  const agora = new Date()

  doc.setFillColor(18, 18, 18)
  doc.rect(0, 0, 297, 34, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.text(nome, 12, 14)
  doc.setFontSize(9)
  doc.setTextColor(200, 169, 110)
  doc.text('Relatório de análise de leilão • Bula Assessoria', 12, 22)
  doc.setTextColor(190, 190, 190)
  doc.text(`Gerado em ${agora.toLocaleString('pt-BR')} • Vídeo ${relatorio.video_id}`, 12, 28)

  autoTable(doc, {
    startY: 39,
    body: [[
      `Lotes\n${relatorio.total_lotes}`,
      `Vendidos\n${relatorio.vendidos}`,
      `Volume\n${brl(volumeRelatorio(relatorio))}`,
      `Cobertura\n${relatorio.cobertura_total_pct == null ? '—' : `${relatorio.cobertura_total_pct}%`}`,
      `Assertividade\n${analise?.indice_assertividade == null ? '—' : `${Math.round(analise.indice_assertividade)}%`}`,
      `Pendências\n${pendentes.length}`,
    ]],
    theme: 'grid',
    styles: { halign: 'center', valign: 'middle', fontSize: 10, cellPadding: 3 },
    bodyStyles: { fillColor: [248, 246, 240], textColor: [35, 35, 35] },
    tableLineColor: [210, 195, 160],
    tableLineWidth: 0.2,
  })

  autoTable(doc, {
    startY: (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 58,
    margin: { top: 14, left: 8, right: 8, bottom: 12 },
    head: [['Lote', 'Status', 'Animal / descrição', 'Comprador', 'Valor', 'Parc.', 'Qtd.', 'Total', 'Conf.', 'Pendências']],
    body: (relatorio.lotes || []).map((lote) => [
      lote.numero_lote || '—', statusLote(lote),
      lote.identificacao_animal || lote.nome_animal || lote.descricao_lote || '—',
      lote.comprador || 'Pendente', brl(numero(lote.valor_parcela) ?? numero(lote.valor_final)),
      lote.total_parcelas || '—', lote.quantidade_animais || '—', brl(totalLote(lote)),
      lote.confianca == null ? '—' : `${Math.round(Number(lote.confianca) * 100)}%`,
      pendenciasLote(lote).join('; '),
    ]),
    headStyles: { fillColor: [40, 38, 34], textColor: [255, 255, 255], fontSize: 7.5 },
    bodyStyles: { fontSize: 6.8, textColor: [45, 45, 45], cellPadding: 1.6 },
    alternateRowStyles: { fillColor: [249, 249, 248] },
    columnStyles: {
      0: { cellWidth: 13 }, 1: { cellWidth: 23 }, 2: { cellWidth: 54 }, 3: { cellWidth: 37 },
      4: { cellWidth: 22, halign: 'right' }, 5: { cellWidth: 11, halign: 'center' },
      6: { cellWidth: 10, halign: 'center' }, 7: { cellWidth: 24, halign: 'right' },
      8: { cellWidth: 12, halign: 'center' }, 9: { cellWidth: 54 },
    },
    didDrawPage: (data) => {
      doc.setFontSize(7)
      doc.setTextColor(120)
      doc.text(`Página ${data.pageNumber}`, 281, 204, { align: 'right' })
    },
  })
  doc.save(`relatorio-${nomeArquivo(nome)}-${agora.toISOString().slice(0, 10)}.pdf`)
}
