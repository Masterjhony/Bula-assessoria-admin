/**
 * FUNIL POR CAMPANHA — os números que o painel de growth mostra.
 *
 * A apuração NÃO acontece aqui. Ela é feita por
 * `scripts/apura-funil-campanhas-2026.mjs`, que cruza cinco fontes (Meta Ads,
 * planilha de leads, crm_leads, grupos de cadastro das leiloeiras e o ERP
 * HastaPro) e grava `funil-campanhas.json` ao lado deste arquivo. O painel só
 * apresenta.
 *
 * Por que assim, e não ao vivo: o servidor não tem — de propósito — credencial
 * da Marketing API do Meta nem do Firebird do HastaPro. Puxar isso do runtime
 * significaria colocar as duas no ambiente de produção para alimentar uma tela
 * de leitura. A apuração roda na máquina que já tem acesso, fica versionada no
 * git (dá para auditar o que mudou entre uma apuração e outra) e o painel
 * carimba a data em que foi feita, para ninguém confundir com tempo real.
 *
 * Para atualizar:
 *   1. node scripts/extrai-fontes-2026.mjs        (planilha, CRM, ERP)
 *   2. atualizar outputs/funil-campanhas-2026/meta-estrutura-AAAA-MM-DD.json
 *   3. node scripts/apura-funil-campanhas-2026.mjs
 */
import dados from './funil-campanhas.json';

/** Uma etapa do funil pode ser medida, declarada por uma pessoa, ou não existir. */
export type Confianca = 'medido' | 'declarado' | 'nao-se-aplica';

export interface FunilTaxas {
    ctr: number | null;
    acessoPorClique: number | null;
    leadPorAcesso: number | null;
    leadPorClique: number | null;
    mqlPorLead: number | null;
    cadastroPorMql: number | null;
    aprovadoPorCadastro: number | null;
    clientePorAprovado: number | null;
    animaisPorCliente: number | null;
}

export interface FunilCampanha {
    id: string;
    nome: string;
    status: 'ACTIVE' | 'PAUSED' | string;
    inicio: string;
    /** landing = manda para página nossa; formulario = form dentro do Meta. */
    tipo: 'landing' | 'formulario' | 'mista' | string;
    cliqueDeSaidaPct: number;
    /** false = o pixel da página registrou visita demais/de menos para servir de etapa. */
    acessosConfiaveis: boolean;
    mensal: Record<string, { investido: number; impressoes: number; alcance: number; cliques: number; cliquesSaida: number; acessos: number; leadsMeta: number }>;
    midia: {
        investido: number; impressoes: number; alcance: number;
        cliques: number; cliquesSaida: number | null;
        acessos: number | null; acessosNaTaxa: number | null;
        leadsMeta: number; ctr: number; cpc: number; cpm: number;
    };
    etapas: {
        leads: number; mql: number;
        cadastrosSubmetidos: number; cadastrosAprovados: number; clientes: number;
    };
    resultado: { animais: number; faturamento: number; ticket: number; ticketPorAnimal: number };
    taxas: FunilTaxas;
    custos: {
        porLead: number | null; porMql: number | null; porCadastro: number | null;
        porAprovado: number | null; porCliente: number | null; porAnimal: number | null;
    };
    trabalho: Record<string, number>;
    origensDosLeads: Record<string, number>;
    responsaveis: Record<string, number>;
    leadsPorMes: Record<string, number>;
    detalheClientes: {
        lead: string; uf: string; dataLead: string; via: string; comprador: string;
        primeiraCompra: string; animais: number; valor: number;
        leiloes: string[]; filiais: string[]; etapa: string; atendidoPor: string;
    }[];
    detalheCadastros: { nome: string; status: string; fontes: string[]; data: string }[];
    /** Venda que o assessor assina, mas cujo lead não trouxe parâmetro na URL. */
    declarado: {
        lead: string; uf: string; dataLead: string; origem: string; comprador: string;
        valor: number; animais: number; primeiraCompra: string; etapa: string; base: string;
    }[];
}

