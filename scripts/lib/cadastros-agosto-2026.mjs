/**
 * CADASTROS DE AGOSTO/2026 — apuração dos grupos, lida mensagem a mensagem.
 *
 * O sistema parou de registrar cadastro em 08/07 e a apuração manual anterior
 * (scripts/lib/cadastros-aprovados-grupos.mjs) foi até 01/08. Por isso três
 * etapas do funil apareciam como "sem registro" em agosto — justamente no mês
 * em que a meta passou a valer.
 *
 * Esta lista fecha esse buraco. Fonte: whatsapp_messages, grupos "Cadastros Bula
 * Remates" e "Cadastros Bula e Programa", 01/08 a 14/08/2026, 182 mensagens de
 * texto deduplicadas, lidas uma a uma. Não dá para fazer isso com regex: o grupo
 * é conversa livre, o veredito vem em linguagem natural ("cadastro bom do
 * wellington", "Henio; sem i.e e com restrição. reprovado", "ta apto então? sim
 * senho") e várias consultas vêm sem nome, só com CPF.
 *
 * REGRA DE CLASSIFICAÇÃO
 *   aprovado  — "cadastro bom", "cadastro ok", "apto", "liberado", "aprovado",
 *               "OK - N lotes". Inclui aprovação com ressalva registrada.
 *   recusado  — "reprovado", "inapto", "não é do ramo", "risco de inadimplência".
 *   pendente  — consulta iniciada sem veredito até 14/08, ou "averiguar melhor".
 *
 * O que NÃO foi contado: mensagens com CPF solto sem nome nem desfecho (são
 * consultas que não dá para atribuir a ninguém sem chutar).
 */

/** Decisões de cadastro em agosto/2026, com a frase que sustenta cada uma. */
export const CADASTROS_AGOSTO = [
    // ── 01/08 ────────────────────────────────────────────────────────────────
    {
        nome: 'Wellington Ferreira dos Santos', cpf: '820.500.232-00', data: '2026-08-01',
        status: 'aprovado', evidencia: '"cadastro bom do wellington" (CPF e nome informados em 31/07)',
    },
    {
        nome: 'Hênio Suassuna Ferreira', data: '2026-08-01',
        status: 'recusado', evidencia: '"Henio; sem i.e e com restrição. reprovado"',
    },
    {
        nome: 'Gabriel Licinio Holanda Peruchi', data: '2026-08-01',
        status: 'recusado', evidencia: '"Cliente: GABRIEL LICINIO HOLANDA PERUCHI Está inapto, única opção pra ele é a vista, caso contrário não será aceita a venda."',
    },
    {
        nome: 'Braz de Oliveira Bueno', data: '2026-08-01',
        status: 'aprovado', ressalva: true, evidencia: '"BRAZ DE OLIVEIRA da pra vender com cautela"',
    },
    {
        nome: 'Geniuce', cpf: '53.748.659/0001-07', data: '2026-08-01',
        status: 'pendente', evidencia: '"teve 4 CNPJs… a atividade principal era hortaliças… averiguar melhor"',
    },
    {
        nome: 'Helio', data: '2026-08-01',
        status: 'recusado', evidencia: '"helio com restrições e protestos. reprovado!"',
    },
    {
        nome: 'Dienifer', data: '2026-08-01',
        status: 'recusado', evidencia: '"DIENIFER Score 387 Restrições baixas R$ 1297,00 IE não compatível com produção rural. Não possui área própria. Inapta"',
    },
    {
        nome: 'Davison Avelino Gomes Pinto', data: '2026-08-01',
        status: 'aprovado', evidencia: '"DAVISON AVELINO GOMES PINTO cadastro bom" · direcionado para Fábio Omena',
    },
    {
        nome: 'Carlos Augusto dos Santos Sousa', cpf: '942.300.993-04', ie: '12.825307-0', data: '2026-08-01',
        status: 'aprovado', evidencia: '"esse cpf consultamos semana passada, estava ok de score"',
    },
    {
        nome: 'Lucilia Lelis Pereira Mardegan', cpf: '831.457.109-15', uf: 'PR', data: '2026-08-01',
        status: 'aprovado', evidencia: '"cadastro bom dela.. aqui tem duas i.e" → "ta apto então?" → "sim senho"',
    },
    {
        nome: 'Adonício Tomé de Souza', cpf: '663.892.678-00', data: '2026-08-01',
        status: 'aprovado', evidencia: '"liberado, sem pendências ou restrições"',
    },
    // ── 05/08 ────────────────────────────────────────────────────────────────
    {
        nome: '(cliente com I.E. de terceiro)', cpf: '883.074.173-68', data: '2026-08-05',
        status: 'pendente', evidencia: '"vai usar I.E de um amigo… score alto até, 46 anos… se averiguar certo e ver essa i.e talvez dê pra liberar" — pendia de termo de autorização',
    },
    // ── 09/08 ────────────────────────────────────────────────────────────────
    {
        nome: 'Rafael Falci Pereira de Mello', cpf: '695.248.36-75', data: '2026-08-09',
        status: 'aprovado', evidencia: '"Rafael Falci Pereira de Mello - OK. 1 LOTE" (consulta para 1 lote no Paranã)',
    },
    // ── 11/08 ────────────────────────────────────────────────────────────────
    {
        nome: '(cliente Rondonópolis)', uf: 'MT', data: '2026-08-11',
        status: 'aprovado', evidencia: '"Score bom e sem protesto/restrição" + "Tem IE" (duas) → "Vou direcionar para o Leozinho atender ele e colocar no leilão de amanhã"',
    },
    {
        nome: '(cliente com negativação baixa)', data: '2026-08-11',
        status: 'aprovado', ressalva: true, evidencia: '"tem uma negativação mas é valor baixo… E tem IE ativa, duas" → seguiu para eRural',
    },
    {
        nome: 'Adriano de Oliveira', cpf: '013.105.811-85', uf: 'MT', data: '2026-08-11',
        status: 'aprovado', evidencia: '"ADRIANO DE OLIVEIRA CPF 013.105.811-85 Serasa: 715 Terra: 7 ha MT Status: aprovado Crédito sugerido: R$ 61.525,00"',
    },
    // ── 12/08 ────────────────────────────────────────────────────────────────
    {
        nome: 'Tiago de Alencar Brito', cpf: '022.056.323-37', data: '2026-08-12',
        status: 'aprovado', ressalva: true, evidencia: '"TIAGO DE ALENCAR BRITO CPF 022.056.323-37 Serasa: 800 Não tem IE" → "Então aprovado. IE ele não tem" (dados de GTA no lugar)',
    },
    // ── 13/08 ────────────────────────────────────────────────────────────────
    {
        nome: 'Geovane Gonçalves Pereira', cpf: '081.435.465-35', data: '2026-08-13',
        status: 'recusado', evidencia: '"Alta probabilidade de inadimplência e sem IE: Reprovado"',
    },
    {
        nome: '(esposa do comprador, contadora)', data: '2026-08-13',
        status: 'aprovado', ressalva: true, evidencia: '"Score bom" + "Consta sem IE" → "Aprovado com esse apontamento" (compra em nome dela usando I.E. dele)',
    },
    {
        nome: '(lead do grupo)', data: '2026-08-13',
        status: 'recusado', evidencia: '"Tem IE e apareceu que não possui Score" → "Fria" → "Reprovado 🚨"',
    },
    {
        nome: '(consulta 181.417.416-83)', cpf: '181.417.416-83', data: '2026-08-13',
        status: 'pendente', evidencia: '"Score: 641 IE: Não tem" — sem veredito registrado',
    },
    // ── 14/08 ────────────────────────────────────────────────────────────────
    {
        nome: '(cadastro Expogenética)', data: '2026-08-14',
        status: 'pendente', evidencia: '"Score ótimo, sem IE" — encaminhado para o grupo da PL, que decide os leilões da Expogenética',
    },
]

