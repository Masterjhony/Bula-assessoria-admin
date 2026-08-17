'use client';

/**
 * PAINEL DE GROWTH — um funil por campanha.
 *
 * O painel anterior desenhava UM funil só, montado sobre o crm_leads. As
 * campanhas de landing (PERPETUO TOURO, SÃO GERALDO, PERPETUO FEMEAS) não
 * passam pelo CRM: gravam na planilha. Resultado: o funil não descrevia
 * campanha nenhuma e as taxas não podiam ser cobradas de ninguém.
 *
 * Aqui cada campanha é um funil fechado, com a etapa comparada à META DO TIME
 * (o quadro "META FUNIL DE VENDAS MENSAL"). Três regras de honestidade que o
 * componente respeita em todo lugar:
 *
 *   1. Etapa que não existe naquela campanha aparece como "não se aplica" e não
 *      entra em conta nenhuma. Campanha de formulário instantâneo não tem
 *      ACESSOS: o formulário abre dentro do Meta, não há página para visitar.
 *   2. Número medido e número declarado por uma pessoa nunca somam no mesmo
 *      lugar. O declarado aparece marcado, embaixo.
 *   3. A meta é MENSAL e as campanhas têm durações diferentes — então a
 *      comparação é sempre TAXA contra TAXA, nunca volume contra volume.
 */

import { useMemo, useState } from 'react';
import {
    Eye, MousePointerClick, MonitorSmartphone, UserPlus, Crown, FileCheck2,
    BadgeCheck, ShoppingCart, AlertTriangle, Info,
} from 'lucide-react';
import {
    FUNIL_CAMPANHAS, funisComLeads, funisSemLead, versusMeta, corDaMeta, nomeDoMes,
    type FunilCampanha, type FunilCampanhasDados,
} from '@/lib/funil-campanhas';

/**
 * Os dados chegam do servidor, que relê a planilha a cada carregamento. O
 * import estático fica como fallback: se a página for renderizada sem passar
 * nada (ou a leitura ao vivo falhar), o painel mostra a última apuração em vez
 * de quebrar — e avisa na tela que está congelado.
 */
export interface DadosDoFunil extends FunilCampanhasDados {
    frescor?: 'ao-vivo' | 'congelado';
    lidoEm?: string | null;
    motivoCongelado?: string;
}

const card = 'rounded-2xl border border-gray-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414]';
const OURO = '#C9A84C';

const int = (n: number) => n.toLocaleString('pt-BR');
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const brl0 = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const taxaTxt = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);

/* ── uma linha do funil ──────────────────────────────────────────────────── */

interface Etapa {
    chave: string;
    rotulo: string;
    icone: typeof Eye;
    valor: number | null;
    /** taxa desta etapa sobre a anterior */
    taxa: number | null;
    meta: number | null;
    metaRotulo: string;
    /** por que a etapa não se aplica / o que há de ressalva */
    nota?: string;
}

