'use client'

/**
 * Ferramentas → Lances do Pregão — validação das vendas capturadas
 * automaticamente do grupo "Lances Bula Assessoria" (WhatsApp) e importação
 * direta pro Fechamento de Leilões.
 *
 * Edição inline por linha (o parser erra pouco, mas o grupo é informal:
 * lote com typo, valor ausente…). "Importar pro fechamento" reconstrói o
 * fechamento automático (origem='lances-auto') — nunca toca fechamento manual.
 */

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Gavel, Loader2, Trash2, Save, Plus, Link2, RefreshCw, CheckCircle2, AlertTriangle, MessageSquareText } from 'lucide-react'
import {
    type LancesPregaoData, type VendaPregao, type VendaPatch,
    salvarVenda, excluirVenda, adicionarVenda, vincularLeilao, importarFechamento,
} from '../actions/lances'

const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBR = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
}
const PARCELAS = 30

type RowDraft = Record<string, string>

function draftFrom(v: VendaPregao): RowDraft {
    return {
        lote: v.lote ?? '',
        valor: v.valor != null ? String(v.valor) : '',
        animais: v.animais != null ? String(v.animais) : '',
        sexo: v.sexo ?? '',
        assessor: v.assessor ?? '',
        comprador: v.comprador ?? '',
        fazenda: v.fazenda ?? '',
        cidade: v.cidade ?? '',
        uf: v.uf ?? '',
    }
}

function patchFrom(d: RowDraft): VendaPatch {
    const num = (s: string) => {
        const n = parseFloat(s.replace(/\./g, '').replace(',', '.'))
        return Number.isFinite(n) ? n : null
    }
    return {
        lote: d.lote.trim() || null,
        valor: d.valor.trim() ? num(d.valor) : null,
        animais: d.animais.trim() ? Math.round(num(d.animais) ?? 0) || null : null,
        sexo: d.sexo.trim().toUpperCase() || null,
        assessor: d.assessor.trim() || null,
        comprador: d.comprador.trim() || null,
        fazenda: d.fazenda.trim() || null,
        cidade: d.cidade.trim() || null,
        uf: d.uf.trim().toUpperCase() || null,
    }
}

