/**
 * CADASTROS DE AGOSTO/2026 — apuração dos grupos, lida mensagem a mensagem
 * E COM OS ANEXOS ABERTOS.
 *
 * Fonte: whatsapp_messages + operational_items dos grupos "Cadastros Bula
 * Remates" e "Cadastros Bula e Programa", 01/08 a 26/08/2026, mais as 68 fichas
 * (CNH, inscrição de produtor, SINTEGRA, cartão CNPJ, contracheque) baixadas do
 * bucket `whatsapp-media` e LIDAS uma a uma.
 *
 * ⚠ POR QUE OS ANEXOS SÃO OBRIGATÓRIOS. Na maior parte das submissões o texto
 * do grupo é só "consulta por favor" — o cliente vai dentro do anexo. Na
 * primeira passada (14/08) esta lista tinha 10 registros anônimos, e a
 * conclusão foi que quase nada vinha de campanha. Abrindo os anexos, sete
 * deles ganharam nome e CPF, e cinco eram lead de campanha ativa:
 *
 *   "(cliente Rondonópolis)"        → Ruy de Freitas Lima (Landing Touros, 11/08)
 *   "(esposa do comprador)"         → Bruna Alaise S. O. Arruda (mulher do Handerson)
 *   "Helio"                         → Hélio Mascarenhas Rocha (Landing São Geraldo)
 *   "(lead do grupo)"               → Marco Antonio de Brito Santos
 *   "(cliente com negativação baixa)" → era o próprio Adriano de Oliveira (duplicata)
 *
 * E apareceram SEIS submissões que o texto sozinho não mostrava: Fabio Rafael da
 * Cunha Silva, Handerson Soares Arruda Oliveira, Claudio Rogerio Rocha Junior,
 * Derek Danesi do Nascimento, Delvanio Ivo de Almeida e Fabricio Mendanha de
 * Mattos. Sem abrir anexo, a apuração erra para menos.
 *
 * QUEM POSTOU A FICHA IMPORTA (regra dada pela diretoria em 26/08):
 *   • Douglas Bispo, Marcelo Carneiro, Pedro Pereira, Luana Cruz e João Antônio
 *     são a equipe de marketing — a ficha deles nasce de LEAD.
 *   • Fábio Omena e Leonardo Serafim são assessores comerciais — a ficha deles
 *     é carteira própria, não entra no funil de mídia.
 * O campo `postadaPor` vem de operational_items.source_sender_name na mensagem
 * que carregava o anexo; `origemLead` só é preenchido quando o lead foi casado
 * na planilha por CPF, telefone ou nome completo.
 *
 * REGRA DE CLASSIFICAÇÃO DO VEREDITO
 *   aprovado  — "cadastro bom", "cadastro ok", "apto", "liberado", "aprovado",
 *               "OK - N lotes". Inclui aprovação com ressalva (limite, cautela).
 *   recusado  — "reprovado", "inapto", "não autorizado", "não é do ramo".
 *   pendente  — consulta iniciada sem veredito até 26/08.
 */