function montaEtapas(f: FunilCampanha, metas: typeof FUNIL_CAMPANHAS.metas): Etapa[] {
    const temAcesso = f.tipo === 'landing' && f.acessosConfiaveis;
    const notaAcesso = f.tipo === 'formulario'
        ? 'Formulário instantâneo: o lead preenche dentro do Meta, não existe visita a página.'
        : f.tipo === 'mista'
            ? 'Campanha mista (parte formulário, parte página) — a taxa de acesso não descreve o conjunto.'
            : !f.acessosConfiaveis
                ? `O pixel registrou ${int(f.midia.acessos ?? 0)} visitas para ${int(f.midia.cliquesSaida ?? 0)} cliques que saíram do Meta. O número está subnotificado e não serve de etapa.`
                : undefined;

    return [
        {
            chave: 'impressoes', rotulo: 'Impressões', icone: Eye,
            valor: f.midia.impressoes, taxa: null, meta: null, metaRotulo: '',
        },
        {
            chave: 'cliques', rotulo: 'Cliques', icone: MousePointerClick,
            valor: f.midia.cliques, taxa: f.taxas.ctr, meta: metas.ctr, metaRotulo: 'dos que viram',
        },
        {
            chave: 'acessos', rotulo: 'Acessos à página', icone: MonitorSmartphone,
            valor: temAcesso ? f.midia.acessos : null,
            taxa: temAcesso ? f.taxas.acessoPorClique : null,
            meta: metas.acessoPorClique, metaRotulo: 'dos cliques', nota: notaAcesso,
        },
        {
            chave: 'leads', rotulo: 'Leads gerados', icone: UserPlus,
            valor: f.etapas.leads,
            taxa: temAcesso ? f.taxas.leadPorAcesso : f.taxas.leadPorClique,
            meta: temAcesso ? metas.leadPorAcesso : null,
            metaRotulo: temAcesso ? 'dos acessos' : 'dos cliques',
            nota: temAcesso ? undefined : 'Sem etapa de acesso, a taxa é medida sobre o clique — e por isso não se compara com a meta, que é sobre acesso.',
        },
        {
            chave: 'mql', rotulo: 'Leads qualificados', icone: Crown,
            valor: f.etapas.mql, taxa: f.taxas.mqlPorLead, meta: metas.mqlPorLead, metaRotulo: 'dos leads',
        },
        {
            chave: 'submetidos', rotulo: 'Cadastros submetidos', icone: FileCheck2,
            valor: f.etapas.cadastrosSubmetidos, taxa: f.taxas.cadastroPorMql,
            meta: metas.cadastroPorMql, metaRotulo: 'dos qualificados',
        },
        {
            chave: 'aprovados', rotulo: 'Cadastros aprovados', icone: BadgeCheck,
            valor: f.etapas.cadastrosAprovados, taxa: f.taxas.aprovadoPorCadastro,
            meta: metas.aprovadoPorCadastro, metaRotulo: 'dos submetidos',
        },
        {
            chave: 'clientes', rotulo: 'Clientes que compraram', icone: ShoppingCart,
            valor: f.etapas.clientes, taxa: f.taxas.clientePorAprovado,
            meta: metas.clientePorAprovado, metaRotulo: 'dos aprovados',
        },
    ];
}

function LinhaEtapa({ e, larguraMax }: { e: Etapa; larguraMax: number }) {
    const naoSeAplica = e.valor == null;
    const pctMeta = versusMeta(e.taxa, e.meta ?? 0);
    const cor = corDaMeta(pctMeta);
    // Escala por potência, não linear: de 218.948 impressões a 1 cliente há
    // cinco ordens de grandeza, e no linear todas as etapas de baixo viram um
    // traço invisível. A barra serve para ler a queda, não para medir área.
    const largura = naoSeAplica || !larguraMax ? 0 : Math.max(3, Math.pow((e.valor ?? 0) / larguraMax, 0.3) * 100);
    const Icone = e.icone;

    return (
        <div className={`px-4 py-3 ${naoSeAplica ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-3">
                <Icone size={15} className="shrink-0 text-gray-400" />
                <span className="w-44 shrink-0 text-[13px] font-semibold text-gray-700 dark:text-gray-200">{e.rotulo}</span>
                <span className="w-24 shrink-0 text-right text-[15px] font-bold tabular-nums text-gray-900 dark:text-white">
                    {naoSeAplica ? <span className="text-[11px] font-medium text-gray-400">não se aplica</span> : int(e.valor ?? 0)}
                </span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-[#1E1E1E] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${largura}%`, background: OURO }} />
                </div>
                <span className="w-20 shrink-0 text-right text-[13px] font-bold tabular-nums" style={{ color: e.taxa == null ? undefined : cor }}>
                    {taxaTxt(e.taxa)}
                </span>
                <span className="w-32 shrink-0 text-right text-[11px] text-gray-400 tabular-nums">
                    {e.meta != null ? `meta ${taxaTxt(e.meta)} ${e.metaRotulo}` : e.metaRotulo || '—'}
                </span>
            </div>
            {e.nota && (
                <p className="mt-1.5 ml-[74px] text-[11px] leading-snug text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
                    <Info size={11} className="mt-[2px] shrink-0" />{e.nota}
                </p>
            )}
        </div>
    );
}

