/**
 * MOTOR DO FUNIL POR CAMPANHA — fonte única da regra.
 *
 * Este arquivo existe para que a regra de "de qual campanha veio este lead"
 * tenha UM dono. O painel lê a planilha ao vivo e precisa dela; o script de
 * apuração (scripts/apura-funil-campanhas-2026.mts) precisa da mesma. Quando a
 * mesma conta mora em dois lugares, os dois divergem — já aconteceu aqui com a
 * métrica de atendimento, que passou a exigir um teste de consistência entre as
 * duas superfícies. Aqui a duplicação é evitada na origem: o script importa
 * este módulo.
 *
 * Nada neste arquivo faz I/O. Ele recebe linhas e devolve leads atribuídos.
 */

/* ── normalizadores ──────────────────────────────────────────────────────── */

export const semAcento = (s: unknown): string =>
    String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Telefone canônico: só dígitos, sem DDI, 10–11 dígitos. '' quando não presta. */
export function foneKey(v: unknown): string {
    let d = String(v ?? '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    if (d.length < 10) return '';
    return d.slice(-11);
}

export function docKey(v: unknown): string {
    const d = String(v ?? '').replace(/\D/g, '');
    return d.length === 11 || d.length === 14 ? d : '';
}

export function nomeKey(v: unknown): string {
    const s = semAcento(v).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    return s.length >= 5 && s.split(' ').length >= 2 ? s : '';
}

/** "16/08/2026, 21:57" | "2026-08-16…" → "2026-08-16". '' quando não dá. */
export function dataIso(v: unknown): string {
    const s = String(v ?? '').trim();
    const br = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return iso ? iso[1] : '';
}

/** Piso da faixa: "101-300"→101, "1 a 50 cabeças"→1, "nenhuma"→0. */
export function pisoCabecas(v: unknown): number | null {
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) return null;
    if (s === 'nenhuma') return 0;
    const m = s.match(/\d+/);
    return m ? Number(m[0]) : null;
}

export const temIE = (flag?: unknown, numero?: unknown): boolean =>
    String(flag ?? '').trim().toLowerCase() === 'sim' || String(numero ?? '').trim().length > 0;

/** MQL = a regra do próprio app (crm_config.mql_rule): ≥100 cabeças E I.E. */
export function ehMql(cabecas: unknown, ieFlag?: unknown, ieNum?: unknown): boolean {
    const p = pisoCabecas(cabecas);
    return p != null && p >= 100 && temIE(ieFlag, ieNum);
}

/** Nome comparável: sem acento, minúsculo, pontuação virando espaço. */
export const chaveNome = (s: unknown): string =>
    semAcento(s).toLowerCase().replace(/[–—]/g, '-').replace(/[^a-z0-9]+/g, ' ').trim();

/* ── estrutura da conta de anúncios ──────────────────────────────────────── */

export interface MetaCampanha {
    id: string; nome: string; status: string; inicio: string;
    investido: number; impressoes: number; alcance: number;
    cliques: number; cliquesSaida: number | null; acessos: number | null;
    leadsMeta: number | null; ctr: number; cpc: number; cpm: number;
}
export interface MetaConjunto {
    id: string; nome: string; campanha: string;
    investido: number; impressoes: number; cliques: number;
    acessos: number | null; leadsMeta: number | null;
}
export interface MetaAnuncio {
    nome: string; conjunto: string; campanha: string; status: string;
    investido: number; impressoes: number; cliques: number; acessos: number; leadsMeta: number;
}
export interface MetaEstrutura {
    extraidoEm: string;
    fonte: string;
    campanhas: MetaCampanha[];
    conjuntos: MetaConjunto[];
    anuncios: Record<string, MetaAnuncio>;
    mensal?: Record<string, Record<string, Record<string, number>>>;
    notas?: string[];
}

export interface IndiceMeta {
    estrutura: MetaEstrutura;
    porId: Map<string, MetaCampanha>;
    conjPorId: Map<string, MetaConjunto>;
    campPorNome: Map<string, string>;
    campPorNomeConjunto: Map<string, string>;
    campPorNomeAnuncio: Map<string, string>;
}

const AMBIGUO = '__ambiguo__';

