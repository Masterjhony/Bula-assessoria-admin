/**
 * FUNIL POR CAMPANHA — AO VIVO na parte que muda o tempo todo.
 *
 * O painel mistura fontes com velocidades muito diferentes, e tratar todas do
 * mesmo jeito seria mentir para os dois lados:
 *
 *   PLANILHA (leads, MQL, etapa, quem atendeu) — muda o dia inteiro: lead novo
 *     caindo, SDR mexendo na etapa. É lida AO VIVO, a cada carregamento.
 *   CRM — mesma coisa, lido ao vivo do Postgres.
 *   MÍDIA (investimento, impressões, cliques) — só muda quando a campanha
 *     veicula. Vem do dump versionado, com a data na tela; passa a ser lida ao
 *     vivo assim que existir META_ADS_ACCESS_TOKEN (ver meta-ads-live.ts, que
 *     explica por que hoje nenhum dos dois tokens da casa serve).
 *   CADASTROS e COMPRAS — cadastro dos grupos é leitura manual (texto livre,
 *     sem parser); compra só muda em dia de leilão. Vêm da apuração.
 *
 * Quando a leitura ao vivo falha (planilha fora do ar, credencial trocada), o
 * painel NÃO quebra e NÃO inventa: cai para os números da última apuração e
 * diz, na tela, que está mostrando o congelado.
 */
import 'server-only';

import { readTabsRaw, LEADS_GERAIS_TAB, ABAS_INTERESSE } from './jmp-sheets';
import { supabaseAdmin } from './supabase';
import {
    indexaMeta, atribuiCampanha, classeOrigem, ehLixo, juntaPessoas, foneKey,
    dataIso, pesoEtapa, type MetaEstrutura, type RegistroLead, type PessoaLead,
} from './funil-motor';
import { FUNIL_CAMPANHAS, type FunilCampanhasDados, type FunilCampanha } from './funil-campanhas';
import estruturaJson from './meta-estrutura.json';
import { buscaMidiaAoVivo, midiaAoVivoDisponivel } from './meta-ads-live';

const ABAS_TRABALHO = Object.values(ABAS_INTERESSE) as string[];
const META = indexaMeta(estruturaJson as unknown as MetaEstrutura);

export interface FunilAoVivo extends FunilCampanhasDados {
    /** 'ao-vivo' = topo do funil recalculado agora; 'congelado' = só a apuração. */
    frescor: 'ao-vivo' | 'congelado';
    lidoEm: string | null;
    motivoCongelado?: string;
    /** true quando o investimento também veio da Meta agora, e não do dump. */
    midiaAoVivo?: boolean;
}

/** Converte uma aba crua em linhas-dicionário. */
function comoObjetos(aba?: { head: string[]; rows: string[][] }): Record<string, string>[] {
    if (!aba) return [];
    return aba.rows.map(r => Object.fromEntries(aba.head.map((h, i) => [h, r[i] ?? ''])));
}

/**
 * Recalcula, a partir da planilha e do CRM agora, as etapas de topo de cada
 * campanha: leads, qualificados, etapa na planilha e quem atendeu.
 *
 * As etapas de baixo (cadastro, cliente, faturamento) NÃO são tocadas — elas
 * vêm da apuração, que cruza fontes que este caminho não alcança.
 */