/* ── painel ──────────────────────────────────────────────────────────────── */

export function FunilPorCampanha({ dados }: { dados?: DadosDoFunil }) {
    const d: DadosDoFunil = dados ?? FUNIL_CAMPANHAS;
    const comLeads = useMemo(() => funisComLeads(d), [d]);
    const semLead = useMemo(() => funisSemLead(d), [d]);
    const [sel, setSel] = useState(comLeads[0]?.id ?? '');
    const f = comLeads.find(x => x.id === sel) ?? comLeads[0];

    const etapas = useMemo(() => (f ? montaEtapas(f, d.metas) : []), [f, d.metas]);
    const larguraMax = Math.max(1, ...etapas.map(e => e.valor ?? 0));

    if (!f) return null;

    const declaradoValor = f.declarado.reduce((a, x) => a + x.valor, 0);
    const roas = f.midia.investido ? f.resultado.faturamento / f.midia.investido : 0;

    return (
        <div className="space-y-4">
            {/* cabeçalho */}
            <div className={`${card} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-[15px] font-bold text-gray-900 dark:text-white">Funil por campanha</h2>
                        <p className="text-[12px] text-gray-500 mt-1 max-w-3xl leading-relaxed">
                            Cada campanha é um funil fechado, apurado no Meta Ads, na planilha de leads, nos grupos de
                            cadastro das leiloeiras e no ERP. Nada é rateado: lead sem prova de campanha não entra em
                            campanha nenhuma — fica no rodapé desta página.
                        </p>
                    </div>
                    <div className="text-right shrink-0">
                        {d.frescor === 'ao-vivo' ? (
                            <>
                                <p className="text-[10px] uppercase tracking-wider text-emerald-500 flex items-center gap-1 justify-end">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                    Leads ao vivo
                                </p>
                                <p className="text-[13px] font-bold text-gray-900 dark:text-white tabular-nums">
                                    {d.lidoEm ? new Date(d.lidoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                </p>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                    lido da planilha agora · mídia e vendas de {d.geradoEm.split('-').reverse().join('/')}
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400">Apurado em</p>
                                <p className="text-[13px] font-bold text-gray-900 dark:text-white tabular-nums">
                                    {d.geradoEm.split('-').reverse().join('/')}
                                </p>
                                <p className="text-[10px] text-amber-500 mt-0.5">
                                    {d.motivoCongelado ? 'planilha não respondeu — mostrando o congelado' : `mídia lida no dia ${d.metaExtraidoEm.slice(8)}`}
                                </p>
                            </>
                        )}
                    </div>
                </div>

                {/* consolidado */}
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 mt-4">
                    {[
                        { l: 'Investido', v: brl0(d.totais.investido) },
                        { l: 'Leads', v: int(d.totais.leads) },
                        { l: 'Qualificados', v: int(d.totais.mql) },
                        { l: 'Cadastros', v: int(d.totais.cadastrosSubmetidos) },
                        { l: 'Aprovados', v: int(d.totais.cadastrosAprovados) },
                        { l: 'Clientes', v: int(d.totais.clientes) },
                        { l: 'Faturamento', v: brl0(d.totais.faturamento) },
                    ].map(k => (
                        <div key={k.l} className="rounded-xl border border-gray-100 dark:border-[#2A2A2A] px-3 py-2.5">
                            <p className="text-[15px] font-bold text-gray-900 dark:text-white tabular-nums leading-none">{k.v}</p>
                            <p className="text-[10px] text-gray-500 mt-1.5 uppercase tracking-wide">{k.l}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* seletor */}
            <div className="flex flex-wrap gap-2">
                {comLeads.map(c => {
                    const ativo = c.id === sel;
                    return (
                        <button
                            key={c.id}
                            onClick={() => setSel(c.id)}
                            className={`px-3 py-2 rounded-xl border text-left transition-colors ${ativo
                                ? 'border-transparent text-white'
                                : 'border-gray-200 dark:border-[#2A2A2A] hover:border-gray-300 dark:hover:border-[#3A3A3A]'}`}
                            style={ativo ? { background: '#111' } : undefined}
                        >
                            <span className="block text-[12px] font-semibold leading-tight">{c.nome}</span>
                            <span className={`block text-[10px] mt-0.5 tabular-nums ${ativo ? 'text-gray-300' : 'text-gray-400'}`}>
                                {brl0(c.midia.investido)} · {int(c.etapas.leads)} leads
                                {c.status === 'ACTIVE' && <span className="ml-1.5 text-emerald-400">● no ar</span>}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* funil da campanha selecionada */}
            <div className={card}>
                <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-[#2A2A2A]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h3 className="text-[14px] font-bold text-gray-900 dark:text-white">{f.nome}</h3>
                            <p className="text-[11px] text-gray-500 mt-1">
                                {f.tipo === 'landing' ? 'Manda para página nossa' : f.tipo === 'formulario' ? 'Formulário dentro do Meta' : 'Mista — formulário e página'}
                                {' · '}no ar desde {f.inicio.split('-').reverse().join('/')}
                                {' · '}{Object.keys(f.leadsPorMes).sort().map(nomeDoMes).join(' e ')}
                                {f.status === 'ACTIVE' ? ' · ativa' : ' · pausada'}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            {[
                                { l: 'Investido', v: brl(f.midia.investido) },
                                { l: 'Por lead', v: f.custos.porLead ? brl(f.custos.porLead) : '—' },
                                { l: 'Por qualificado', v: f.custos.porMql ? brl(f.custos.porMql) : '—' },
                                { l: 'Retorno', v: roas ? `${roas.toFixed(1)}×` : '—' },
                            ].map(k => (
                                <div key={k.l} className="rounded-lg border border-gray-100 dark:border-[#2A2A2A] px-2.5 py-1.5 text-right">
                                    <p className="text-[13px] font-bold tabular-nums text-gray-900 dark:text-white leading-none">{k.v}</p>
                                    <p className="text-[9px] text-gray-500 mt-1 uppercase tracking-wide">{k.l}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-[#1E1E1E]">
                    {etapas.map(e => <LinhaEtapa key={e.chave} e={e} larguraMax={larguraMax} />)}
                </div>

                {/* resultado */}
                <div className="px-4 py-3 border-t border-gray-100 dark:border-[#2A2A2A] grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { l: 'Animais vendidos', v: int(f.resultado.animais), meta: `meta ${d.metas.animaisPorCliente} por cliente` },
                        { l: 'Faturamento', v: brl0(f.resultado.faturamento), meta: '' },
                        { l: 'Ticket por animal', v: f.resultado.ticketPorAnimal ? brl0(f.resultado.ticketPorAnimal) : '—', meta: `meta ${brl0(d.metas.ticketPorAnimal)}` },
                        { l: 'Custo por animal', v: f.custos.porAnimal ? brl(f.custos.porAnimal) : '—', meta: '' },
                    ].map(k => (
                        <div key={k.l}>
                            <p className="text-[15px] font-bold tabular-nums text-gray-900 dark:text-white leading-none">{k.v}</p>
                            <p className="text-[10px] text-gray-500 mt-1.5 uppercase tracking-wide">{k.l}</p>
                            {k.meta && <p className="text-[10px] text-gray-400 mt-0.5">{k.meta}</p>}
                        </div>
                    ))}
                </div>

                {/* venda declarada pelo assessor */}
                {f.declarado.length > 0 && (
                    <div className="mx-4 mb-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5">
                        <p className="text-[12px] font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                            <AlertTriangle size={13} />
                            Mais {f.declarado.length === 1 ? 'uma venda' : `${f.declarado.length} vendas`} de {brl0(declaradoValor)} que o assessor assina — e que o funil acima não conta
                        </p>
                        {f.declarado.map(x => (
                            <p key={x.lead} className="text-[11px] text-amber-800 dark:text-amber-300/90 mt-1.5 leading-snug">
                                <strong>{x.lead}</strong> ({x.uf}) entrou por {x.origem} em {x.dataLead.split('-').reverse().join('/')} e
                                arrematou {x.animais} {x.animais === 1 ? 'animal' : 'animais'} por {brl0(x.valor)} em {x.primeiraCompra.split('-').reverse().join('/')}.
                                O lead chegou <strong>sem parâmetro de campanha na URL</strong>, então não há como o sistema provar de qual anúncio veio.
                                Base: {x.base}.
                            </p>
                        ))}
                    </div>
                )}

                {/* anúncio apontando para a página de outro produto */}
                {(() => {
                    const total = f.etapas.leads || 1;
                    const cruzadas = Object.entries(f.origensDosLeads)
                        .filter(([k]) => /^Landing/i.test(k) && !pertence(k, f.nome))
                        .filter(([, v]) => v / total >= 0.05);
                    if (!cruzadas.length) return null;
                    const soma = cruzadas.reduce((a, [, v]) => a + v, 0);
                    return (
                        <div className="mx-4 mb-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-3 py-2.5">
                            <p className="text-[12px] font-semibold text-red-900 dark:text-red-200 flex items-center gap-1.5">
                                <AlertTriangle size={13} />
                                {soma} de {f.etapas.leads} leads desta campanha entraram por uma página de outro produto
                            </p>
                            <p className="text-[11px] text-red-800 dark:text-red-300/90 mt-1 leading-snug">
                                {cruzadas.map(([k, v]) => `${v} por ${k}`).join(', ')}. Anúncio apontando para a landing errada
                                gasta a verba desta campanha e faz a conversão dela parecer pior do que é — o pixel de
                                conversão mora na outra página e nunca dispara.
                            </p>
                        </div>
                    );
                })()}

                {/* trabalho humano e origens */}
                <div className="px-4 pb-4 grid md:grid-cols-3 gap-4">
                    <Bloco titulo="Etapa na planilha" dados={f.trabalho} total={f.etapas.leads} />
                    <Bloco titulo="Quem atendeu" dados={f.responsaveis} total={Object.values(f.responsaveis).reduce((a, b) => a + b, 0)} />
                    <Bloco titulo="Por onde o lead entrou" dados={f.origensDosLeads} total={f.etapas.leads} />
                </div>

                {/* clientes */}
                {f.detalheClientes.length > 0 && (
                    <div className="px-4 pb-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                            Quem comprou — nome a nome, com a prova
                        </p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12px]">
                                <thead>
                                    <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-[#2A2A2A]">
                                        <th className="py-1.5 pr-3 font-medium">Lead</th>
                                        <th className="py-1.5 pr-3 font-medium">No ERP</th>
                                        <th className="py-1.5 pr-3 font-medium">Casou por</th>
                                        <th className="py-1.5 pr-3 font-medium">Lead em</th>
                                        <th className="py-1.5 pr-3 font-medium">Comprou em</th>
                                        <th className="py-1.5 pr-3 font-medium text-right">Animais</th>
                                        <th className="py-1.5 font-medium text-right">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-[#1A1A1A]">
                                    {f.detalheClientes.map(c => (
                                        <tr key={c.lead + c.primeiraCompra}>
                                            <td className="py-1.5 pr-3 text-gray-900 dark:text-gray-100">{c.lead} <span className="text-gray-400">({c.uf})</span></td>
                                            <td className="py-1.5 pr-3 text-gray-500">{c.comprador}</td>
                                            <td className="py-1.5 pr-3 text-gray-500">{c.via}</td>
                                            <td className="py-1.5 pr-3 tabular-nums text-gray-500">{c.dataLead.split('-').reverse().join('/')}</td>
                                            <td className="py-1.5 pr-3 tabular-nums text-gray-500">{c.primeiraCompra.split('-').reverse().join('/')}</td>
                                            <td className="py-1.5 pr-3 tabular-nums text-right">{c.animais}</td>
                                            <td className="py-1.5 tabular-nums text-right font-semibold">{brl0(c.valor)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* comparativo */}
            <div className={`${card} p-4`}>
                <p className="text-[13px] font-bold text-gray-900 dark:text-white mb-1">Campanha a campanha</p>
                <p className="text-[11px] text-gray-500 mb-3">
                    Taxa contra taxa — a meta é mensal e as campanhas duraram tempos diferentes, então o volume não se compara.
                </p>
                <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                        <thead>
                            <tr className="text-left text-gray-400 border-b border-gray-200 dark:border-[#2A2A2A]">
                                <th className="py-2 pr-3 font-medium">Campanha</th>
                                <th className="py-2 pr-3 font-medium text-right">Investido</th>
                                <th className="py-2 pr-3 font-medium text-right">Leads</th>
                                <th className="py-2 pr-3 font-medium text-right">Por lead</th>
                                <th className="py-2 pr-3 font-medium text-right">MQL/lead<br /><span className="text-[9px]">meta {d.metas.mqlPorLead}%</span></th>
                                <th className="py-2 pr-3 font-medium text-right">Cad./MQL<br /><span className="text-[9px]">meta {d.metas.cadastroPorMql}%</span></th>
                                <th className="py-2 pr-3 font-medium text-right">Aprov./cad.<br /><span className="text-[9px]">meta {d.metas.aprovadoPorCadastro}%</span></th>
                                <th className="py-2 pr-3 font-medium text-right">Clientes</th>
                                <th className="py-2 font-medium text-right">Faturamento</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-[#1E1E1E]">
                            {comLeads.map(c => (
                                <tr key={c.id} className={c.id === sel ? 'bg-gray-50 dark:bg-[#1A1A1A]' : ''}>
                                    <td className="py-2 pr-3">
                                        <button onClick={() => setSel(c.id)} className="text-left hover:underline text-gray-900 dark:text-gray-100">{c.nome}</button>
                                    </td>
                                    <td className="py-2 pr-3 text-right tabular-nums">{brl0(c.midia.investido)}</td>
                                    <td className="py-2 pr-3 text-right tabular-nums">{int(c.etapas.leads)}</td>
                                    <td className="py-2 pr-3 text-right tabular-nums">{c.custos.porLead ? brl(c.custos.porLead) : '—'}</td>
                                    <Celula taxa={c.taxas.mqlPorLead} meta={d.metas.mqlPorLead} />
                                    <Celula taxa={c.taxas.cadastroPorMql} meta={d.metas.cadastroPorMql} />
                                    <Celula taxa={c.taxas.aprovadoPorCadastro} meta={d.metas.aprovadoPorCadastro} />
                                    <td className="py-2 pr-3 text-right tabular-nums">{c.etapas.clientes || '—'}</td>
                                    <td className="py-2 text-right tabular-nums font-semibold">{c.resultado.faturamento ? brl0(c.resultado.faturamento) : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-gray-200 dark:border-[#2A2A2A] font-bold">
                                <td className="py-2 pr-3">Total</td>
                                <td className="py-2 pr-3 text-right tabular-nums">{brl0(d.totais.investido)}</td>
                                <td className="py-2 pr-3 text-right tabular-nums">{int(d.totais.leads)}</td>
                                <td className="py-2 pr-3 text-right tabular-nums">{brl(d.totais.investido / d.totais.leads)}</td>
                                <td className="py-2 pr-3 text-right tabular-nums">{taxaTxt(Math.round((d.totais.mql / d.totais.leads) * 10000) / 100)}</td>
                                <td className="py-2 pr-3 text-right tabular-nums">{taxaTxt(Math.round((d.totais.cadastrosSubmetidos / d.totais.mql) * 10000) / 100)}</td>
                                <td className="py-2 pr-3 text-right tabular-nums">{taxaTxt(Math.round((d.totais.cadastrosAprovados / d.totais.cadastrosSubmetidos) * 10000) / 100)}</td>
                                <td className="py-2 pr-3 text-right tabular-nums">{int(d.totais.clientes)}</td>
                                <td className="py-2 text-right tabular-nums">{brl0(d.totais.faturamento)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                {semLead.length > 0 && (
                    <p className="text-[11px] text-gray-500 mt-3">
                        Fora da tabela: {semLead.map(c => `${c.nome} (${brl0(c.midia.investido)})`).join(', ')} — gastou e não produziu lead rastreado.
                    </p>
                )}
            </div>

            {/* o que ficou fora */}
            <div className={`${card} p-4`}>
                <p className="text-[13px] font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-amber-500" /> O que este painel não conta — e por quê
                </p>
                <div className="grid md:grid-cols-2 gap-4 mt-3">
                    <div>
                        <p className="text-[12px] font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                            {d.fora.landingSemParametro.length} leads chegaram por uma página nossa sem parâmetro na URL
                        </p>
                        <p className="text-[11px] text-gray-500 leading-relaxed mb-2">
                            Dá para provar que vieram da página; não dá para provar de qual campanha. Não entram em nenhuma
                            taxa. Entre eles há {d.fora.vendaSemCampanha.clientes === 1 ? 'uma venda' : `${d.fora.vendaSemCampanha.clientes} vendas`} de{' '}
                            <strong>{brl0(d.fora.vendaSemCampanha.valor)}</strong>. É o custo de não taguear a landing.
                        </p>
                        <ul className="text-[11px] text-gray-500 space-y-0.5">
                            {Object.entries(
                                d.fora.landingSemParametro.reduce<Record<string, number>>((a, x) => {
                                    a[x.origem || 'sem origem'] = (a[x.origem || 'sem origem'] ?? 0) + 1;
                                    return a;
                                }, {}),
                            ).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                                <li key={k} className="flex justify-between gap-3">
                                    <span className="truncate">{k}</span><span className="tabular-nums shrink-0">{v}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <p className="text-[12px] font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Buracos conhecidos nas fontes</p>
                        <ul className="text-[11px] text-gray-500 space-y-1.5 leading-relaxed">
                            {Object.entries(d.janelas).map(([k, v]) => (
                                <li key={k}><strong className="text-gray-600 dark:text-gray-300">{k}:</strong> {v}</li>
                            ))}
                            <li>
                                <strong className="text-gray-600 dark:text-gray-300">cadastros fora da campanha:</strong>{' '}
                                {d.cadastros.semLeadNenhum} pessoas foram submetidas nos grupos sem existir como lead de anúncio —
                                é carteira de assessor, não mídia, e por isso não entra em nenhum funil.
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * A landing "pertence" à campanha quando as duas falam do mesmo produto. É
 * comparação de palavra-chave de propósito: o nome da campanha é escrito à mão
 * no Gerenciador e nunca vai casar exatamente com o nome da página.
 */
function pertence(landing: string, campanha: string): boolean {
    const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const l = norm(landing), c = norm(campanha);
    // Só palavras de PRODUTO/EVENTO entram aqui. "perpetuo" ficou de fora de
    // propósito: é o nome do funil, e está tanto em "LEAD - PERPETUO TOURO"
    // quanto em "Landing Fêmeas — Funil Perpétuo" — com ele na lista, o anúncio
    // de touros que aponta para a página de fêmeas passava por certo.
    for (const chave of ['touro', 'femea', 'sao geraldo', 'jmp', 'eao', 'magda']) {
        if (l.includes(chave) && c.includes(chave)) return true;
    }
    return false;
}

function Celula({ taxa, meta }: { taxa: number | null; meta: number }) {
    const pct = versusMeta(taxa, meta);
    return (
        <td className="py-2 pr-3 text-right tabular-nums font-semibold" style={{ color: corDaMeta(pct) }}>
            {taxaTxt(taxa)}
        </td>
    );
}

function Bloco({ titulo, dados, total }: { titulo: string; dados: Record<string, number>; total: number }) {
    const linhas = Object.entries(dados).slice(0, 7);
    if (!linhas.length) return null;
    return (
        <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">{titulo}</p>
            <ul className="space-y-1">
                {linhas.map(([k, v]) => (
                    <li key={k} className="flex items-center gap-2 text-[12px]">
                        <span className="flex-1 truncate text-gray-600 dark:text-gray-300">{k}</span>
                        <span className="tabular-nums text-gray-900 dark:text-white font-semibold">{v}</span>
                        <span className="w-9 text-right tabular-nums text-[10px] text-gray-400">
                            {total ? `${Math.round((v / total) * 100)}%` : ''}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