export function indexaMeta(estrutura: MetaEstrutura): IndiceMeta {
    const porId = new Map(estrutura.campanhas.map(c => [c.id, c]));
    const conjPorId = new Map(estrutura.conjuntos.map(s => [s.id, s]));

    const campPorNome = new Map<string, string>();
    for (const c of estrutura.campanhas) {
        const k = chaveNome(c.nome);
        campPorNome.set(k, campPorNome.has(k) ? AMBIGUO : c.id);
    }

    // Nome de conjunto repetido em duas campanhas normalmente é ambíguo — menos
    // quando um dos homônimos nunca teve entrega: conjunto com zero impressão
    // não gerou lead, então sobra um único candidato. (É o caso de
    // "CA - LEILAO JMP TOUROS 14/06", que existe nas duas campanhas JMP e só
    // veiculou numa.)
    const porNomeConj = new Map<string, MetaConjunto[]>();
    for (const s of estrutura.conjuntos) {
        const k = chaveNome(s.nome);
        if (!porNomeConj.has(k)) porNomeConj.set(k, []);
        porNomeConj.get(k)!.push(s);
    }
    const campPorNomeConjunto = new Map<string, string>();
    for (const [k, lista] of porNomeConj) {
        const campanhas = new Set(lista.filter(s => (s.impressoes || 0) > 0).map(s => s.campanha));
        campPorNomeConjunto.set(k, campanhas.size === 1 ? [...campanhas][0] : AMBIGUO);
    }

    // Nome de anúncio é o que a landing grava em utm_content.
    const campPorNomeAnuncio = new Map<string, string>();
    for (const a of Object.values(estrutura.anuncios ?? {})) {
        const k = chaveNome(a.nome);
        if (!k) continue;
        const atual = campPorNomeAnuncio.get(k);
        if (atual === undefined) campPorNomeAnuncio.set(k, a.campanha);
        else if (atual !== a.campanha) campPorNomeAnuncio.set(k, AMBIGUO);
    }

    return { estrutura, porId, conjPorId, campPorNome, campPorNomeConjunto, campPorNomeAnuncio };
}

/* ── atribuição ──────────────────────────────────────────────────────────── */

/** Uma linha crua da planilha ou do CRM, em forma de dicionário. */
export type LinhaBruta = Record<string, unknown>;

export interface Atribuicao {
    campanha: string | null;
    via: string;
    conflito: boolean;
}

/**
 * Procura um anúncio que satisfaça ao mesmo tempo o nome de anúncio, o de
 * conjunto e o de campanha declarados na linha — um trio que existe de verdade
 * na estrutura da conta é prova estrutural e vence qualquer voto isolado.
 * Aceita o par (anúncio + conjunto) quando a campanha não vem nomeada: é como
 * as landings gravam (utm_campaign = conjunto, utm_content = anúncio).
 */
export function trioCoerente(reg: LinhaBruta, m: IndiceMeta): Atribuicao | null {
    const ads = Object.values(m.estrutura.anuncios ?? {});
    const tenta = (kA: string, kS: string, kC: string, via: string): Atribuicao | null => {
        if (!kA || !kS) return null;
        const achados = new Set<string>();
        for (const a of ads) {
            if (chaveNome(a.nome) !== kA) continue;
            const conj = m.conjPorId.get(a.conjunto);
            if (!conj || chaveNome(conj.nome) !== kS) continue;
            if (kC && chaveNome(m.porId.get(a.campanha)?.nome ?? '') !== kC) continue;
            achados.add(a.campanha);
        }
        return achados.size === 1 ? { campanha: [...achados][0], via, conflito: false } : null;
    };
    return tenta(chaveNome(reg['ad_name']), chaveNome(reg['adset_name']), chaveNome(reg['campaign_name']), 'trio-conector')
        ?? tenta(chaveNome(reg['utm_content']), chaveNome(reg['utm_campaign']), '', 'par-utm');
}

/**
 * De qual campanha veio o lead, por VOTAÇÃO entre fontes independentes.
 *
 * Por que votação e não uma ordem fixa: o `ad-id` que a landing grava pode ser
 * o de uma visita ANTERIOR (o parâmetro fica guardado no navegador), enquanto
 * os utm da URL são os do clique de agora. Foi o que apareceu em três leads do
 * remarketing de São Geraldo, em que o ad-id apontava campanhas de junho e
 * julho e todo o resto da linha apontava São Geraldo.
 *
 * `Origem` NÃO vota: ela é escrita como "Meta — <campaign_name>", é espelho do
 * campaign_name, e contá-la seria contar o mesmo voto duas vezes.
 */