export async function carregaFunilAoVivo(): Promise<FunilAoVivo> {
    const base = FUNIL_CAMPANHAS;
    try {
        // A mídia só vem ao vivo se houver token com ads_read; senão é o dump.
        const [abas, midia] = await Promise.all([
            readTabsRaw([LEADS_GERAIS_TAB, ...ABAS_TRABALHO]),
            midiaAoVivoDisponivel() ? buscaMidiaAoVivo() : Promise.resolve(null),
        ]);
        const midiaPorId = new Map((midia ?? []).map(c => [c.id, c]));
        const gerais = comoObjetos(abas[LEADS_GERAIS_TAB]);
        if (!gerais.length) {
            return { ...base, frescor: 'congelado', lidoEm: null, motivoCongelado: 'a planilha respondeu sem linhas' };
        }

        /* ── 1. registros da planilha ─────────────────────────────────────── */
        const registros: RegistroLead[] = [];
        for (const r of gerais) {
            const bruto = {
                nome: r['Nome'], fone: r['WhatsApp'],
                origem: r['Origem'] ?? '', campanhaRotulo: r['utm_campaign'] || r['campaign_name'] || '',
            };
            if (ehLixo(bruto)) continue;
            const a = atribuiCampanha(r, META);
            registros.push({
                nome: String(r['Nome'] ?? ''), fone: String(r['WhatsApp'] ?? ''),
                email: r['E-mail'], uf: r['UF'], cidade: r['Cidade'],
                cabecas: r['Cabeças'], ie: r['Inscrição Estadual'], interesse: r['Interesse'],
                origem: String(r['Origem'] ?? ''),
                campanhaRotulo: String(r['utm_campaign'] || r['campaign_name'] || ''),
                data: dataIso(r['Data']), leadId: String(r['Lead ID'] ?? '').trim(),
                fonte: `planilha/${LEADS_GERAIS_TAB}`,
                campanha: a.campanha, via: a.via, conflito: a.conflito,
                classe: classeOrigem(r['Origem'], r['utm_campaign'] || r['campaign_name']),
            });
        }

        /* ── 2. leads que só existem no CRM ───────────────────────────────── */
        // As landings de junho/julho (JMP e EAO Baviera) gravaram direto no
        // crm_leads e nunca subiram para a planilha.
        const fones = new Set(registros.map(l => foneKey(l.fone)).filter(Boolean));
        const { data: doCrm } = await supabaseAdmin()
            .from('crm_leads')
            .select('nome, telefone, celular, email, cpf, estado, cidade, origem, campaign, medium, utm_content, quantidade_animais, tem_inscricao_estadual, inscricao_estadual, interesse, data_entrada, created_at')
            .limit(20000);
        for (const l of doCrm ?? []) {
            const rotulo = String(l.campaign ?? '');
            if (classeOrigem(l.origem, rotulo) !== 'campanha') continue;
            const kf = foneKey(l.telefone || l.celular);
            if (kf && fones.has(kf)) continue;
            if (kf) fones.add(kf);
            const linha = {
                utm_campaign: rotulo, campaign_name: rotulo,
                utm_medium: l.medium, utm_content: l.utm_content, Origem: l.origem,
            };
            const bruto = { nome: l.nome, fone: l.telefone || l.celular, origem: l.origem, campanhaRotulo: rotulo };
            if (ehLixo(bruto)) continue;
            const a = atribuiCampanha(linha, META);
            registros.push({
                nome: String(l.nome ?? ''), fone: String(l.telefone || l.celular || ''),
                email: l.email ?? undefined, uf: l.estado ?? undefined, cidade: l.cidade ?? undefined,
                cabecas: l.quantidade_animais ?? undefined,
                ie: (l.tem_inscricao_estadual || l.inscricao_estadual) ?? undefined,
                interesse: l.interesse ?? undefined, origem: String(l.origem ?? ''),
                campanhaRotulo: rotulo, data: dataIso(l.data_entrada || l.created_at),
                leadId: '', fonte: 'crm_leads', cpf: l.cpf ?? undefined,
                campanha: a.campanha, via: a.via, conflito: a.conflito, classe: 'campanha',
            });
        }

        /* ── 3. pessoas, etapa e responsável ──────────────────────────────── */
        const { pessoas, repreenchimentos } = juntaPessoas(registros);

        const porFone = new Map<string, { etapa: string; quem: string; aba: string }>();
        for (const aba of ABAS_TRABALHO) {
            for (const r of comoObjetos(abas[aba])) {
                const k = foneKey(r['WhatsApp']);
                if (!k) continue;
                const etapa = String(r['Etapa'] ?? '').trim();
                const quem = String(r['Atendido por'] ?? '').trim();
                if (!etapa && !quem) continue;
                const ja = porFone.get(k);
                if (!ja || pesoEtapa(etapa) > pesoEtapa(ja.etapa)) porFone.set(k, { etapa, quem, aba });
            }
        }
        for (const p of pessoas) {
            const e = porFone.get(foneKey(p.fone));
            p.etapa = e?.etapa ?? '';
            p.atendidoPor = e?.quem ?? '';
            p.abaTrabalho = e?.aba ?? '';
        }

        /* ── 4. costura com a apuração ────────────────────────────────────── */
        const deCampanha = pessoas.filter(p => p.campanha);
        const funis: FunilCampanha[] = base.funis.map(fBase => {
            const f = aplicaMidia(fBase, midiaPorId.get(fBase.id));
            const meus = deCampanha.filter(p => p.campanha === f.id);
            const mql = meus.filter(p => p.mql).length;
            // As etapas de baixo continuam as da apuração: cadastro e compra não
            // são deriváveis da planilha sozinha.
            const etapas = { ...f.etapas, leads: meus.length, mql };
            return {
                ...f,
                etapas,
                taxas: recalculaTaxas(f, etapas),
                custos: {
                    porLead: meus.length ? f.midia.investido / meus.length : null,
                    porMql: mql ? f.midia.investido / mql : null,
                    porCadastro: etapas.cadastrosSubmetidos ? f.midia.investido / etapas.cadastrosSubmetidos : null,
                    porAprovado: etapas.cadastrosAprovados ? f.midia.investido / etapas.cadastrosAprovados : null,
                    porCliente: etapas.clientes ? f.midia.investido / etapas.clientes : null,
                    porAnimal: f.resultado.animais ? f.midia.investido / f.resultado.animais : null,
                },
                trabalho: contaPor(meus, p => p.etapa || '(sem etapa)'),
                origensDosLeads: contaPor(meus, p => p.origem || '(sem origem)'),
                responsaveis: contaPor(meus.filter(p => p.atendidoPor), p => tituloNome(p.atendidoPor)),
                leadsPorMes: contaPor(meus.filter(p => p.data), p => p.data.slice(0, 7)),
            };
        });

        const semCampanha = pessoas.filter(p => !p.campanha);
        const totais = {
            ...base.totais,
            leads: funis.reduce((a, f) => a + f.etapas.leads, 0),
            mql: funis.reduce((a, f) => a + f.etapas.mql, 0),
        };

        return {
            ...base,
            frescor: 'ao-vivo',
            midiaAoVivo: !!midia,
            lidoEm: new Date().toISOString(),
            totais,
            funis,
            universo: {
                ...base.universo,
                registrosPlanilha: gerais.length,
                pessoasDepoisDaDedup: pessoas.length,
                repreenchimentos,
                pessoasDeCampanha: deCampanha.length,
            },
            fora: {
                ...base.fora,
                total: semCampanha.length,
                porClasse: contaPor(semCampanha, p => p.classe),
                landingSemParametro: semCampanha
                    .filter(p => p.classe === 'campanha')
                    .map(p => {
                        // a venda continua vindo da apuração — o cruzamento com o
                        // ERP não é feito aqui
                        const antes = base.fora.landingSemParametro.find(x => x.nome === p.nome);
                        return {
                            data: p.data, nome: p.nome, origem: p.origem, uf: p.uf ?? '',
                            mql: p.mql, etapa: p.etapa, comprou: antes?.comprou ?? null,
                        };
                    }),
            },
        };
    } catch (e) {
        console.error('[funil-live] leitura ao vivo falhou; usando a última apuração:', e);
        return {
            ...base,
            frescor: 'congelado',
            lidoEm: null,
            motivoCongelado: e instanceof Error ? e.message : 'erro desconhecido',
        };
    }
}

