// APURAÇÃO DOS CADASTROS APROVADOS NOS GRUPOS DAS LEILOEIRAS (31/07/2026).
//
// Fonte única dos dois relatórios:
//   • scripts/gera-relatorio-cadastros-aprovados-grupos-2026-07-31.mjs (visão geral)
//   • scripts/gera-relatorio-por-assessor-2026-07-31.mjs (uma carteira por assessor)
//
// A leitura das aprovações é MANUAL e está declarada aqui de propósito: no grupo
// a decisão vem em texto livre ("Fulano - OK", "Apto", "cadastro bom"), quase
// sempre citando a ficha, e não existe parser que dê conta sem inventar. Cada
// linha carrega a frase que a sustenta para o chefe conferir. Fontes cruzadas:
// transcrição dos grupos (whatsapp_messages + operational_items, 08/07 a 31/07),
// cliente_leiloeira_cadastro, crm_leads e clientes.

/* ── regionalidade (espelho de src/lib/assessor-zona.ts) ─────────────────── */
export const UF_DO_ASSESSOR = {
    'Douglas Bispo': ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO', 'MA'],
    'Fábio Omena Gaia': ['AL', 'BA', 'CE', 'PB', 'PE', 'PI', 'RN', 'SE', 'ES', 'MG', 'RJ', 'SP'],
    'Leonardo Serafim': ['MS', 'MT', 'GO', 'DF', 'PR', 'RS', 'SC'],
}
export const ZONA_DO_ASSESSOR = {
    'Douglas Bispo': 'Norte + Maranhão',
    'Fábio Omena Gaia': 'Nordeste (exceto MA) + Sudeste',
    'Leonardo Serafim': 'Centro-Oeste + Sul',
}
export const ASSESSORES = Object.keys(UF_DO_ASSESSOR)
export const ASSESSOR_POR_UF = Object.fromEntries(
    Object.entries(UF_DO_ASSESSOR).flatMap(([a, ufs]) => ufs.map(uf => [uf, a])))
export const assessorPorUf = uf => ASSESSOR_POR_UF[String(uf || '').toUpperCase()] || null

/* ── 1. aprovados com decisão registrada no grupo ─────────────────────────
   `uf` + `ufFonte`: de onde saiu a região. `assessorForcado`: quando o próprio
   grupo direcionou ("Direcionado para Leonardo Serafim") — o direcionamento
   humano vale mais que a regra, e a divergência (se houver) vira observação. */