export function atribuiCampanha(reg: LinhaBruta, m: IndiceMeta): Atribuicao {
    const trio = trioCoerente(reg, m);
    if (trio) return trio;

    const ads = m.estrutura.anuncios ?? {};
    const votos: { campanha: string; via: string }[] = [];
    const vota = (campanha: string | null | undefined, via: string) => {
        if (campanha && campanha !== AMBIGUO) votos.push({ campanha, via });
    };
    let ambiguo = false;

    const idAnuncio = [reg['ad-id'], reg['ad_id']]
        .map(v => String(v ?? '').trim())
        .find(v => /^\d{10,}$/.test(v));
    if (idAnuncio && ads[idAnuncio]) vota(ads[idAnuncio].campanha, 'ad-id');

    const idCamp = String(reg['campaign_id'] ?? '').trim();
    if (/^\d{10,}$/.test(idCamp) && m.porId.has(idCamp)) vota(idCamp, 'campaign_id');

    const idConj = String(reg['adset_id'] ?? '').trim();
    if (/^\d{10,}$/.test(idConj) && m.conjPorId.has(idConj)) vota(m.conjPorId.get(idConj)!.campanha, 'adset_id');

    const resolveTexto = (valor: unknown): string | null => {
        const bruto = String(valor ?? '').trim();
        if (!bruto || /^\{\{.*\}\}$/.test(bruto)) return null;       // macro não substituída
        if (/^\d{10,}$/.test(bruto) && m.conjPorId.has(bruto)) return m.conjPorId.get(bruto)!.campanha;
        if (/^\d{10,}$/.test(bruto) && m.porId.has(bruto)) return bruto;
        const k = chaveNome(bruto);
        const porCamp = m.campPorNome.get(k);
        if (porCamp && porCamp !== AMBIGUO) return porCamp;
        const porConj = m.campPorNomeConjunto.get(k);
        if (porConj === AMBIGUO) { ambiguo = true; return null; }
        return porConj ?? null;
    };
    for (const campo of ['utm_campaign', 'utm_medium', 'campaign_name', 'adset_name']) {
        vota(resolveTexto(reg[campo]), campo);
    }

    const kAnuncio = chaveNome(reg['utm_content'] ?? reg['ad_name'] ?? '');
    if (kAnuncio) {
        const c = m.campPorNomeAnuncio.get(kAnuncio);
        if (c === AMBIGUO) ambiguo = true;
        else vota(c, 'utm_content');
    }

    if (!votos.length) return { campanha: null, via: ambiguo ? 'ambiguo' : 'sem-prova', conflito: false };

    const contagem = new Map<string, number>();
    for (const v of votos) contagem.set(v.campanha, (contagem.get(v.campanha) ?? 0) + 1);
    const ranking = [...contagem].sort((a, b) => b[1] - a[1]);
    const conflito = ranking.length > 1;
    if (conflito && ranking[0][1] === ranking[1][1]) return { campanha: null, via: 'empate', conflito: true };

    const campanha = ranking[0][0];
    return { campanha, via: votos.filter(v => v.campanha === campanha).map(v => v.via).join('+'), conflito };
}

/** Origem que não é anúncio nenhum (importação, lista fria, cadastro avulso). */
export function classeOrigem(origem: unknown, campanhaRotulo: unknown): string {
    const o = semAcento(origem).toLowerCase();
    const c = semAcento(campanhaRotulo).toLowerCase();
    if (/lista antiga|base unificada|contatos whatsapp/.test(o)) return 'base-fria';
    if (/^meta|landing|forms inst|perpetuo|sao geraldo|jmp/.test(o)) return 'campanha';
    if (/^(ca -|ca-|leads -|lead -|leilao jmp|\d{15,})/.test(c)) return 'campanha';
    if (/instagram/.test(o)) return 'organico';
    if (/habilitacao|indicacao/.test(o)) return 'direto';
    return o ? 'outro' : 'sem-origem';
}

/** Lead de teste da equipe e "dummy data" que a própria Meta injeta. */
export function ehLixo(l: { nome?: unknown; fone?: unknown; origem?: unknown; campanhaRotulo?: unknown }): boolean {
    const n = semAcento(l.nome).trim();
    const d = String(l.fone ?? '').replace(/\D/g, '');
    if (/test(e)?\b|\[teste\]|apagar|^(sdsad|asdf|qwer|aaa+|xxx+)/i.test(n)) return true;
    if (/^\d{4}-\d{2}-\d{2}T/.test(n)) return true;                 // nome veio como timestamp
    if (/<test lead|dummy data/i.test(String(l.campanhaRotulo ?? ''))) return true;
    if (/importacao de validacao/i.test(semAcento(l.origem))) return true;
    if (d && (/(\d)\1{5,}/.test(d) || /^(\d\d)\1{2,}/.test(d.slice(2)))) return true;
    return false;
}