/**
 * Troca os números de mídia do dump pelos que a Meta acabou de devolver — e
 * refaz junto o que é DERIVADO deles: se o investimento muda, o tipo da
 * campanha (landing/formulário, medido pelo clique de saída) e a confiança no
 * pixel de acessos têm de ser recalculados, senão o painel mistura um retrato
 * novo com uma classificação velha.
 */
function aplicaMidia(f: FunilCampanha, novo?: { investido: number; impressoes: number; alcance: number; cliques: number; cliquesSaida: number | null; acessos: number | null; leadsMeta: number | null; ctr: number; cpc: number; cpm: number; status: string }): FunilCampanha {
    if (!novo) return f;
    const saida = novo.cliques ? (novo.cliquesSaida ?? 0) / novo.cliques : 0;
    const tipo = saida >= 0.30 ? 'landing' : saida < 0.05 ? 'formulario' : 'mista';
    const acessosConfiaveis = (novo.cliquesSaida ?? 0) > 0 && (novo.acessos ?? 0) / novo.cliquesSaida! >= 0.5;
    const ehLanding = tipo === 'landing' && acessosConfiaveis;
    return {
        ...f,
        status: novo.status || f.status,
        tipo,
        cliqueDeSaidaPct: Math.round(saida * 1000) / 10,
        acessosConfiaveis,
        midia: {
            investido: novo.investido, impressoes: novo.impressoes, alcance: novo.alcance,
            cliques: novo.cliques, cliquesSaida: novo.cliquesSaida,
            acessos: novo.acessos, acessosNaTaxa: ehLanding ? novo.acessos : null,
            leadsMeta: novo.leadsMeta ?? 0, ctr: novo.ctr, cpc: novo.cpc, cpm: novo.cpm,
        },
    };
}

function recalculaTaxas(f: FunilCampanha, e: FunilCampanha['etapas']): FunilCampanha['taxas'] {
    const t = (a: number, b: number | null) => (b ? Math.round((a / b) * 10000) / 100 : null);
    const acessos = f.midia.acessosNaTaxa;
    return {
        ctr: f.taxas.ctr,
        acessoPorClique: acessos == null ? null : t(acessos, f.midia.cliques),
        leadPorAcesso: acessos == null ? null : t(e.leads, acessos),
        leadPorClique: t(e.leads, f.midia.cliques),
        mqlPorLead: t(e.mql, e.leads),
        cadastroPorMql: t(e.cadastrosSubmetidos, e.mql),
        aprovadoPorCadastro: t(e.cadastrosAprovados, e.cadastrosSubmetidos),
        clientePorAprovado: t(e.clientes, e.cadastrosAprovados),
        animaisPorCliente: e.clientes ? Math.round((f.resultado.animais / e.clientes) * 100) / 100 : null,
    };
}

function contaPor<T>(arr: T[], f: (x: T) => string): Record<string, number> {
    const m = new Map<string, number>();
    for (const x of arr) { const k = f(x); m.set(k, (m.get(k) ?? 0) + 1); }
    return Object.fromEntries([...m].sort((a, b) => b[1] - a[1]));
}

/** "LUANA CRUZ" e "pedro pereira" viram o mesmo "Pedro Pereira" na contagem. */
const tituloNome = (s: string) =>
    s.trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|\s)\S/g, t => t.toUpperCase());

export type { PessoaLead };