/**
 * A META DE AGOSTO, dita pela diretoria no próprio grupo em 14/08/2026:
 * "Pessoal, adicionei a *Luana* ao grupo, ela vai compor nossa equipe comercial.
 *  Responsável pelo atendimento dos leads e conseguir novos cadastros.
 *  Estamos com a meta de 60 cadastros para esse mês de Agosto!"
 *
 * Confirma, por outra via, o 56,16 da planilha — e mostra que a diretoria já
 * identificou o mesmo gargalo que este relatório mede: a contratação é
 * exatamente para o degrau lead→cadastro.
 */
export const META_CADASTROS_AGOSTO = 60

export const RESUMO_AGOSTO = {
    pessoas: CADASTROS_AGOSTO.length,
    aprovados: CADASTROS_AGOSTO.filter(c => c.status === 'aprovado').length,
    recusados: CADASTROS_AGOSTO.filter(c => c.status === 'recusado').length,
    pendentes: CADASTROS_AGOSTO.filter(c => c.status === 'pendente').length,
    comRessalva: CADASTROS_AGOSTO.filter(c => c.ressalva).length,
    janela: ['2026-08-01', '2026-08-14'],
}

/**
 * ⚠ DOIS CUIDADOS OBRIGATÓRIOS AO USAR ESTA LISTA — verificados em 14/08:
 *
 * 1) SEIS destas pessoas JÁ CONSTAM na apuração anterior (cadastros-aprovados-
 *    grupos.mjs, que vai até 01/08): Wellington Ferreira dos Santos, Gabriel
 *    Licinio Holanda Peruchi, Braz de Oliveira Bueno, Dienifer, Davison Avelino
 *    Gomes Pinto e Carlos Augusto dos Santos Sousa. Somar as duas listas sem
 *    deduplicar conta essas seis duas vezes.
 *
 * 2) NENHUM dos 15 nomes identificáveis foi localizado nas bases de lead de
 *    campanha (planilha, todas as abas, + crm_leads com origem de anúncio).
 *    Ou seja: os cadastros que entraram no grupo em agosto vieram da carteira
 *    dos assessores, não da mídia. Isso confirma, por medição, o alerta da
 *    diretoria de que "os grupos têm submissão que não é da campanha".
 *    Os outros 7 registros são anônimos (só CPF ou descrição) e não dá para
 *    classificar sem chutar.
 *
 * Consequência prática: estes números medem a OPERAÇÃO DE CADASTRO (que está
 * funcionando: 12 aprovados em 18 decisões), mas NÃO podem ser somados ao funil
 * de campanha. Para a campanha, agosto tem zero cadastro comprovado.
 */
export const JA_CONTADOS_ANTES = [
    'Wellington Ferreira dos Santos', 'Gabriel Licinio Holanda Peruchi', 'Braz de Oliveira Bueno',
    'Dienifer', 'Davison Avelino Gomes Pinto', 'Carlos Augusto dos Santos Sousa',
]
/** Registros que são novidade em agosto (não estavam na apuração até 01/08). */
export const NOVOS_EM_AGOSTO = CADASTROS_AGOSTO.filter(c => !JA_CONTADOS_ANTES.includes(c.nome))
/** Quantos destes são comprovadamente lead de campanha. Medido: nenhum. */
export const DE_CAMPANHA_EM_AGOSTO = 0
export const IDENTIFICAVEIS = CADASTROS_AGOSTO.filter(c => !/^\(/.test(c.nome)).length