/** Decisões e submissões de cadastro em agosto/2026, com a frase que sustenta cada uma. */
export const CADASTROS_AGOSTO = [
    // ── 01/08 ────────────────────────────────────────────────────────────────
    {
        nome: 'Wellington Ferreira dos Santos', cpf: '820.500.232-00', data: '2026-08-01',
        status: 'aprovado', postadaPor: 'Fábio Omena', origemLead: 'Meta — LEADS - FORMS INST EAO — Cópia',
        evidencia: '"cadastro bom do wellington" (10:38); CPF e nome informados em 31/07 22:04. João Antônio mandou print da planilha marcando o lead dele (10:50).',
    },
    {
        nome: 'Hênio Suassuna Ferreira', data: '2026-08-01',
        status: 'recusado', postadaPor: 'Fábio Omena',
        evidencia: '"Henio; sem i.e e com restrição. reprovado" (10:35)',
    },
    {
        nome: 'Gabriel Licinio Holanda Peruchi', data: '2026-08-01',
        status: 'recusado', postadaPor: 'Fábio Omena',
        evidencia: '"Cliente: GABRIEL LICINIO HOLANDA PERUCHI Está inapto, única opção pra ele é a vista, caso contrário não será aceita a venda." (11:04)',
    },
    {
        nome: 'Braz de Oliveira Bueno', data: '2026-08-01', uf: 'PA',
        status: 'aprovado', ressalva: true, postadaPor: 'Fábio Omena', origemLead: 'Base Unificada Leads (Bula/FdB)',
        evidencia: '"BRAZ DE OLIVEIRA da pra vender com cautela" + "1 ou 2 lotes" (10:50) → "Lead direcionado para Douglas Bispo" (10:51)',
    },
    {
        nome: 'Geniuce', cpf: '53.748.659/0001-07', data: '2026-08-01',
        status: 'pendente', postadaPor: 'Fábio Omena',
        evidencia: '"teve 4 CNPJs… a atividade principal era hortaliças… averiguar melhor" (Guilherme Galassi, 11:25)',
    },
    {
        nome: 'Hélio Mascarenhas Rocha', cpf: '872.581.533-49', uf: 'MA', data: '2026-08-01',
        status: 'recusado', postadaPor: 'João Antônio', origemLead: 'Landing São Geraldo',
        anexo: 'CNH-e (11:21) — o texto só dizia "mais um aqui"',
        evidencia: '"nao possui i.e; score razoável" (10:33). Lead de 29/07 17:58 pela Landing São Geraldo, atendido por João Antônio; a planilha marca CADASTRO REPROVADO.',
    },
    {
        nome: 'Dienifer', data: '2026-08-01',
        status: 'recusado',
        evidencia: '"DIENIFER Score 387 Restrições baixas R$ 1297,00 IE não compatível com produção rural. Não possui área própria. Inapta"',
    },
    {
        nome: 'Davison Avelino Gomes Pinto', cpf: '161.913.818-24', uf: 'SP', data: '2026-08-01',
        status: 'aprovado', postadaPor: 'Marcelo Carneiro', origemLead: 'Landing São Geraldo',
        anexo: 'Consulta CADESP (I.E. 553.069.393.114, Porangaba/SP) postada 11:35',
        evidencia: '"DAVISON AVELINO GOMES PINTO cadastro bom" · direcionado para Fábio Omena. Lead de 31/07 20:45 pela Landing São Geraldo.',
    },
    {
        nome: 'Fabio Rafael da Cunha Silva', cpf: '118.141.576-46', uf: 'MG', data: '2026-08-01',
        status: 'aprovado', postadaPor: 'Marcelo Carneiro', origemLead: 'Meta — LEADS - SAO GERALDO',
        anexo: 'Comprovante de Inscrição Estadual de Produtor Rural MG 003949850.00-96 (Muquém/Cachoeira, Grão Mogol) postado 11:10',
        evidencia: '"cadastro ok Fabio" (11:13) → "Direcionado para Leonardo Serafim" (11:15). Lead de 01/08 07:47 pela campanha São Geraldo.',
    },
    {
        nome: 'Carlos Augusto dos Santos Sousa', cpf: '942.300.993-04', ie: '12.825307-0', data: '2026-08-01',
        status: 'aprovado',
        evidencia: '"esse cpf consultamos semana passada, estava ok de score"',
    },
    {
        nome: 'Lucilia Lelis Pereira Mardegan', cpf: '831.457.109-15', uf: 'PR', data: '2026-08-01',
        status: 'aprovado',
        evidencia: '"cadastro bom dela.. aqui tem duas i.e" → "ta apto então?" → "sim senho"',
    },
    {
        nome: 'Adonício Tomé de Souza', cpf: '663.892.678-00', data: '2026-08-01',
        status: 'aprovado',
        evidencia: '"liberado, sem pendências ou restrições"',
    },
    // ── 02/08 ────────────────────────────────────────────────────────────────
    {
        nome: 'Derek Danesi do Nascimento', cpf: '014.402.933-25', uf: 'MA', data: '2026-08-02',
        status: 'pendente', postadaPor: 'Marcelo Carneiro', grupo: 'Programa',
        anexo: 'Selfie com CNH + "DOCUMENTAÇÃO_FAZENDA ACONCHEGO.pdf" (11:30/11:31)',
        evidencia: 'Ficha completa postada no grupo da Programa; nenhuma resposta registrada até 26/08.',
    },
    {
        nome: 'Delvanio Ivo de Almeida', cpf: '038.047.746-79', uf: 'MG', data: '2026-08-02',
        status: 'pendente', postadaPor: 'Fábio Omena', grupo: 'Remates',
        anexo: 'Cartão com dados (Faz. Palmeira/Felisburgo, Insc. 002032204.00-86) postado 09:38',
        evidencia: 'Ficha postada; nenhuma resposta registrada.',
    },
    // ── 05/08 ────────────────────────────────────────────────────────────────
    {
        nome: '(consulta 883.074.173-68)', cpf: '883.074.173-68', data: '2026-08-05',
        status: 'pendente', postadaPor: 'João Antônio',
        evidencia: '"esse o CPF dele, bom dar uma consultada para ver se vale a pena né" (08:54) → "vai usar I.E de um amigo… se averiguar certo e ver essa i.e talvez dê pra liberar" — pendia de termo de autorização',
    },
    {
        nome: 'Adonício Tomé de Souza (lead entrou como "Tarcisio Tomé de Souza")', cpf: '663.892.678-00', uf: 'BA', data: '2026-08-01',
        status: 'aprovado', postadaPor: 'Marcelo Carneiro', grupo: 'Remates',
        origemLead: 'Meta — LEADS - SAO GERALDO',
        anexo: 'nenhum — I.E. e CPF em texto',
        evidencia: '"I.E 101.948.287 PR. Veja essa inscrição aí" (12:17) → "663.892.678-00" / "Adonício Tomé de Souza" (12:21) → "liberado, sem pendencias ou restrições" (12:24). ⚠ IDENTIFICADO em 01/09: o lead do São Geraldo de 01/08 06:36 entrou como "Tarcisio Tomé de Souza", e-mail tarcisio.comercialtome@hotmail.com, telefone (75) 9129-3775. O AgRisk não tem nenhum Tarcisio Tomé de Souza; tem o Adonício, consultado em 01/08 — mesmo dia — com e-mail comercialtome@hotmail.com e telefone (75) 99129-3944, e os sete endereços na BAHIA. Mesma caixa comercial, mesmo DDD, mesma UF, mesmo dia.',
    },
    // ── 09/08 ────────────────────────────────────────────────────────────────
    {
        nome: 'Rafael Falci Pereira de Mello', cpf: '695.248.36-75', data: '2026-08-09',
        status: 'aprovado',
        evidencia: '"Rafael Falci Pereira de Mello - OK. 1 LOTE" (consulta para 1 lote no Paranã)',
    },
    // ── 11/08 ────────────────────────────────────────────────────────────────
    {
        nome: 'Ruy de Freitas Lima', cpf: '865.466.351-00', uf: 'MT', data: '2026-08-11',
        status: 'aprovado', postadaPor: 'Douglas Bispo', origemLead: 'Landing Touros',
        anexo: 'CNH-e + Saldo INDEA-MT da Fazenda Rainha da Mata (Rondonópolis, 94 bovinos) + fatura Energisa, 18:05',
        evidencia: '"Score bom e sem protesto/restrição" + "Tem IE" (duas) → "Vou direcionar para o Leozinho atender ele e colocar no leilão de amanhã" (18:19). Lead de 11/08 16:09 pela Landing Touros, atendido por Douglas; a planilha marca CADASTRO OK.',
    },
    {
        nome: 'Adriano de Oliveira', cpf: '013.105.811-85', uf: 'MT', data: '2026-08-11',
        status: 'aprovado', ressalva: true, postadaPor: 'Fábio Omena',
        anexo: 'CNH (Cuiabá/MT) postada 18:24 — era este o "cliente com negativação baixa", não uma segunda pessoa',
        evidencia: '"tem uma negativação mas é valor baixo… E tem IE ativa, duas" (18:26) e, no resumo do dia, "Sabalanga / Omena / 1. ADRIANO DE OLIVEIRA CPF: 013.105.811-85 Serasa: 715 Terra: 7 ha MT Status: aprovado Crédito sugerido: R$ 61.525,00"',
    },
    // ── 12/08 ────────────────────────────────────────────────────────────────
    {
        nome: 'Tiago de Alencar Brito', cpf: '022.056.323-37', uf: 'PI', data: '2026-08-12',
        status: 'aprovado', ressalva: true, postadaPor: 'Fábio Omena',
        anexo: 'CNH (Teresina/PI) + "TIAGO GTA.pdf", 13:03',
        evidencia: '"TIAGO DE ALENCAR BRITO CPF 022.056.323-37 Serasa: 800 Não tem IE" → "Então aprovado. IE ele não tem" (dados de GTA no lugar)',
    },
    {
        nome: 'Handerson Soares Arruda Oliveira', cpf: '027.700.781-00', uf: 'TO', data: '2026-08-12',
        status: 'recusado', postadaPor: 'Douglas Bispo', origemLead: 'Landing Fêmeas — Funil Perpétuo',
        anexo: 'CNH-e + BIC da Fazenda Prata (Chácara Arruda), 21:00/21:01',
        evidencia: '"Ruim viu.. / Risco de inadimplência" (13/08 08:12) → "Reprovado" (08:40). Lead de 12/08 19:58 pela Landing Fêmeas; a planilha marca CADASTRO REPROVADO.',
    },
    // ── 13/08 ────────────────────────────────────────────────────────────────
    {
        nome: 'Geovane Gonçalves Pereira', cpf: '081.435.465-35', data: '2026-08-13',
        status: 'recusado',
        evidencia: '"Alta probabilidade de inadimplência e sem IE: Reprovado" (12:03)',
    },
    {
        nome: 'Bruna Alaise Silva Oliveira Arruda', cpf: '016.987.171-13', uf: 'TO', data: '2026-08-13',
        status: 'aprovado', ressalva: true, postadaPor: 'Douglas Bispo', origemLead: 'Landing Fêmeas — Funil Perpétuo',
        anexo: 'Carteira do CRC-TO (contadora) postada 12:22 — é a esposa do Handerson, reprovado na véspera',
        evidencia: '"Score bom" + "Consta sem IE" → "Mas ela como contadora deve dar um jeito, faz IE fácil" → "Aprovado com esse apontamento" (13:23). Compra em nome dela usando a I.E. dele como terceiro.',
    },
    {
        nome: '(consulta 181.417.416-83)', cpf: '181.417.416-83', data: '2026-08-13',
        status: 'pendente',
        evidencia: '"Score: 641 IE: Não tem" (20:44) — sem veredito registrado',
    },
    {
        nome: 'Marco Antonio de Brito Santos', cpf: '605.056.543-00', uf: 'MA', data: '2026-08-13',
        status: 'recusado', postadaPor: 'Marcelo Carneiro',
        anexo: 'RG + SINTEGRA-MA (M A DE BRITO SANTOS, I.E. 12.963257-0, habilitado) postados 20:54, com a legenda "Cadastro lead do grupo"',
        evidencia: '"Tem IE e apareceu que não possui Score (nao entendi)" (21:32) → "Fria" → "Reprovado 🚨" (21:35)',
    },
    {
        nome: 'Claudio Rogerio Rocha Junior', cpf: '069.936.429-99', uf: 'SP', data: '2026-08-13',
        status: 'pendente', postadaPor: 'Marcelo Carneiro',
        anexo: 'CNH postada 20:54 com a legenda "Cadastro"',
        evidencia: 'Ficha postada junto com a do Marco Antonio; o único veredito daquela noite fala em "Tem IE", que é o caso do Marco Antonio. Sem resposta própria até 26/08.',
    },
    // ── 14/08 ────────────────────────────────────────────────────────────────
    {
        nome: '(cadastro Expogenética)', data: '2026-08-14',
        status: 'pendente',
        evidencia: '"Score ótimo, sem IE" (10:29) — encaminhado para o grupo da PL, que decide os leilões da Expogenética. Sem anexo capturado.',
    },
    {
        nome: 'Farley Azevedo Oliveira', cpf: '029.636.736-20', uf: 'MG', data: '2026-08-14',
        status: 'aprovado', postadaPor: 'Fábio Omena', grupo: 'Programa', leilao: 'Terra Brava',
        anexo: 'Inscrição de Produtor Rural MG 001279570.00-50 (Fazenda Nova Era), 13:58',
        evidencia: 'Ficha postada 13:58 → "ok" (16:21). Comprou 2 lotes (R$ 54.000) no Terra Brava no dia seguinte.',
    },
    // ── 15/08 ────────────────────────────────────────────────────────────────
    {
        nome: 'Osiel Fernandes Silva', cpf: '047.351.144-40', data: '2026-08-15',
        status: 'recusado', postadaPor: 'Fábio Omena', grupo: 'Programa',
        evidencia: '"Diz osiel que já tem cadastro" (08:15) → "não possui IE" (12:17)',
    },
    {
        nome: 'Francisco Marcos Araruna', cpf: '625.326.507-53', data: '2026-08-15',
        status: 'aprovado', postadaPor: 'Fábio Omena', grupo: 'Programa',
        evidencia: '"Francisco Marcos Araruna 625.326.507-53 / Pfv" (13:37) → "ok" (13:46)',
    },
    // ── 18/08 ────────────────────────────────────────────────────────────────
    {
        nome: 'Francisco Aluízio de Faria', cpf: '085.584.344-68', uf: 'RN', data: '2026-08-18',
        status: 'aprovado', ressalva: true, postadaPor: 'Douglas Bispo', grupo: 'Programa + Remates',
        origemLead: 'Meta — LEADS - FORMS INST EAO — Cópia',
        anexo: 'CNH (Caicó/RN) + inscrição de produtor, postadas 08:35 nos dois grupos',
        evidencia: '"Não dá p valores alto, no máximo 1.000,00 por parcela" (11:42). Lead de 09/07 pela campanha EAO — campanha já encerrada em agosto.',
    },
    // ── 19/08 ────────────────────────────────────────────────────────────────
    {
        nome: '(consulta 1 de 19/08)', data: '2026-08-19', grupo: 'Remates',
        status: 'recusado',
        evidencia: '"Tem IE mas baixo score e muitos apontamentos, reprovado" (11:18) — ficha encaminhada de outra conversa, sem anexo capturado e sem nome no texto',
    },
    {
        nome: '(consulta 2 de 19/08)', data: '2026-08-19', grupo: 'Remates',
        status: 'aprovado',
        evidencia: '"Score razoável (692), possui IE, aprovado ✅" (11:47) — mesma situação: sem anexo, sem nome. Pode ser o lead "Mauro" (GO, 19/08, Pedro Pereira), que a planilha marca CADASTRO OK.',
    },
    {
        nome: 'Geraldo Majela de Brito', cpf: '363.246.476-68', uf: 'MG', data: '2026-08-19',
        status: 'recusado', postadaPor: 'Fábio Omena', grupo: 'Programa',
        evidencia: '"Geraldo Majela de Brito CPF 363.246.476-68 / Nova Serrana-MG" (13:06) → "Não aprovado" (13:33). Comprou R$ 75.000 no Naviraí Camparino em 23/08 assim mesmo.',
    },
    // ── 20/08 ────────────────────────────────────────────────────────────────
    {
        nome: 'Epitacio Garcia Neto', cpf: '036.349.991-10', uf: 'MS', data: '2026-08-20',
        status: 'aprovado', postadaPor: 'Luana Cruz', grupo: 'Remates + Programa',
        origemLead: 'Meta — LEAD - PERPETUO TOURO',
        anexo: 'CNH (Campo Grande/MS) postada 18:43 no Remates e 18:49 na Programa',
        evidencia: '"Cliente interessado em Touro, para o leilão de domingo" (18:43) → "Ok com a programa, direcionar para Leonardo" (19:26). Lead de 20/08 16:29; a planilha marca CADASTRO OK.',
    },
    {
        nome: 'Wandeilson Dias Sabino', uf: 'TO', data: '2026-08-20',
        status: 'aprovado', postadaPor: 'Luana Cruz', grupo: 'Remates + Programa',
        origemLead: 'Meta — LEAD - PERPETUO TOURO',
        anexo: 'NF-e de produtor rural TO (I.E. 29.466.645-1), postada junto com a do Epitacio',
        evidencia: 'Segundo dos "dois clientes para cadastro" enviados por Luana em 20/08. Lead de 20/08 14:37; a planilha marca CADASTRO OK.',
    },
    // ── 21/08 ────────────────────────────────────────────────────────────────
    {
        nome: 'Carolina Freitas Alencar', cpf: '080.929.594-63', uf: 'SE', data: '2026-08-21',
        status: 'aprovado', ressalva: true, postadaPor: 'Fábio Omena', grupo: 'Programa', leilao: 'Naviraí e Camparino',
        anexo: 'Dois contracheques (médica, Canindé de São Francisco e Gracho Cardoso/SE) + CNH, 10:01',
        evidencia: '"Pode consultar por favor / Naviraí E Camparino" (10:01) → "Ok - 1 lote" (10:31)',
    },
    {
        nome: 'Fabricio Mendanha de Mattos', cpf: '014.304.581-43', uf: 'GO', data: '2026-08-21',
        status: 'pendente', postadaPor: 'Fábio Omena', grupo: 'Programa', leilao: 'Naviraí e Camparino',
        anexo: 'CNH (Goiânia/GO) + print da Fazenda Cachoeirinha + documento fiscal, 14:09',
        evidencia: '"Cadastro Naviraí e Camparino 👆, por favor" (14:10) → "qual contato?" (15:51) → "Amiga esse deu rock?" (16:44). Sem veredito.',
    },
    {
        nome: 'Itamar José de Almeida', cpf: '136.023.491-87', uf: 'GO', data: '2026-08-21',
        status: 'recusado', postadaPor: 'Douglas Bispo', grupo: 'Programa + Remates',
        origemLead: 'Base Unificada Leads (Bula/FdB)',
        anexo: 'CNH (Goiânia/GO) + print do cadastro da Fazenda Samara (São Félix do Xingu/PA), 19:14 e 19:36',
        evidencia: '"Score muito bom mas não tem IE / 892" (Remates 19:46) → "Não autorizado. Não possui Inscrição Estadual" (Programa 19:47)',
    },
    // ── 22/08 ────────────────────────────────────────────────────────────────
    {
        nome: 'Marcionei Luiz dos Santos', cpf: '802.873.879-68', uf: 'PR', data: '2026-08-22',
        status: 'aprovado', ressalva: true, postadaPor: 'Luana Cruz', grupo: 'Programa',
        origemLead: 'Meta — LEAD - PERPETUO TOURO',
        anexo: 'CNH Digital postada 13:14, mais documento pessoal e contato às 14:03',
        evidencia: '"Nome: Marcionei Luiz dos Santos / IE: 95948128-80 / CPF: 802.873.879-68" (12:01) → "não tem cadastro" (12:37) → "Realizar cadastro, por favor!" → "Para fazer o cadastro precisa do documento pessoal e contato" (13:08) → docs às 14:03 com "Consulta por favor" → "ok" (14:12) e "ok - 1.000,00 limite mensal" (14:13). ⚠ CORRIGIDO em 01/09: a primeira leitura parou no "não tem cadastro" e o marcou pendente. O "não tem cadastro" respondia se ele JÁ ERA cadastrado; o cadastro foi criado e aprovado uma hora depois, com limite. A planilha estava certa.',
    },
    {
        nome: 'Uendel Moreira Lino', cpf: '847.737.583-68', uf: 'PI', data: '2026-08-22',
        status: 'aprovado', ressalva: true, postadaPor: 'Fábio Omena', grupo: 'Programa',
        anexo: 'Ficha cadastral SEFAZ-PI (I.E. 19.712.486-0, Faz. Santo Expedito, Corrente/PI) + DANFE, 14:03',
        evidencia: '"Consulta por favor" (14:03) → "ok" (14:12) e "ok - 1.000,00 limite mensal" (14:13)',
    },
    {
        nome: 'Mauro Ribeiro Rodrigues', cpf: '231.834.701-87', uf: 'GO', data: '2026-08-19',
        status: 'aprovado', postadaPor: 'Pedro Pereira', grupo: 'Remates',
        origemLead: 'Meta — LEAD - PERPETUO TOURO',
        anexo: 'nenhum — a consulta foi encaminhada sem nome no texto',
        evidencia: '"Score razoável (692), possui IE, aprovado ✅" (11:47), sem nome nem CPF na mensagem. ⚠ IDENTIFICADO em 01/09 pelo AgRisk: o CPF 231.834.701-87 está lá como MAURO RIBEIRO RODRIGUES, de Caldazinha/GO, consultado em 19/08/2026 — o mesmo dia do lead (19/08 00:07) que o Pedro atendeu e marcou CADASTRO OK. Sem o AgRisk esta ficha era anônima e ficava fora da conta.',
    },
    // ── 23/08 ────────────────────────────────────────────────────────────────
    {
        nome: 'Raquel Sousa da Silva', cpf: '073.631.421-06', uf: 'TO', data: '2026-08-23',
        status: 'pendente', postadaPor: 'Fábio Omena', grupo: 'Programa', leilao: 'Patrocinado Terra',
        anexo: 'CNH (Palmas/TO) postada 10:49 + print da negociação (lance de R$ 1.700 a R$ 2.000)',
        evidencia: '"Raquel Sousa da Silva / 07363142106 / Consulta pfv" (10:25) → "sem cadastro" (10:46) → "Não localizei a ie" (10:56) → "Solicitei aqui" (11:00)',
    },
    {
        nome: 'Agropecuária Pernambuco Ltda (Agropecuária GP)', cpf: '33.328.046/0001-93', uf: 'PA', data: '2026-08-23',
        status: 'aprovado', postadaPor: 'Luana Cruz', grupo: 'Programa + Remates',
        origemLead: 'Meta — LEAD - PERPETUO TOURO',
        anexo: 'Cartão CNPJ (AGROPECUARIA PERNAMBUCO LTDA, Marabá/PA), 11:12 e 11:13',
        evidencia: '"gostaria de saber se esse cliente tem cadastro" (11:13) → "Cadastro ok" (Programa 11:25); no Remates "Liberou / Lá na PL" (14:11). Lead "Agropecuária Pernambuco" de 20/08 12:10, PA, DDD 81 — o mesmo do cartão CNPJ.',
    },
    // ── 24/08 ────────────────────────────────────────────────────────────────
    {
        nome: '(cliente MS do Leilão São José)', cpf: '010.189.701-42', ie: '288285883', uf: 'MS', data: '2026-08-24',
        status: 'aprovado', grupo: 'Remates', leilao: 'São José (Bula Remates)',
        evidencia: '"01018970142 / CPF / 288285883 / IE / Consulta para Leilão São José da Bula Remates, cliente do MS" (23:07) → "cadastro ok!" (25/08 10:20). Sem anexo: os dados vieram digitados.',
    },
    // ── 25/08 ────────────────────────────────────────────────────────────────
    {
        nome: 'Alexandre Saraiva de Morais', cpf: '455.831.614-34', uf: 'PE', data: '2026-08-25',
        status: 'pendente', postadaPor: 'Fábio Omena', grupo: 'Programa', leilao: 'Matinha',
        anexo: 'CNH digital (PE) + documento, 11:20',
        evidencia: '"cadastro do leilao matinha" (11:20) — sem veredito até 26/08',
    },
]

/** Equipe de marketing: a ficha que sai da mão dessas pessoas nasce de lead. */
export const EQUIPE_MARKETING = ['Douglas Bispo', 'Marcelo Carneiro', 'Pedro Pereira', 'Luana Cruz', 'João Antônio']
/** Assessores comerciais: ficha deles é carteira própria, não é funil de mídia. */
export const ASSESSORES_COMERCIAIS = ['Fábio Omena', 'Leonardo Serafim']

export const IDENTIFICAVEIS = CADASTROS_AGOSTO.filter(c => !/^\(/.test(c.nome)).length
/** Submissões com lead casado na planilha ou no CRM. */
export const COM_LEAD = CADASTROS_AGOSTO.filter(c => c.origemLead)
