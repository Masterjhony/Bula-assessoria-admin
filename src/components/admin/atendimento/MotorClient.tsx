'use client'

/**
 * Painel do MOTOR DE ATENDIMENTO.
 *
 * A tela tem uma tese: automação de conversa só fica ligada se o dono conseguir
 * ver, ANTES do envio, exatamente quem vai ser chamado e por quê. Por isso a
 * fila de hoje vem primeiro, com o motivo em texto de gente ao lado de cada
 * linha, e o botão de desligar fica no topo — não escondido em configurações.
 */

import { useState, useTransition } from 'react'
import {
    Play, Pause, RefreshCw, Send, X, MessageSquare, TrendingUp, Clock, AlertTriangle,
} from 'lucide-react'
import {
    setMotorEnabled, setMotorDryRun, replanejarHoje, dispararLoteAgora, cancelarToque,
    type MotorPainel, type ToqueLinha,
} from '@/app/sistema/actions/atendimento-motor'

const STATUS_TOM: Record<string, string> = {
    enviado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    planejado: 'bg-gray-50 text-gray-600 border-gray-200',
    held: 'bg-amber-50 text-amber-700 border-amber-200',
    blocked: 'bg-red-50 text-red-700 border-red-200',
    falhou: 'bg-red-50 text-red-700 border-red-200',
    cancelado: 'bg-gray-50 text-gray-400 border-gray-200',
}

/** O gateway devolve códigos; o time lê português. */
const MOTIVO_TECNICO: Record<string, string> = {
    outside_business_hours: 'fora do horário comercial',
    daily_cap_reached: 'teto diário do canal atingido',
    duplicate: 'já falamos com este número há pouco',
    optout: 'pediu pra não receber',
    outside_24h_needs_template: 'janela fechada e sem template',
    cloud_not_configured: 'API oficial não configurada',
    dry_run: 'modo de teste (não envia)',
    invalid_phone: 'telefone inválido',
}