export const APROVADOS_GRUPO = [
    // ── Cadastros Bula e Programa (Programa Leilões) ──
    {
        cliente: 'Rulio Victor Pereira Oliveira', grupo: 'Programa', data: '10/07',
        evidencia: '"Rulio Victor Pereira Oliveira - Cadastro OK" (Sendy)',
        uf: 'MG', ufFonte: 'DDD 32 (lead sem UF no cadastro)', fone: '(32) 99928-2299',
        obs: 'Confirmar UF da propriedade.',
    },
    {
        cliente: 'Hélio Gomes Silva', grupo: 'Programa', data: '10/07',
        evidencia: 'Decisão gravada no sistema por Márcia Lourenço (canal WhatsApp)',
        uf: 'MG', ufFonte: 'cadastro — Almenara/MG', cidade: 'Almenara', fone: '(33) 9911-8244',
        cpf: '308.160.686-15', obs: '',
    },
    {
        cliente: 'Thomas Bianchine', grupo: 'Programa', data: '10/07',
        evidencia: 'Decisão gravada no sistema por Márcia Lourenço (canal WhatsApp)',
        uf: 'ES', ufFonte: 'cadastro do lead + DDD 28', fone: '(28) 98112-2802',
        cpf: '124.448.947-66', obs: '',
    },
    {
        cliente: 'Luiz do Couro — Faz. Malhada Bonita', grupo: 'Programa', data: '11/07',
        evidencia: '"Cadastro ok" (Márcia Lourenço), respondendo ao pedido do Marcelo',
        uf: 'BA', ufFonte: 'cidade informada na mensagem', cidade: 'Pedro Alexandre',
        obs: 'Identificado por apelido — levantar nome completo e CPF.',
    },
    {
        cliente: 'Márcio de Vasconcelos Martins', grupo: 'Programa', data: '12/07',
        evidencia: '"Marcio De Vasconcelos Martins - OK" (Sendy)',
        uf: 'RO', ufFonte: 'cadastro — Ariquemes/RO', cidade: 'Ariquemes', fone: '(69) 9970-2922',
        cpf: '005.915.269-99', obs: 'Já está em CLIENTES com o Douglas.',
    },
    {
        cliente: 'Edilberto Pereira Sarubi', grupo: 'Programa', data: '12/07',
        evidencia: '"Edilberto Pereira Sarubi - OK" (Sendy)',
        uf: null, ufFonte: 'sem UF na base',
        obs: 'Existe um "Gilberto Pereira Sarubi" em Oriximiná/PA — checar se é da mesma família antes de alocar.',
    },
    {
        cliente: 'José Luiz Antunes', grupo: 'Programa', data: '16/07',
        evidencia: 'Dados enviados 19:37 + "Ok" (Márcia Lourenço); consta aprovado na lista da leiloeira',
        uf: 'MG', ufFonte: 'cadastro — Itaúna/MG', cidade: 'Itaúna', fone: '(37) 99830-6969',
        cpf: '497.646.836-49', obs: '',
    },
    {
        cliente: 'Marcelo Augusto Gomes Cataldo', grupo: 'Programa', data: '16/07',
        evidencia: 'Ficha com SERASA 779 enviada 19:50 + "Ok" (Márcia Lourenço); consta aprovado na lista',
        uf: 'MG', ufFonte: 'cadastro — Sete Lagoas/MG', cidade: 'Sete Lagoas', fone: '(31) 99515-8400',
        cpf: '971.643.056-68', obs: 'Duplicado em CLIENTES (um registro com o Leonardo, outro com o Fábio) — unificar.',
    },
    {
        cliente: 'José Aladino Barbosa dos Santos', grupo: 'Programa', data: '18/07',
        evidencia: '"Jose Aladino Barbosa dos Santos - ok" (Juliane Safra)',
        uf: null, ufFonte: 'não está na base', obs: 'Já é cliente Guadalupe — puxar a UF de lá.',
    },
    {
        cliente: 'João Carlos Viana Bregantini', grupo: 'Programa', data: '19/07',
        evidencia: '"João Carlos Viana Bregantini - ok" (Juliane Safra)',
        uf: null, ufFonte: 'não está na base', obs: 'Cadastro pedido pelo Leonardo no grupo.',
    },
    {
        cliente: 'Ejamal Muhd Shihadeh Khalil', grupo: 'Programa', data: '20/07',
        evidencia: '"Ejamal Muhd Shihadeh Khalil - ok" (Sendy)',
        uf: 'PR', ufFonte: 'Fazenda Terra Rica/PR informada no grupo', fone: '(44) 99855-7380',
        obs: 'Já está em CLIENTES com o Leonardo.',
    },
    // ── Cadastros Bula Remates ──
    // Os nomes abaixo saíram dos PRÓPRIOS documentos postados no grupo (CNH,
    // FIC/IE, CAP, CAR, print do AgRisk), lidos em 01/08: o texto das mensagens
    // só trazia primeiro nome ou CPF solto.
    {
        cliente: 'Valquiria Soares Montel', grupo: 'Remates', data: '24/07',
        evidencia: '"Mandei para deixar salvo no grupo, ambos aprovados"',
        uf: 'TO', ufFonte: 'CNH-e do Tocantins anexada no grupo', cpf: '029.192.851-06',
        assessorForcado: 'Douglas Bispo',
        obs: 'Filiação: Vicente Pereira Montel — é dele o "Exploração Pecuária-vicente.pdf" que acompanhou a ficha. Sem telefone em lugar nenhum.',
    },
    {
        cliente: 'Valdy Junior Correia Evangelista — Faz. V B', grupo: 'Remates', data: '24/07',
        evidencia: '"Mandei para deixar salvo no grupo, ambos aprovados"',
        uf: 'TO', ufFonte: 'FIC da SEFAZ-TO anexada no grupo', assessorForcado: 'Douglas Bispo',
        obs: 'I.E. 29.410.324-4 · Loteamento Javaezinho, Faz. Araguaia, zona rural. A ficha anexada está vencida (validade 07/10/2009) — pedir a atualizada. Sem telefone.',
    },
    {
        cliente: 'Hermann Gomes Sarmento — Rancho da Estiva', grupo: 'Remates', data: '25/07',
        evidencia: 'Score 908 · sem restrições · I.E. 12 anos · 129 ha próprios — "Apto"',
        uf: 'MG', ufFonte: 'comprovante de I.E. de produtor rural (SEF-MG)', cidade: 'Rio Pomba',
        cpf: '066.349.976-32', assessorForcado: 'Leonardo Serafim',
        obs: '⚠ I.E. 002199120.00-56, ativa desde 07/08/2013 (bate com os "12 anos"). Zona de MG é do Fábio, mas o grupo direcionou ao Leonardo — confirmar. Sem telefone.',
    },
    {
        cliente: 'Idelson Peres Pereira — Faz. Rincão', grupo: 'Remates', data: '25/07',
        evidencia: 'Score 840 · sem restrições · I.E. 3 anos · 222 ha próprios — "Apto"',
        uf: 'MS', ufFonte: 'consulta de I.E. postada no grupo', cidade: 'Coxim',
        cpf: '898.941.541-15',
        obs: 'I.E. 28.850.606-5 (gado bovino, habilitado). No grupo foi "direcionado para Nane" (leiloeira) — pela zona é do Leonardo. Sem telefone.',
    },
    {
        cliente: 'Sidiney Thomaz Neto', grupo: 'Remates', data: '25/07',
        evidencia: 'Score 900 · sem restrições · I.E. 15 anos · 62 ha próprios — "Apto"',
        uf: 'MS', ufFonte: 'CNH emitida em Campo Grande/MS', cidade: 'Campo Grande',
        cpf: '502.154.691-00',
        obs: '⚠ Logo depois: "a I.E. não é do ramo" — a I.E. 28.736.486-0 precisa ser conferida antes de tratar como habilitado. Sem telefone.',
    },
    {
        cliente: 'Neuza das Graças Sousa — Faz. Paraíso', grupo: 'Remates', data: '25/07',
        evidencia: 'Score 697 · sem protestos · I.E. 1 ano · 66 ha próprios — "Apta"',
        uf: 'PA', ufFonte: 'FIC da SEFA-PA postada no grupo', cidade: 'Altamira',
        cpf: '794.409.836-04',
        obs: 'I.E. 75.014.542-0, ativa desde 11/03/2025 (bate com o "1 ano"). Bovinos de corte + milho e soja. Sem telefone.',
    },
    {
        cliente: 'Cliente consultado a pedido do Douglas (sem nome no grupo)', grupo: 'Remates', data: '28/07',
        evidencia: '"cadastro bom!" → "Passei para o Serafim"',
        uf: null, ufFonte: 'não informada', assessorForcado: 'Leonardo Serafim',
        obs: 'Identificar o cliente com o Douglas.',
    },
    {
        cliente: 'Marcus André Madeira Campos Almeida — Faz. Santa Helena', grupo: 'Remates', data: '30/07',
        evidencia: '"opa cadastro bom" · score 890/1000',
        uf: null, ufFonte: 'não está na base', cpf: '756.698.113-72',
        obs: 'Contato conhecido: marcusmadeira@yahoo.com.br. Cadastrar — veio por e-mail e I.E. em PDF, sem telefone.',
    },
    {
        cliente: 'Trajano Pinheiro', grupo: 'Remates', data: '30/07',
        evidencia: '"score bom, cadastro ok!" (citando a ficha do CPF)',
        uf: 'MG', ufFonte: 'print do AgRisk no grupo: 3 I.E. ativas em MG', cidade: 'Guanhães',
        cpf: '013.447.456-28', fone: '(31) 99109-9513', assessorForcado: 'Leonardo Serafim',
        obs: '⚠ E-mail trajanopinheiroadv@gmail.com. I.E. ativas: Córrego da Fartura/Ipê, São Francisco e São Francisco 2 (leite e corte) — a de corte tem 0 ano. Zona de MG é do Fábio, mas o grupo direcionou ao Leonardo.',
    },
    {
        cliente: 'Laércio José Oliveira Almeida', grupo: 'Remates', data: '31/07',
        evidencia: '"cadastro bom, aprovado" (citando a ficha)',
        uf: null, ufFonte: 'não está na base', cpf: '465.863.346-91', assessorForcado: 'Leonardo Serafim',
        obs: 'I.E. 0011334910025. Grupo direcionou: "Direcionado para Leonardo Serafim".',
    },
    // ── 2ª leva: tarde de 31/07 e manhã de 01/08, só no grupo da Remates ──
    {
        cliente: 'Altair Cacho — Faz. Terra Preta', grupo: 'Remates', data: '31/07',
        evidencia: 'Consulta feita pelo João → "Top" → "Direcionado para Leonardo Serafim"',
        uf: 'MS', ufFonte: 'CAP da SEFAZ-MS anexado no grupo', cidade: 'Guia Lopes da Laguna',
        cpf: '142.395.151-49', assessorForcado: 'Leonardo Serafim',
        obs: '⚠ CAP 28.598.468-3, ativo desde 12/11/2025; cônjuge Lucimara Batista Rovari. Aprovação implícita (não houve "apto" escrito) e, na mesma conversa, o grupo comentou "esse aí é o Galdino, tentou comprar no Hipólito, liberou à vista e está dando b.o." — checar se é do mesmo cadastro antes de liberar parcelado.',
    },
    {
        cliente: 'Hênio Suassuna Ferreira — Faz. Várzea da Carnaúba', grupo: 'Remates', data: '31/07',
        evidencia: '"Henio aprovado" + ficha de Guilherme Galassi: Score 762 · sem restrições · I.E. 3 anos (documento enviado) · 600 ha próprios — "Apto"',
        uf: 'PB', ufFonte: 'FIC da SER-PB: fazenda em Santa Cruz/PB (titular reside em Pau dos Ferros/RN)',
        cidade: 'Santa Cruz', fone: '(84) 99990-0070', cpf: '021.928.644-26',
        assessorForcado: 'Fábio Omena Gaia',
        obs: 'I.E. 16.471.845-1, produtor rural desde 28/07/2023. NÃO é ele o "Henio reprovado" de 01/08 — aquele é o Hênio Pablo Farias Silva, de Malhada/BA. A leiloeira pediu conferir mapa de frete (Paraíba).',
    },
    {
        cliente: 'Marusan Mendes de Souza', grupo: 'Remates', data: '31/07',
        evidencia: '"Marusan aprovado" → Marcelo: "já está com Leonardo Serafim, foi aprovado no Hipólito"',
        uf: null, ufFonte: 'não está na base', assessorForcado: 'Leonardo Serafim',
        obs: '⚠ Foi "não autorizado" na Programa em 14/07 e 20/07 (renda presumida baixa) — aprovado agora por outra leiloeira. Veio da revisão dos recusados pela PL.',
    },
    {
        cliente: 'Leandro Oliveira Rios Natal dos Santos — Faz. São Gabriel', grupo: 'Remates', data: '31/07',
        evidencia: '"Leandro aprovado" + ficha: Score 988 · sem restrições · I.E. 1 ano MG · sem área própria — "Apto"',
        uf: 'MG', ufFonte: 'comprovante de I.E. de produtor rural (SEF-MG)', cidade: 'Perdizes',
        cpf: '099.989.436-63', assessorForcado: 'Leonardo Serafim',
        obs: '⚠ I.E. 005024258.00-17, ativa desde 23/10/2024; matrícula 17.442; contrato até 01/10/2029 (área arrendada). Zona de MG é do Fábio, mas o grupo direcionou ao Leonardo. Sem telefone.',
    },
    {
        cliente: 'Rodrigo de Proença Oliveira Braga — R&B Pecuária', grupo: 'Remates', data: '31/07',
        evidencia: 'Ficha: Score 689 · sem restrições · I.E. 2 meses · sem área própria — "Apto"',
        uf: 'RJ', ufFonte: 'comprovante de inscrição da SEFAZ-RJ', cidade: 'Paty do Alferes',
        cpf: '097.622.257-40', assessorForcado: 'Fábio Omena Gaia',
        obs: '⚠ I.E. 16.355.89-5, concedida em 12/05/2026 (daí os "2 meses"). Na 1ª análise (31/07 de manhã, mesmo score 689) a consulta apontou "sem I.E. e um processo trabalhista de R$ 500 mil — talvez possa cilada"; na 2ª, com a I.E. em mãos, saiu "Apto". Vale checar o processo antes de parcelar.',
    },
    {
        cliente: 'Carlos Augusto dos Santos Sousa', grupo: 'Remates', data: '31/07',
        evidencia: 'Ficha: Score 900 · sem restrições · 139 ha imóvel próprio MA — "Apto"',
        uf: 'MA', ufFonte: 'imóvel próprio no MA citado na ficha', cpf: '942.300.993-04',
        obs: 'I.E. 12.825307-0. A confirmação da I.E. falhou porque o Maranhão bloqueia consulta no Sintegra — a leiloeira registrou que isso NÃO desabona.',
    },
    {
        cliente: 'Wellington Ferreira dos Santos', grupo: 'Remates', data: '01/08',
        evidencia: '"cadastro bom do wellington" → "Lead direcionado para Douglas Bispo"',
        uf: 'PA', ufFonte: 'print do AgRisk no grupo: I.E. ativa no PA', cpf: '820.500.232-00',
        fone: '(94) 99168-4800', assessorForcado: 'Douglas Bispo',
        obs: 'E-mail wf26051985@gmail.com. I.E. 15.994.117-2, ativa há 1 ano (bovinos de corte). Já estava na planilha de leads de TOUROS desde 10/07, atendido pelo João Antônio.',
    },
    {
        cliente: 'Braz de Oliveira Bueno — Faz. Santo Antônio', grupo: 'Remates', data: '01/08',
        evidencia: '"BRAZ DE OLIVEIRA dá pra vender com cautela — 1 ou 2 lotes"',
        uf: 'PA', ufFonte: 'lead na base — Curionópolis/PA (homônimo Braz de Oliveira Pinto é do MT)',
        cidade: 'Curionópolis', fone: '(94) 9913-2118', assessorForcado: 'Douglas Bispo',
        obs: '⚠ Aprovado COM LIMITE: 1 ou 2 lotes. E-mail faz-santoantonio@hotmail.com. Confirmar que é o Bueno e não o homônimo do MT.',
    },
    {
        cliente: 'Fabio Rafael da Cunha Silva — Muquém / Cachoeira', grupo: 'Remates', data: '01/08',
        evidencia: '"cadastro ok Fabio" (o "Fabio" da mensagem é o CLIENTE, não o assessor)',
        uf: 'MG', ufFonte: 'comprovante de I.E. de produtor rural (SEF-MG) postado no grupo',
        cidade: 'Grão Mogol', cpf: '118.141.576-46', assessorForcado: 'Leonardo Serafim',
        obs: '⚠ I.E. 003949850.00-96. Dois minutos depois o grupo escreveu "Direcionado para Leonardo Serafim" — mas MG é zona do Fábio Omena; confirmar. Sem telefone.',
    },
    {
        cliente: 'Geniuce (CNPJ 53.748.659/0001-07)', grupo: 'Remates', data: '01/08',
        evidencia: 'Análise de Guilherme Galassi: 5 CNPJs desde 1985 (4 baixados), sem dívidas · "tem I.E. ativa de corte, não está inapta"',
        uf: null, ufFonte: 'não informada', assessorForcado: 'Fábio Omena Gaia',
        obs: 'Liberado com recomendação: como não tem área própria, alinhar prazo de arrendamento × prazo da parcela (30 meses) antes de fechar. Quer dois touros.',
    },
    {
        cliente: 'Davison Avelino Gomes Pinto', grupo: 'Remates', data: '01/08',
        evidencia: '"DAVISON AVELINO GOMES PINTO — cadastro bom"',
        uf: null, ufFonte: 'não está na base', assessorForcado: 'Fábio Omena Gaia',
        obs: 'Grupo direcionou: "Direcionado para Fábio Omena".',
    },
]