export function LancesClient({ initial }: { initial: LancesPregaoData }) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [busyKey, setBusyKey] = useState<string | null>(null)
    const [drafts, setDrafts] = useState<Record<string, RowDraft>>({})
    const [msg, setMsg] = useState<{ kind: 'ok' | 'erro'; text: string } | null>(null)
    const [novo, setNovo] = useState<Record<string, { lote: string; valor: string }>>({})

    const grupos = useMemo(() => {
        const byDate = new Map<string, VendaPregao[]>()
        for (const v of initial.vendas) {
            const k = v.leilao_data ?? 'sem-data'
            byDate.set(k, [...(byDate.get(k) ?? []), v])
        }
        return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    }, [initial.vendas])

    const run = (key: string, fn: () => Promise<{ ok: boolean; error?: string; skipped?: string }>, okText: string) => {
        setBusyKey(key)
        startTransition(async () => {
            const res = await fn()
            setBusyKey(null)
            if (res.ok) {
                setMsg({ kind: 'ok', text: okText })
                router.refresh()
            } else {
                setMsg({
                    kind: 'erro',
                    text: res.skipped === 'fechamento_manual_existente'
                        ? 'Já existe fechamento MANUAL nessa data — não sobrescrevo. Edite direto no Fechamento de Leilões.'
                        : res.skipped === 'sem_vendas_com_valor'
                            ? 'Nenhuma venda com valor nesse leilão — informe os valores antes de importar.'
                            : res.error || res.skipped || 'Falhou',
                })
            }
        })
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Gavel className="h-6 w-6 text-[#C8A96E]" />
                        Lances do Pregão
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                        Vendas capturadas automaticamente do grupo <strong>Lances Bula Assessoria</strong> (WhatsApp).
                        Revise/corrija o que precisar e importe pro Fechamento de Leilões — a importação recalcula
                        VGV (parcela × {PARCELAS} por lote), comissão de pisteiro (2%) e os agregados. Fechamentos
                        manuais nunca são sobrescritos.
                    </p>
                </div>
            </div>

            {msg && (
                <div
                    className={`flex items-center gap-2 text-sm px-4 py-2.5 border rounded ${
                        msg.kind === 'ok'
                            ? 'border-green-500/40 bg-green-500/10 text-green-500'
                            : 'border-red-500/40 bg-red-500/10 text-red-500'
                    }`}
                >
                    {msg.kind === 'ok' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                    <span>{msg.text}</span>
                    <button className="ml-auto text-xs opacity-70 hover:opacity-100" onClick={() => setMsg(null)}>fechar</button>
                </div>
            )}

            {grupos.length === 0 && (
                <div className="border border-dashed rounded p-10 text-center text-sm text-muted-foreground">
                    Nenhuma venda capturada ainda. Assim que o pessoal mandar “Levamos lt X…” no grupo, aparece aqui.
                </div>
            )}

            {grupos.map(([data, vendas]) => {
                const leilao = initial.leiloes.find((l) => vendas.some((v) => v.cronograma_id === l.id))
                    ?? initial.leiloes.find((l) => l.data === data)
                const vinculado = vendas.some((v) => v.cronograma_id)
                const candidatos = initial.leiloes.filter((l) => l.data === data)
                const fechManual = initial.fechamentos.find((f) => f.data === data && f.origem !== 'lances-auto')
                const fechAuto = initial.fechamentos.find((f) => f.data === data && f.origem === 'lances-auto')
                const comValor = vendas.filter((v) => v.valor != null)
                const vgv = comValor.reduce((s, v) => s + (v.valor as number) * PARCELAS, 0)
                const nv = novo[data] ?? { lote: '', valor: '' }

                return (
                    <section key={data} className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 bg-black/5 dark:bg-white/5">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold tracking-wide">{data === 'sem-data' ? 'Sem data' : dataBR(data)}</span>
                                {vinculado && leilao ? (
                                    <span className="text-sm text-[#C8A96E] font-semibold">{leilao.nome}</span>
                                ) : candidatos.length ? (
                                    <span className="flex items-center gap-1.5">
                                        <select
                                            className="text-xs bg-transparent border rounded px-2 py-1"
                                            style={{ borderColor: 'var(--border)' }}
                                            id={`vinc-${data}`}
                                            defaultValue={candidatos[0]?.id}
                                        >
                                            {candidatos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                        </select>
                                        <button
                                            className="flex items-center gap-1 text-xs px-2 py-1 border rounded hover:border-[#C8A96E] hover:text-[#C8A96E] transition-colors"
                                            style={{ borderColor: 'var(--border)' }}
                                            disabled={pending}
                                            onClick={() => {
                                                const sel = document.getElementById(`vinc-${data}`) as HTMLSelectElement | null
                                                if (sel?.value) run(`vinc-${data}`, () => vincularLeilao(data, sel.value), 'Leilão vinculado.')
                                            }}
                                        >
                                            <Link2 size={12} /> Vincular leilão
                                        </button>
                                    </span>
                                ) : (
                                    <span className="text-xs text-amber-500">sem leilão no cronograma nessa data</span>
                                )}
                            </div>

                            <div className="flex items-center gap-3 ml-auto text-xs">
                                <span className="text-muted-foreground">
                                    {comValor.length}/{vendas.length} lote(s) com valor · VGV <strong className="text-foreground">R$ {brl(vgv)}</strong>
                                </span>
                                {fechManual ? (
                                    <span className="px-2 py-1 rounded border border-blue-500/40 bg-blue-500/10 text-blue-400">
                                        fechamento manual — protegido
                                    </span>
                                ) : fechAuto ? (
                                    <span className="px-2 py-1 rounded border border-green-500/40 bg-green-500/10 text-green-500">
                                        importado · {fechAuto.lotes_vendidos} lotes · R$ {brl(Number(fechAuto.vgv_total ?? 0))}
                                    </span>
                                ) : (
                                    <span className="px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-amber-500">
                                        não importado
                                    </span>
                                )}
                                {!fechManual && vinculado && leilao && (
                                    <button
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[#A68B4B] text-[#141414] hover:bg-[#C8A96E] transition-colors disabled:opacity-50"
                                        disabled={pending || !comValor.length}
                                        onClick={() => run(`imp-${data}`, () => importarFechamento(leilao.id), `Fechamento de ${leilao.nome} atualizado (${comValor.length} lotes).`)}
                                    >
                                        {busyKey === `imp-${data}` ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                                        {fechAuto ? 'Reimportar pro fechamento' : 'Importar pro fechamento'}
                                    </button>
                                )}
                            </div>
                        </header>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b" style={{ borderColor: 'var(--border)' }}>
                                        <th className="text-left px-3 py-2 font-medium">Lote</th>
                                        <th className="text-left px-3 py-2 font-medium">Parcela (R$)</th>
                                        <th className="text-left px-3 py-2 font-medium">Qtd</th>
                                        <th className="text-left px-3 py-2 font-medium">Sexo</th>
                                        <th className="text-left px-3 py-2 font-medium">Assessor</th>
                                        <th className="text-left px-3 py-2 font-medium">Comprador</th>
                                        <th className="text-left px-3 py-2 font-medium">Fazenda</th>
                                        <th className="text-left px-3 py-2 font-medium">Cidade</th>
                                        <th className="text-left px-3 py-2 font-medium">UF</th>
                                        <th className="text-left px-3 py-2 font-medium">Status</th>
                                        <th className="px-3 py-2" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {vendas.map((v) => {
                                        const d = drafts[v.id] ?? draftFrom(v)
                                        const dirty = JSON.stringify(d) !== JSON.stringify(draftFrom(v))
                                        const set = (k: string, val: string) => setDrafts((p) => ({ ...p, [v.id]: { ...d, [k]: val } }))
                                        const cell = 'bg-transparent border rounded px-2 py-1 text-sm w-full focus:border-[#C8A96E] outline-none'
                                        return (
                                            <tr key={v.id} className="border-b last:border-b-0 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]" style={{ borderColor: 'var(--border)' }}>
                                                <td className="px-3 py-1.5 w-20"><input className={cell} style={{ borderColor: 'var(--border)' }} value={d.lote} onChange={(e) => set('lote', e.target.value)} /></td>
                                                <td className="px-3 py-1.5 w-28"><input className={cell} style={{ borderColor: 'var(--border)' }} value={d.valor} placeholder="—" onChange={(e) => set('valor', e.target.value)} /></td>
                                                <td className="px-3 py-1.5 w-16"><input className={cell} style={{ borderColor: 'var(--border)' }} value={d.animais} placeholder="1" onChange={(e) => set('animais', e.target.value)} /></td>
                                                <td className="px-3 py-1.5 w-16"><input className={cell} style={{ borderColor: 'var(--border)' }} value={d.sexo} placeholder="F/M" maxLength={1} onChange={(e) => set('sexo', e.target.value)} /></td>
                                                <td className="px-3 py-1.5 min-w-[130px]"><input className={cell} style={{ borderColor: 'var(--border)' }} value={d.assessor} placeholder="—" onChange={(e) => set('assessor', e.target.value)} /></td>
                                                <td className="px-3 py-1.5 min-w-[180px]"><input className={cell} style={{ borderColor: 'var(--border)' }} value={d.comprador} placeholder="—" onChange={(e) => set('comprador', e.target.value)} /></td>
                                                <td className="px-3 py-1.5 min-w-[140px]"><input className={cell} style={{ borderColor: 'var(--border)' }} value={d.fazenda} placeholder="—" onChange={(e) => set('fazenda', e.target.value)} /></td>
                                                <td className="px-3 py-1.5 min-w-[110px]"><input className={cell} style={{ borderColor: 'var(--border)' }} value={d.cidade} placeholder="—" onChange={(e) => set('cidade', e.target.value)} /></td>
                                                <td className="px-3 py-1.5 w-14"><input className={cell} style={{ borderColor: 'var(--border)' }} value={d.uf} maxLength={2} placeholder="—" onChange={(e) => set('uf', e.target.value)} /></td>
                                                <td className="px-3 py-1.5">
                                                    <span className={`text-[11px] px-1.5 py-0.5 rounded border whitespace-nowrap ${
                                                        v.status === 'auto'
                                                            ? 'border-green-500/40 text-green-500'
                                                            : 'border-amber-500/40 text-amber-500'
                                                    }`}>
                                                        {v.status === 'auto' ? 'ok' : 'revisar'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-1.5">
                                                    <div className="flex items-center gap-1.5 justify-end">
                                                        {v.raw_text && (
                                                            <span title={v.raw_text} className="text-muted-foreground/60 cursor-help">
                                                                <MessageSquareText size={14} />
                                                            </span>
                                                        )}
                                                        {dirty && (
                                                            <button
                                                                className="p-1.5 rounded text-[#C8A96E] hover:bg-[#C8A96E]/10 transition-colors"
                                                                title="Salvar alterações"
                                                                disabled={pending}
                                                                onClick={() => run(`save-${v.id}`, async () => {
                                                                    const res = await salvarVenda(v.id, patchFrom(d))
                                                                    if (res.ok) setDrafts((p) => { const n = { ...p }; delete n[v.id]; return n })
                                                                    return res
                                                                }, `Lote ${d.lote} salvo.`)}
                                                            >
                                                                {busyKey === `save-${v.id}` ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                                            </button>
                                                        )}
                                                        <button
                                                            className="p-1.5 rounded text-red-500/70 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                                            title="Excluir venda"
                                                            disabled={pending}
                                                            onClick={() => {
                                                                if (confirm(`Excluir o lote ${v.lote} de ${data === 'sem-data' ? '?' : dataBR(data)}?`))
                                                                    run(`del-${v.id}`, () => excluirVenda(v.id), `Lote ${v.lote} excluído.`)
                                                            }}
                                                        >
                                                            {busyKey === `del-${v.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {data !== 'sem-data' && (
                                        <tr>
                                            <td className="px-3 py-2 w-20">
                                                <input
                                                    className="bg-transparent border border-dashed rounded px-2 py-1 text-sm w-full focus:border-[#C8A96E] outline-none"
                                                    style={{ borderColor: 'var(--border)' }}
                                                    placeholder="+ lote"
                                                    value={nv.lote}
                                                    onChange={(e) => setNovo((p) => ({ ...p, [data]: { ...nv, lote: e.target.value } }))}
                                                />
                                            </td>
                                            <td className="px-3 py-2 w-28">
                                                <input
                                                    className="bg-transparent border border-dashed rounded px-2 py-1 text-sm w-full focus:border-[#C8A96E] outline-none"
                                                    style={{ borderColor: 'var(--border)' }}
                                                    placeholder="parcela"
                                                    value={nv.valor}
                                                    onChange={(e) => setNovo((p) => ({ ...p, [data]: { ...nv, valor: e.target.value } }))}
                                                />
                                            </td>
                                            <td colSpan={9} className="px-3 py-2">
                                                <button
                                                    className="flex items-center gap-1 text-xs px-2 py-1 border border-dashed rounded text-muted-foreground hover:border-[#C8A96E] hover:text-[#C8A96E] transition-colors disabled:opacity-40"
                                                    style={{ borderColor: 'var(--border)' }}
                                                    disabled={pending || !nv.lote.trim()}
                                                    onClick={() => run(`add-${data}`, async () => {
                                                        const valor = nv.valor.trim() ? parseFloat(nv.valor.replace(/\./g, '').replace(',', '.')) : null
                                                        const res = await adicionarVenda({ leilaoData: data, lote: nv.lote, valor: Number.isFinite(valor as number) ? valor : null })
                                                        if (res.ok) setNovo((p) => ({ ...p, [data]: { lote: '', valor: '' } }))
                                                        return res
                                                    }, 'Lote adicionado.')}
                                                >
                                                    <Plus size={12} /> Adicionar lote manualmente
                                                </button>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )
            })}
        </div>
    )
}
