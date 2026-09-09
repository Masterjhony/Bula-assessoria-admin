export interface FontePrazo { tipo:string; ref:string; trecho?:string; data?:string; [chave:string]:unknown }
export interface ApuracaoComissao { [chave:string]:unknown; competencia_inicio?:string; competencia_fim?:string; previsao_mes?:string|null; prazo_situacao?:string; regra_vencimento?:Record<string,unknown>; condicao?:unknown; beneficiario?:string; prazo_maximo?:string; fontes?:FontePrazo[]; pendencias?:string[] }
export interface TituloComissao { [chave:string]:unknown; apuracao?:ApuracaoComissao|null; status?:string; substituido_por?:string|null; vencimento?:string|null; tags?:string[]|null; observacoes?:string|null }
export interface ContextoComissao { comissao_assessor:boolean; competencia?:string; competencia_fonte?:string|null; beneficiario?:string; excecao?:string; repasse_especial?:boolean; fonte?:FontePrazo }
export type ResultadoPrazoComissao = {acao:'preservar';motivo:string} | {acao:'programar';patch:Record<string,unknown>;motivo:string;nominal:NonNullable<ReturnType<typeof nominal25>>;regra:Record<string,unknown>};
/** Regra declarada pelo financeiro em 09/09/2026. Puro: não consulta nem grava banco. */
export const REGRA_CODIGO = 'comissao_dia25_mes_seguinte';
export const REGRA_VERSAO = '2026-09-09';
export const FONTE_REGRA = {
  tipo: 'usuario_atual', data: '2026-09-09',
  ref: 'Conversa Codex: programação financeira de setembro, após entrega V4',
  trecho: 'Pagamos todo dia 25 do mês as comissões referentes ao mês anterior.',
  contexto: 'A instrução atual admite dia útil próximo ou anterior quando necessário, sem escolher a direção. Calendário verificado: 25/09/2026 é sexta-feira.'
};
const norm = (x:unknown) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function nominal25(competencia:string|undefined) {
  if (!competencia || !/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) return null;
  const d = new Date(Date.UTC(Number(competencia.slice(0,4)), Number(competencia.slice(5,7)), 25));
  const data=d.toISOString().slice(0,10),fim_de_semana=[0,6].includes(d.getUTCDay()),natal=data.slice(5)==='12-25';
  return {data,fim_de_semana,dia_semana:d.getUTCDay(),feriado_conhecido:natal?'Natal':null,ajuste_necessario:fim_de_semana||natal};
}

/**
 * Contexto deve identificar comissão de assessor e competência, nunca emissao/vencimento.
 * Exceções estruturadas prevalecem. O chamador identifica ambiguidades comerciais por fonte.
 * Isto não cria CP nem afirma que valor, beneficiário ou quitação foram comprovados.
 */
