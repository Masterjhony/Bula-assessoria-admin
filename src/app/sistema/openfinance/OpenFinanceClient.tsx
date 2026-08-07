'use client'

/**
 * Página de conexão Open Finance: abre o widget Pluggy Connect (consentimento
 * no app do banco) e lista as conexões ativas + as últimas transações que já
 * chegaram sozinhas. Somente leitura — nenhuma operação move dinheiro.
 */

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Landmark, Loader2, Plus, RefreshCw, ShieldCheck } from 'lucide-react'

const PluggyConnect = dynamic(
    () => import('react-pluggy-connect').then(m => m.PluggyConnect),
    { ssr: false },
)

type Item = { item_id: string; connector: string | null; status: string | null; contas: Array<{ nome: string; saldo: number }> | null; last_sync: string | null }
type Tx = { id: string; conta: string | null; data: string | null; descricao: string | null; valor: number | null; processado: boolean }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dt = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—')

export default function OpenFinanceClient() {
    const [token, setToken] = useState<string | null>(null)
    const [abrindo, setAbrindo] = useState(false)
    const [itens, setItens] = useState<Item[]>([])
    const [txs, setTxs] = useState<Tx[]>([])
    const [msg, setMsg] = useState<string | null>(null)

    const carregar = useCallback(async () => {
        const res = await fetch('/api/openfinance/status')
        if (!res.ok) return
        const data = await res.json()
        setItens(data.itens ?? [])
        setTxs(data.transacoes ?? [])
    }, [])

    useEffect(() => { void carregar() }, [carregar])

    async function conectar() {
        setAbrindo(true)
        setMsg(null)
        try {
            const res = await fetch('/api/openfinance/connect-token', { method: 'POST' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'falha ao gerar token')
            setToken(data.accessToken)
        } catch (e) {
            setMsg(e instanceof Error ? e.message : 'erro')
        } finally {
            setAbrindo(false)
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
                    <Landmark className="h-6 w-6 text-[#C8A96E]" />
                    Open Finance
                </h1>
                <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
                    Conecte as contas bancárias da empresa para que as transações entrem no sistema
                    automaticamente. A autorização acontece dentro do app do próprio banco, é
                    <strong> somente leitura</strong> (nada movimenta dinheiro) e pode ser revogada a
                    qualquer momento pelo aplicativo. As transações chegam na fila de conciliação e
                    um aviso é enviado no WhatsApp.
                </p>
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={conectar}
                    disabled={abrindo}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded bg-[#C8A96E] text-black text-sm font-medium hover:opacity-90 disabled:opacity-60"
                >
                    {abrindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Conectar conta bancária
                </button>
                <button
                    onClick={() => void carregar()}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded border text-sm hover:bg-muted"
                >
                    <RefreshCw className="h-4 w-4" /> Atualizar
                </button>
                {msg && <span className="text-sm text-red-500">{msg}</span>}
            </div>

            <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Conexões ativas
                </h2>
                {itens.length === 0 ? (
                    <p className="text-sm text-muted-foreground border rounded px-4 py-6 text-center">
                        Nenhuma conta conectada ainda.
                    </p>
                ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                        {itens.map(it => (
                            <div key={it.item_id} className="border rounded p-4">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium">{it.connector ?? 'Banco'}</span>
                                    <span className="text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-600 inline-flex items-center gap-1">
                                        <ShieldCheck className="h-3 w-3" /> {it.status ?? '—'}
                                    </span>
                                </div>
                                <ul className="mt-2 space-y-1 text-sm">
                                    {(it.contas ?? []).map((c, i) => (
                                        <li key={i} className="flex justify-between">
                                            <span className="text-muted-foreground">{c.nome}</span>
                                            <span className="tabular-nums">{brl(Number(c.saldo || 0))}</span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-xs text-muted-foreground mt-2">
                                    Última sincronização: {it.last_sync ? new Date(it.last_sync).toLocaleString('pt-BR') : '—'}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Últimas transações recebidas
                </h2>
                <div className="border rounded overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="text-left px-3 py-2 font-medium">Data</th>
                                <th className="text-left px-3 py-2 font-medium">Conta</th>
                                <th className="text-left px-3 py-2 font-medium">Descrição</th>
                                <th className="text-right px-3 py-2 font-medium">Valor</th>
                                <th className="text-center px-3 py-2 font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {txs.length === 0 && (
                                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Nenhuma transação recebida ainda.</td></tr>
                            )}
                            {txs.map(t => (
                                <tr key={t.id} className="border-t">
                                    <td className="px-3 py-2 whitespace-nowrap">{dt(t.data)}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{t.conta ?? '—'}</td>
                                    <td className="px-3 py-2">{t.descricao ?? '—'}</td>
                                    <td className={`px-3 py-2 text-right tabular-nums ${Number(t.valor) < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                        {brl(Number(t.valor || 0))}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        <span className={`text-xs px-2 py-0.5 rounded ${t.processado ? 'bg-green-500/10 text-green-600' : 'bg-amber-500/10 text-amber-600'}`}>
                                            {t.processado ? 'conciliada' : 'pendente'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {token && (
                <PluggyConnect
                    connectToken={token}
                    includeSandbox={process.env.NODE_ENV !== 'production'}
                    onSuccess={() => { setToken(null); setTimeout(() => void carregar(), 4000) }}
                    onClose={() => { setToken(null); void carregar() }}
                />
            )}
        </div>
    )
}