export interface FunilCampanhasDados {
    geradoEm: string;
    metaExtraidoEm: string;
    universo: {
        registrosPlanilha: number; registrosDoCrmSoNoCrm: number; lixoDescartado: number;
        pessoasDepoisDaDedup: number; repreenchimentos: number; pessoasDeCampanha: number;
    };
    totais: {
        investido: number; impressoes: number; cliques: number; leads: number; mql: number;
        cadastrosSubmetidos: number; cadastrosAprovados: number; clientes: number;
        faturamento: number; animais: number;
    };
    metas: {
        investimentoMensal: number; ctr: number; acessoPorClique: number; leadPorAcesso: number;
        mqlPorLead: number; cadastroPorMql: number; aprovadoPorCadastro: number;
        clientePorAprovado: number; animaisPorCliente: number; ticketPorAnimal: number;
    };
    confirmadosPeloAssessor: FunilCampanha['declarado'];
    funis: FunilCampanha[];
    fora: {
        total: number;
        porClasse: Record<string, number>;
        landingSemParametro: {
            data: string; nome: string; origem: string; uf: string; mql: boolean; etapa: string;
            comprou: { valor: number; animais: number; primeira: string; evidencia: string } | null;
        }[];
        vendaSemCampanha: { clientes: number; valor: number; animais: number };
    };
    janelas: Record<string, string>;
    cadastros: {
        pessoasComDecisao: number; aprovados: number; recusados: number;
        submetidosSemDecisao: number; casadosComLeadDeCampanha: number; semLeadNenhum: number;
        detalheSemLead: { nome: string; status: string; fontes: string[] }[];
    };
    cadastrosForaDeOrdem: { nome: string; fonte: string; dataCadastro: string; lead: string; dataLead: string }[];
}

export const FUNIL_CAMPANHAS = dados as unknown as FunilCampanhasDados;

/** Campanhas com leads apurados, da que mais investiu para a que menos. */
export function funisComLeads(d: FunilCampanhasDados = FUNIL_CAMPANHAS): FunilCampanha[] {
    return d.funis.filter(f => f.etapas.leads > 0).sort((a, b) => b.midia.investido - a.midia.investido);
}

/** Campanhas que gastaram sem produzir lead rastreado — o painel precisa mostrar. */
export function funisSemLead(d: FunilCampanhasDados = FUNIL_CAMPANHAS): FunilCampanha[] {
    return d.funis.filter(f => f.etapas.leads === 0 && f.midia.investido > 0);
}

/**
 * Compara uma taxa apurada com a meta. Devolve o quanto ela representa da meta
 * (100 = bateu). `null` quando a etapa não se aplica àquela campanha — e nesse
 * caso o painel escreve "não se aplica", em vez de desenhar 0%.
 */
export function versusMeta(valor: number | null, meta: number): number | null {
    if (valor == null || !meta) return null;
    return Math.round((valor / meta) * 100);
}

/** Cor do indicador: bateu, chegou perto, ficou longe. */
export function corDaMeta(pctDaMeta: number | null): string {
    if (pctDaMeta == null) return 'var(--cinza, #6b7280)';
    if (pctDaMeta >= 100) return '#10b981';
    if (pctDaMeta >= 60) return '#eab308';
    return '#ef4444';
}

/** Meses em que houve investimento, do mais recente para o mais antigo. */
export function mesesComInvestimento(d: FunilCampanhasDados = FUNIL_CAMPANHAS): string[] {
    const s = new Set<string>();
    for (const f of d.funis) for (const m of Object.keys(f.mensal ?? {})) s.add(m);
    return [...s].sort().reverse();
}

const MES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function nomeDoMes(iso: string): string {
    const [ano, mes] = iso.split('-');
    return `${MES_PT[Number(mes) - 1]} de ${ano}`;
}