export function programarComissao(titulo:TituloComissao, contexto:ContextoComissao):ResultadoPrazoComissao {
  const a = titulo.apuracao || {};
  if (!contexto.comissao_assessor || titulo.substituido_por || ['pago','cancelado'].includes(titulo.status||'')) return { acao:'preservar', motivo:'Fora do universo de comissão aberta de assessor.' };
  if (a.condicao || a.prazo_situacao === 'condicionado_ao_caixa' || contexto.repasse_especial) return { acao:'preservar', motivo:'Condição ou repasse específico prevalece sobre o calendário mensal.' };
  const competencia=contexto.competencia;
  const nominal = nominal25(competencia);
  if (!nominal || !competencia) return { acao:'preservar', motivo:'Competência explícita ainda não identificada; não derivar de emissão ou vencimento.' };
  const fonte = contexto.fonte || FONTE_REGRA;
  const base = { codigo:REGRA_CODIGO, versao:REGRA_VERSAO, competencia:contexto.competencia,
    dia_nominal:25, deslocamento_meses:1, data_nominal:nominal.data,
    ajuste_dia_util:nominal.ajuste_necessario?'pendente':'nao_necessario', direcao_ajuste:null,
    motivo_ajuste:nominal.feriado_conhecido||(nominal.fim_de_semana?'fim_de_semana':null),
    fonte_ref:fonte.ref, elegibilidade:'comissao_assessor', competencia_fonte:contexto.competencia_fonte,
    ressalva:'A programação do prazo não confirma valor, beneficiário, empresa ou quitação. Feriados locais futuros exigem conferência; nenhum ajuste é escolhido automaticamente.' };
  const atual = String(titulo.vencimento || '').slice(0,10);
  const nome = norm(a.beneficiario || contexto.beneficiario);
  const nane = contexto.excecao === 'nane_dezembro' || nome === 'nane';
  const conjuntaNane = contexto.excecao === 'beneficiario_com_prazo_alternativo';
  let vencimento = atual || null;
  const diaEspecificoComFonte = (titulo.tags || []).includes('data-acordada')
    && (a.fontes || []).some(f => f.ref && f.ref !== FONTE_REGRA.ref);
  let previsao_mes = a.previsao_mes ?? null;
  let prazo_situacao:string, nota:string, regra:Record<string,unknown> = base;
  if (nane) {
    if (!diaEspecificoComFonte) vencimento = null;
    regra = {...base, aplicacao:'excecao_documentada', excecao:'nane_acumulado_dezembro', data_nominal:null, data_operacional:vencimento};
    prazo_situacao = 'excecao_documentada';
    previsao_mes = vencimento ? vencimento.slice(0,7)+'-01' : `${competencia.slice(0,4)}-12-01`;
    nota = vencimento ? `Prazo específico da Nane preservado com fonte: ${vencimento}.` : 'Exceção da Nane preservada: acumulado em dezembro, sem dia confirmado. A regra geral do dia 25 não revoga o acerto específico.';
  } else if (conjuntaNane) {
    vencimento = null;
    regra = {...base, aplicacao:'depende_beneficiario', alternativas:[
      {beneficiario:'Assessor sujeito à regra mensal', data_nominal:nominal.data},
      {beneficiario:'Nane', previsao_mes:`${competencia.slice(0,4)}-12-01`, data_nominal:null}
    ]};
    prazo_situacao = 'depende_beneficiario';
    nota = 'Prazo depende do beneficiário final: dia 25 do mês seguinte pela regra mensal; dezembro se prevalecer o acerto específico da Nane. Uma única obrigação em disputa, sem duplicar valores.';
  } else if (contexto.excecao === 'competencia_em_verificacao') {
    vencimento = null;
    regra = {...base, aplicacao:'competencia_em_verificacao', data_nominal:null, data_nominal_somente_se_competencia_confirmada:nominal.data};
    prazo_situacao = 'competencia_em_verificacao';
    nota = 'A regra mensal foi registrada, mas o evento/competência deste acerto segue em verificação. Nenhum vencimento é certificado a partir de uma hipótese de junho.';
  } else if (contexto.excecao === 'controle_sem_nova_obrigacao') {
    vencimento = null;
    regra = {...base, aplicacao:'controle_sem_nova_obrigacao', data_nominal:null, referencia_ciclo:nominal.data};
    prazo_situacao = 'controle_documental';
    nota = 'Registro de controle documental, sem nova obrigação reconhecida. A referência do ciclo mensal não converte quitação histórica nem cobertura de evento em conta atrasada.';
  } else if ((a.prazo_maximo && String(a.prazo_maximo).slice(0,10) !== nominal.data) ||
    ((titulo.tags || []).includes('data-acordada') && atual && atual !== nominal.data) || contexto.excecao === 'prazo_especifico') {
    regra = {...base, aplicacao:'prazo_especifico_preservado', data_operacional:vencimento,
      ajuste_dia_util: vencimento ? 'definido_por_acerto' : 'pendente',
      direcao_ajuste: vencimento ? vencimento < nominal.data ? 'anterior' : vencimento > nominal.data ? 'seguinte' : 'mesmo_dia' : null};
    prazo_situacao = 'prazo_especifico';
    if (vencimento) previsao_mes = vencimento.slice(0,7)+'-01';
    nota = 'Prazo específico documentado preservado; o dia 25 é a regra geral para casos sem exceção.';
  } else {
    regra.aplicacao = 'regra_geral';
    vencimento = nominal.data;
    previsao_mes = nominal.data.slice(0,7)+'-01';
    prazo_situacao = nominal.ajuste_necessario ? 'ajuste_dia_util_pendente' : 'regra_confirmada';
    nota = `Regra declarada pelo financeiro: competência ${contexto.competencia}, pagamento nominal em ${nominal.data}. ` +
      (nominal.ajuste_necessario ? `O dia 25 coincide com ${nominal.feriado_conhecido||'fim de semana'}; confirmar o dia útil anterior ou seguinte antes de assumir uma data operacional exata.` : 'Data do ciclo mensal confirmada pela regra informada.') +
      ' Permanecem intactas todas as ressalvas comerciais, os valores e os pagamentos já registrados.';
  }
  const pendencias = [...(a.pendencias || [])];
  const superadas = Array.isArray(a.pendencias_prazo_superadas) ? [...a.pendencias_prazo_superadas] : [];
  // Uma escolha explícita resolve somente as pendências do calendário mensal;
  // a história e as pendências comerciais permanecem disponíveis.
  if (prazo_situacao !== 'ajuste_dia_util_pendente') for (let i=pendencias.length-1;i>=0;i--) {
    if (/^Dia nominal \d{4}-\d{2}-\d{2} coincide com .+Definir o útil anterior ou seguinte/.test(pendencias[i])) {
      if (!superadas.includes(pendencias[i])) superadas.push(pendencias[i]);
      pendencias.splice(i,1);
    }
  }
  const extra = nominal.ajuste_necessario && regra.aplicacao==='regra_geral'
    ? `Dia nominal ${nominal.data} coincide com ${nominal.feriado_conhecido||'fim de semana'}. Definir o útil anterior ou seguinte; ainda não há direção de ajuste autorizada.` : null;
  if (extra && !pendencias.includes(extra)) pendencias.push(extra);
  const fontes = [...(a.fontes || [])];
  if (!fontes.some(f => f.tipo===fonte.tipo && f.ref===fonte.ref && f.trecho===fonte.trecho)) fontes.push(fonte);
  const apuracao:ApuracaoComissao = {...a, prazo_situacao, regra_vencimento:regra, fontes, pendencias};
  if (superadas.length) apuracao.pendencias_prazo_superadas = superadas;
  if(previsao_mes)apuracao.previsao_mes=previsao_mes;else delete apuracao.previsao_mes;
  const tags = [...new Set([...(titulo.tags || []).filter(tag => (vencimento || tag !== 'data-acordada') && (prazo_situacao==='ajuste_dia_util_pendente'||tag!=='ajuste-dia-util-pendente')), 'regra-comissao-dia25', ...(prazo_situacao==='ajuste_dia_util_pendente'?['ajuste-dia-util-pendente']:[])])];
  const marca = `[PROGRAMAÇÃO COMISSÕES ${REGRA_VERSAO}] `+nota;
  const observacoes = String(titulo.observacoes || '').includes(marca) ? titulo.observacoes : [titulo.observacoes,marca].filter(Boolean).join('\n');
  const patch:Record<string,unknown> = {apuracao,tags,observacoes};
  if (vencimento !== atual) patch.vencimento = vencimento;
  return {acao:'programar', patch, motivo:nota, nominal, regra};
}