/* ── Recusados / inaptos SÓ do grupo da Remates (para o relatório do grupo) ── */
export const NAO_APROVADOS_REMATES = [
    { cliente: 'Maria Sabrina Neta / neto (Galdino)', data: '31/07', motivo: 'Bloqueado com a leiloeira: "bloqueia até na assessoria, pra ninguém tentar vender em outra". CPF restrito, não consulta.' },
    { cliente: 'José Dias Dantas (CAD-8B5ED)', data: '28/07', motivo: 'RECUSADO — único cadastro submetido pela ficha automática no período' },
    { cliente: 'Denis Igor Silva Santos', data: '31/07', motivo: '23 anos e com restrição — reprovado' },
    { cliente: 'Hênio Pablo Farias Silva — Faz. Riacho Doce, Malhada/BA', data: '01/08', motivo: 'CPF 066.624.454-52 · "sem i.e e com restrição — reprovado". É ELE o "Henio reprovado", não o Hênio Suassuna: os documentos (CNH, CAR e certidão CIB da Faz. Riacho Doce) chegaram na noite de 31/07 pelo Fábio' },
    { cliente: 'Gabriel Licínio Holanda Peruchi', data: '01/08', motivo: 'INAPTO — "única opção pra ele é à vista, caso contrário não será aceita a venda"' },
    { cliente: 'Hélio (sobrenome não citado)', data: '01/08', motivo: 'Com restrições e protestos — reprovado' },
    { cliente: 'Dienifer', data: '01/08', motivo: 'INAPTA — Score 387, restrições de R$ 1.297, I.E. não compatível com produção rural, sem área própria' },
    { cliente: 'Cliente sem nome (manhã de 01/08)', data: '01/08', motivo: 'Não possui I.E.; score razoável — não aprovado' },
    { cliente: 'CNPJ aberto há 2 meses', data: '01/08', motivo: '"averiguar melhor" — sem decisão até o fechamento desta apuração' },
]