function Badge({ status }: { status: string }) {
    return (
        <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_TOM[status] ?? STATUS_TOM.planejado}`}>
            {status}
        </span>
    )
}

function Linha({ t, cancelavel, onCancelar }: { t: ToqueLinha; cancelavel: boolean; onCancelar: (id: string) => void }) {
    const [aberto, setAberto] = useState(false)
    return (
        <div className="border-b border-gray-100 py-2.5 last:border-0">
            <div className="flex items-start gap-3">
                <span className="mt-0.5 w-8 shrink-0 text-right text-[11px] font-semibold text-gray-400">{t.prioridade}</span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{t.nome ?? t.telefone}</span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{t.playLabel}</span>
                        <Badge status={t.status} />
                        {t.respondeuAt && (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">respondeu</span>
                        )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-600">{t.motivo}</p>
                    {t.reason && (
                        <p className="mt-0.5 text-[11px] text-amber-700">{MOTIVO_TECNICO[t.reason] ?? t.reason}</p>
                    )}
                    <button
                        onClick={() => setAberto(v => !v)}
                        className="mt-1 text-[11px] text-gray-400 underline-offset-2 hover:text-gray-700 hover:underline"
                    >
                        {aberto ? 'ocultar mensagem' : `ver mensagem${t.template ? ` (${t.template})` : ' (texto livre)'}`}
                    </button>
                    {aberto && (
                        <p className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-700">{t.corpo}</p>
                    )}
                </div>
                {cancelavel && (
                    <button
                        onClick={() => onCancelar(t.id)}
                        title="Tirar da fila"
                        className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-600"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
        </div>
    )
}

export function MotorClient({ dados }: { dados: MotorPainel }) {
    const [pendente, startTransition] = useTransition()
    const [aviso, setAviso] = useState<string | null>(null)

    const { config, planejados, enviadosHoje, metricas } = dados
    const enviadosCount = enviadosHoje.filter(t => t.status === 'enviado').length
    const taxaGeral = dados.totalEnviado30d ? dados.totalRespostas30d / dados.totalEnviado30d : 0

    const acao = (fn: () => Promise<unknown>, msg?: string) => {
        setAviso(null)
        startTransition(async () => {
            try {
                const r = await fn()
                setAviso(msg ?? (typeof r === 'object' && r ? JSON.stringify(r) : 'Feito.'))
            } catch (e) {
                setAviso(`Erro: ${e instanceof Error ? e.message : 'falhou'}`)
            }
        })
    }

    return (
        <div className="mx-auto max-w-6xl px-4 py-6">
            {/* ── Cabeçalho + controle ─────────────────────────────────────── */}
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl font-semibold text-gray-900">Atendimento automático</h1>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">
                        Todo dia o sistema lê a base inteira, decide quem vale chamar e por quê, e conduz
                        pela API oficial até o cadastro. Esta tela mostra a fila antes de ela virar mensagem.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        disabled={pendente}
                        onClick={() => acao(() => setMotorEnabled(!config.enabled), config.enabled ? 'Motor pausado.' : 'Motor ligado.')}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                            config.enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                    >
                        {config.enabled ? <><Pause className="h-4 w-4" /> Pausar</> : <><Play className="h-4 w-4" /> Ligar</>}
                    </button>
                    <button
                        disabled={pendente}
                        onClick={() => acao(replanejarHoje)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${pendente ? 'animate-spin' : ''}`} /> Replanejar
                    </button>
                    <button
                        disabled={pendente || planejados.length === 0}
                        onClick={() => acao(() => dispararLoteAgora(10))}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        <Send className="h-4 w-4" /> Disparar 10 agora
                    </button>
                </div>
            </div>

            {dados.centralPausada && (
                <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-100 p-3 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        <strong>Central WhatsApp PAUSADA</strong> — nada sai por aqui, mesmo com o
                        motor ligado, e os botões abaixo não vão enviar. A fila do dia continua
                        de pé. Para retomar: Central WhatsApp › Conexão › Retomar fluxo.
                    </span>
                </div>
            )}
            {!config.enabled && (
                <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Motor pausado — nada sai enquanto estiver assim.</span>
                </div>
            )}
            {config.dry_run && (
                <div className="mb-4 flex items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                    <span>Modo de teste: o plano é montado e registrado, mas nenhuma mensagem sai.</span>
                    <button onClick={() => acao(() => setMotorDryRun(false), 'Modo de teste desligado.')} className="shrink-0 font-medium underline">
                        desligar teste
                    </button>
                </div>
            )}
            {aviso && <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{aviso}</div>}

            {/* ── Números do dia ───────────────────────────────────────────── */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gray-400"><Clock className="h-3 w-3" /> Na fila hoje</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">{planejados.length}</div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gray-400"><Send className="h-3 w-3" /> Já enviados</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">{enviadosCount}<span className="text-sm font-normal text-gray-400"> / {dados.capHoje}</span></div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gray-400"><MessageSquare className="h-3 w-3" /> Respostas 30d</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">{dados.totalRespostas30d}</div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gray-400"><TrendingUp className="h-3 w-3" /> Taxa de resposta</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">{(taxaGeral * 100).toFixed(0)}%</div>
                </div>
            </div>

            {/* ── Desempenho por play ──────────────────────────────────────── */}
            {metricas.length > 0 && (
                <div className="mb-6 rounded-lg border border-gray-200">
                    <h2 className="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-900">
                        O que funciona <span className="font-normal text-gray-400">· últimos 30 dias</span>
                    </h2>
                    <div className="divide-y divide-gray-100">
                        {metricas.map(m => (
                            <div key={m.play} className="flex items-center gap-3 px-4 py-2">
                                <span className="flex-1 text-sm text-gray-700">{m.playLabel}</span>
                                <span className="text-xs text-gray-400">{m.enviados} enviados</span>
                                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
                                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, m.taxa * 100)}%` }} />
                                </div>
                                <span className="w-12 text-right text-sm font-medium text-gray-900">{(m.taxa * 100).toFixed(0)}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Fila ─────────────────────────────────────────────────────── */}
            <div className="mb-6 rounded-lg border border-gray-200">
                <h2 className="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-900">
                    Fila de hoje <span className="font-normal text-gray-400">· {dados.dia} · teto {dados.capHoje}</span>
                </h2>
                <div className="px-4">
                    {planejados.length === 0
                        ? <p className="py-6 text-center text-sm text-gray-400">Fila vazia. Use &quot;Replanejar&quot; pra montar o dia.</p>
                        : planejados.map(t => (
                            <Linha key={t.id} t={t} cancelavel onCancelar={id => acao(() => cancelarToque(id), 'Toque cancelado.')} />
                        ))}
                </div>
            </div>

            {enviadosHoje.length > 0 && (
                <div className="rounded-lg border border-gray-200">
                    <h2 className="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-900">
                        Já processados hoje <span className="font-normal text-gray-400">· {enviadosHoje.length}</span>
                    </h2>
                    <div className="px-4">
                        {enviadosHoje.map(t => (
                            <Linha key={t.id} t={t} cancelavel={false} onCancelar={() => {}} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