/* ── pessoas ─────────────────────────────────────────────────────────────── */

export interface RegistroLead {
    nome: string; fone: string; email?: string; uf?: string; cidade?: string;
    cabecas?: string; ie?: string; interesse?: string;
    origem: string; campanhaRotulo: string; data: string; leadId: string;
    fonte: string; cpf?: string;
    campanha: string | null; via: string; conflito: boolean; classe: string;
}

export interface PessoaLead extends RegistroLead {
    toques: number;
    campanhas: string[];
    dataCampanha: string;
    jaEstavaNaBaseFria: boolean;
    mql: boolean;
    etapa: string;
    atendidoPor: string;
    abaTrabalho: string;
}

/**
 * Junta os registros na PESSOA. A Meta cobra por preenchimento, então duas
 * submissões da mesma pessoa são dois leads para ela — mas para o funil de
 * conversão é uma pessoa só, e é pessoa que vira cadastro e cliente.
 *
 * Registro SEM data não é "o mais antigo": é registro sem data. As listas
 * importadas entram assim, e colocá-las na frente fazia a pessoa herdar a data
 * vazia — com data vazia, QUALQUER compra do ano passava no teste "comprou
 * depois de virar lead". Por isso os sem data vão para o fim da fila.
 */
export function juntaPessoas(registros: RegistroLead[]): { pessoas: PessoaLead[]; repreenchimentos: number } {
    const ordenados = [...registros].sort(
        (a, b) => (a.data ? 0 : 1) - (b.data ? 0 : 1) || String(a.data).localeCompare(String(b.data)),
    );
    const porChave = new Map<string, PessoaLead>();
    let repreenchimentos = 0;
    for (const r of ordenados) {
        const k = (r.leadId && `L:${r.leadId}`)
            || (foneKey(r.fone) && `F:${foneKey(r.fone)}`)
            || (nomeKey(r.nome) && `N:${nomeKey(r.nome)}`);
        if (!k) { repreenchimentos++; continue; }
        const ja = porChave.get(k);
        if (!ja) {
            porChave.set(k, {
                ...r,
                toques: 1,
                campanhas: r.campanha ? [r.campanha] : [],
                dataCampanha: r.campanha ? r.data : '',
                jaEstavaNaBaseFria: r.classe === 'base-fria',
                mql: false, etapa: '', atendidoPor: '', abaTrabalho: '',
            });
            continue;
        }
        ja.toques++;
        repreenchimentos++;
        if (r.classe === 'base-fria') ja.jaEstavaNaBaseFria = true;
        if (r.campanha) {
            if (!ja.campanhas.includes(r.campanha)) ja.campanhas.push(r.campanha);
            if (!ja.dataCampanha || (r.data && r.data < ja.dataCampanha)) ja.dataCampanha = r.data;
            // a pessoa fica com a campanha do PRIMEIRO toque de anúncio; se o
            // primeiro registro não tinha prova e um posterior tem, ela preenche
            if (!ja.campanha) { ja.campanha = r.campanha; ja.via = `${r.via} (toque posterior)`; }
        }
        if (!ja.data && r.data) ja.data = r.data;
        if (!ja.cabecas && r.cabecas) ja.cabecas = r.cabecas;
        if (!temIE(ja.ie) && temIE(r.ie)) ja.ie = r.ie;
    }
    const pessoas = [...porChave.values()];
    // A data que vale para tudo que vem DEPOIS do lead (cadastro, compra) é a do
    // toque de anúncio. Lead sem data de campanha não reivindica nada.
    for (const p of pessoas) {
        if (p.campanha) p.data = p.dataCampanha || p.data;
        p.mql = ehMql(p.cabecas, p.ie);
    }
    return { pessoas, repreenchimentos };
}

/** Peso da etapa da planilha, para escolher a mais avançada quando há duas. */
export function pesoEtapa(e: unknown): number {
    const tabela: Record<string, number> = {
        'JÁ COMPROU': 7, 'CADASTRO OK': 6, 'CADASTRO REPROVADO': 5,
        'SEM INFORMAÇÃO PARA CADASTRO': 4, 'QUALIFICAÇÃO': 3, 'CONEXÃO': 2,
        'NÃO RESPONDEU': 1, 'NUMERO ERRADO': 1,
    };
    return tabela[String(e ?? '').trim()] ?? 0;
}