/* ── 2. aprovados que o sistema conhece pela LISTA DA LEILOEIRA (e-mail) ── */
export const APROVADOS_LISTA = [
    { cliente: 'Dirceu de Oliveira Valente', uf: 'RJ', cidade: 'Maricá', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates + Programa' },
    { cliente: 'Daniel Cunha Câmara', uf: 'GO', cidade: 'Rio Verde', atual: 'Leonardo Serafim', leiloeiras: 'Remates + Programa', obs: '⚠ Na Programa consta "Não autorizado" (14/07) — conferir qual vale.' },
    { cliente: 'Adeildo Duão de Oliveira', uf: 'MS', cidade: 'Jardim', atual: 'Leonardo Serafim', leiloeiras: 'Remates + Programa' },
    { cliente: 'Juliano Labiak', uf: 'MT', cidade: 'Nova Monte Verde', atual: 'Leonardo Serafim', leiloeiras: 'Remates + Programa' },
    { cliente: 'Amadeu Ferino de Medeiros', uf: 'RN', cidade: 'Lagoa Nova', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates + Programa' },
    { cliente: 'Marcelo Clemente Araújo', uf: 'PA', cidade: 'Novo Progresso', atual: 'João Antônio', leiloeiras: 'Remates + Programa' },
    { cliente: 'Edvaldo Lemos Fernandes Silva', uf: 'MG', cidade: 'Campos Altos', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates' },
    { cliente: 'Deiglames Oliveira Silva', uf: 'MA', cidade: 'Imperatriz', atual: 'Douglas Bispo', leiloeiras: 'Remates + Programa' },
    { cliente: 'Leonardo de Oliveira', uf: 'MG', cidade: 'Florestal', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates + Programa' },
    { cliente: 'Pedro Leão', uf: 'PB', cidade: 'Mulungu', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates' },
    { cliente: 'José Luiz Antunes', uf: 'MG', cidade: 'Itaúna', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates + Programa', obs: 'Mesmo cliente aprovado no grupo em 16/07.' },
    { cliente: 'Carlos Fernando Machado Junior', uf: 'ES', cidade: '—', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates' },
    { cliente: 'Antonio Francisco Slongo', uf: 'PR', cidade: '—', atual: 'Leonardo Serafim', leiloeiras: 'Remates + Programa' },
    { cliente: 'Octacilio Carlos Valcher', uf: 'ES', cidade: 'Viana', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates' },
    { cliente: 'Maxwell de Sousa e Silva de Carvalho', uf: 'TO', cidade: 'Palmas', atual: 'João Antônio', leiloeiras: 'Remates + Programa' },
    { cliente: 'Pablo Pinheiro Costa', uf: 'MA', cidade: 'Colinas', atual: 'Douglas Bispo', leiloeiras: 'Remates + Programa' },
    { cliente: 'Ivana S. Potenza Magão', uf: 'SP', cidade: 'Tarabai', atual: 'João Antônio', leiloeiras: 'Remates + Programa' },
    { cliente: 'Marcelo Oliveira', uf: 'MG', cidade: 'Divinópolis', atual: 'João Antônio', leiloeiras: 'Remates + Programa' },
    { cliente: 'Marcelo Cataldo', uf: 'MG', cidade: 'Sete Lagoas', atual: 'Fábio Omena Gaia', leiloeiras: 'Remates + Programa', obs: 'Registro duplicado do Marcelo Augusto Gomes Cataldo (aprovado no grupo em 16/07).' },
]

/* ── 3. recusados / pendentes no período ─────────────────────────────────── */
export const NAO_APROVADOS = [
    { cliente: 'Ferdinando Francisco Ramos dos Santos', grupo: 'Programa', data: '10/07', motivo: 'Restrição no CPF, sem limite, sem vínculo com pecuária' },
    { cliente: 'Tiago Menezes Esposti', grupo: 'Programa', data: '10/07 e 18/07', motivo: 'Restrição no CPF, sem limite, sem vínculo com a pecuária' },
    { cliente: 'Elielson dos Santos Rios', grupo: 'Programa', data: '10/07 e 12/07', motivo: 'Restrição no CPF, sem propriedade rural no CPF' },
    { cliente: 'Paulo Henrique Caetano Costa', grupo: 'Programa', data: '10/07', motivo: 'Restrições no CPF, sem propriedade registrada' },
    { cliente: 'Márcia Guimarães', grupo: 'Programa', data: '12/07', motivo: 'Restrição no CPF; renda abaixo de R$ 2.000' },
    { cliente: 'Josefina Martins de Souza', grupo: 'Programa', data: '12/07', motivo: 'Não autorizado — pendente documentação' },
    { cliente: 'Francisney Dutra Moreira', grupo: 'Programa', data: '12/07', motivo: 'Restrição no CPF, sem propriedade rural' },
    { cliente: 'Maria Aparecida Dantas Dias', grupo: 'Programa', data: '14/07', motivo: 'Sem limite, renda baixa, sem propriedade rural' },
    { cliente: 'Marusan Mendes de Souza', grupo: 'Programa', data: '14/07 e 20/07', motivo: 'Renda presumida abaixo de R$ 1.000 — não autorizado' },
    { cliente: 'Daniel Cunha da Camara', grupo: 'Programa', data: '14/07', motivo: 'Restrição no Serasa (⚠ mas consta aprovado na lista das duas leiloeiras)' },
    { cliente: 'Hênio Suassuna Ferreira', grupo: 'Programa + Remates', data: '20/07 a 21/07', motivo: 'PENDENTE — score ok, sem I.E./NIRF; faltou matrícula e foto do documento' },
    { cliente: 'José Dias Dantas (CAD-8B5ED / CAD-B559F)', grupo: 'Remates + Programa', data: '28/07', motivo: 'RECUSADO — único cadastro submetido pela automação no período' },
    { cliente: 'Denis Igor Silva Santos', grupo: 'Remates', data: '31/07', motivo: '23 anos e com restrição — reprovado' },
    { cliente: 'Cadastro enviado 30/07 (I.E. em PDF)', grupo: 'Remates', data: '31/07', motivo: 'Score 689, sem I.E. e processo trabalhista de R$ 500 mil — "talvez possa cilada"' },
]

export const SEM_IDENTIFICACAO = [
    '09/07 08:27 — "Cadastro aprovado" (Márcia Lourenço), respondendo a uma ficha citada',
    '09/07 21:29 — "Aprovado" (Márcia Lourenço)',
    '10/07 11:27 — "aprovado" (Márcia Lourenço)',
]

/* Clientes que aparecem no bloco 1 E na lista da leiloeira: ficam nas duas
   tabelas (são fatos diferentes), mas contam uma vez só na distribuição. */
export const DUPLICADOS_BLOCO1 = ['José Luiz Antunes', 'Marcelo Cataldo']

/* ── consolidação ────────────────────────────────────────────────────────── */
export const linhasGrupo = APROVADOS_GRUPO.map(r => {
    const porZona = assessorPorUf(r.uf)
    const assessor = r.assessorForcado || porZona
    const criterio = r.assessorForcado
        ? (porZona && porZona !== r.assessorForcado ? `direcionado no grupo (zona indicaria ${porZona})` : 'direcionado no grupo')
        : (porZona ? `regionalidade (${r.uf})` : '—')
    return { ...r, assessor, criterio }
})

export const linhasLista = APROVADOS_LISTA.map(r => {
    const assessor = assessorPorUf(r.uf)
    return { ...r, assessor, divergente: !!assessor && r.atual !== assessor, dup: DUPLICADOS_BLOCO1.includes(r.cliente) }
})

export const distribuicao = ASSESSORES.map(a => ({
    assessor: a,
    zonas: ZONA_DO_ASSESSOR[a],
    grupo: linhasGrupo.filter(r => r.assessor === a),
    lista: linhasLista.filter(r => r.assessor === a && !r.dup),
    repetidos: linhasLista.filter(r => r.assessor === a && r.dup).length,
}))

export const semAssessor = linhasGrupo.filter(r => !r.assessor)

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

/** Lê .env.local do repositório (mesmo formato usado pelos outros scripts). */
export function loadEnv(readFileSync) {
    return Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
        .filter(l => l && !l.startsWith('#') && l.includes('='))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
}
