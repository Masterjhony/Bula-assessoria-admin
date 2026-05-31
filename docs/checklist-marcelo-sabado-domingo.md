# Checklist geral - pedidos do Marcelo no WhatsApp

Consolidação: sábado 30/05 + domingo 31/05

Projeto: Web Bula / Agenda pública de leilões

Legenda:

- [x] Feito
- [ ] Pendente
- [ ] Parcial: feito em parte, mas ainda precisa conferência ou complemento

## Agenda / Site da Bula

- [x] **Feito** - Refazer/desenvolver a página da **Agenda de Leilões da Bula Assessoria**, igual/parecida com o modelo anterior.
- [x] **Feito** - Corrigir a página antes de reenviar, porque Marcelo disse que estava "tudo errado".
- [ ] **Parcial** - Manter a agenda/site no domínio principal. A rota `/agenda` foi implementada e enviada para `main`; falta validar o domínio final em produção.
- [x] **Feito** - Ajustar identidade visual da página para **Bula preto e branco**.
- [x] **Feito** - Remover cores que não são da marca.
- [x] **Feito** - Trocar a foto ruim por uma foto/mídia melhor enviada por Marcelo.
- [x] **Feito** - Usar o **vídeo de 0:27** enviado no domingo como fundo.
- [x] **Feito** - Garantir que cada leilão/card/link tenha foto.
- [x] **Feito** - Sempre colocar na agenda a **foto da arte** usada no leilão quando existir na planilha.
- [x] **Feito** - Não deixar a página infinita; mostrar só o recorte da agenda atual.
- [ ] **Pendente** - Confirmar para quem aponta o CTA/WhatsApp. Hoje o botão ainda usa link genérico.
- [x] **Feito** - Criar etiquetas nos cards, por área, para permitir filtro.
- [x] **Feito** - Corrigir o filtro que está "dando pau".

## Informações dos leilões

- [x] **Feito** - Enriquecer as informações dos leilões com dados disponíveis de data, horário, criatório, local, modelo, leiloeira, condição e catálogo.
- [ ] **Parcial** - Consultar mídias sociais dos criadores, planilha da Bula e outras fontes. A planilha e referências web pontuais foram usadas; ainda falta varredura completa de mídias sociais.
- [ ] **Parcial** - Ler as artes dos leilões para extrair informações. As artes foram extraídas e usadas como capa; extração textual completa das artes ainda não foi feita.
- [x] **Feito** - Verificar leilão faltando na agenda.
- [x] **Feito** - Adicionar **18º Mega Leilão Nelore Pará**.
- [x] **Feito** - Adicionar **Leilão Matrizes Santa Nice** no dia 6.
- [ ] **Parcial** - Conferir **Katayama/Trilogia** como evento de 3 dias. A planilha atual sincronizada trouxe 2º e 3º dia; a arte indica 31/05, 01/06 e 02/06, então falta validação final do 1º dia na agenda.
- [x] **Feito** - Colocar destaque: **"Compre Touros e Matrizes PO em 30X no Boleto e Frete Grátis"**.
- [x] **Feito** - Criar faixa abaixo da sessão inicial com os **criatórios parceiros**.
- [ ] **Parcial** - Buscar logos em PNG dos criatórios parceiros. Foram adicionadas referências oficiais quando encontradas, mas os logos oficiais ainda não foram baixados/salvos para todos.

## Planilha / Sincronização

- [x] **Feito** - Corrigir/implementar sincronização com a planilha.
- [x] **Feito** - Validar por que Marcelo atualizou a planilha e o site não atualizou. A causa prática era a cópia local desatualizada e a sincronização não rodada após as mudanças.
- [ ] **Parcial** - Revisar sincronização da agenda e dos fechamentos. A agenda foi sincronizada; fechamentos foram tratados em scripts/ajustes específicos, mas não houve revisão completa de todos os fechamentos.
- [x] **Feito** - Conferir material encaminhado **"Faturamento LS Collection"** para registro de acordo.

## Fechamentos / Lotes / Vendas

- [x] **Feito** - Separar fechamentos por leilão; não juntar dois leilões no mesmo fechamento.
- [x] **Feito** - Fazer um fechamento por vez nos casos corrigidos.
- [x] **Feito** - Lançar primeiro as vendas/lotes enviados.
- [x] **Feito** - Depois ajustar a agenda.
- [x] **Feito** - LS Now: lote 10 = **780**, em **30 pagamentos**.
- [x] **Feito** - LS Now: lote 25 = **600**, em **30 pagamentos**.
- [x] **Feito** - M5/bateria: **40 pagamentos somente para esse lote/bateria**.
- [x] **Feito** - Conferir/lançar lotes **10, 25, 30, 31, 32 e M5**.
- [x] **Feito** - Nelore Pará: regra geral de **30 parcelas**.
- [ ] **Pendente** - Nelore Pará: exceção, **lote 5 em 40x**. Não localizado nos scripts finais conferidos.
- [x] **Feito** - Colocar para o **Fábio** a venda que "deu BO".
- [ ] **Pendente** - Conferir PDF/arquivo **"clientes touros NELORE PO"**.

## Acordos / Comissões

- [x] **Feito** - Registrar acordo **LS Collection: 1% do faturamento total + 4% da venda**.
- [x] **Feito** - Registrar acordo **Santa Nice: 5% da venda**.
- [ ] **Parcial** - Registrar demais acordos/comissões já citados, incluindo caso de **3% da venda**. Há acordos registrados, mas falta auditoria completa de todos os citados.
- [x] **Feito** - Montar controle de acordos por cliente/leilão.
- [ ] **Pendente** - Mandar print para Marcelo mostrando essa organização.
- [ ] **Pendente** - Sempre que Marcelo mandar novo leilão, verificar se cliente/acordo já existe; se não existir, cadastrar na hora. Precisa virar processo/rotina.

## Correções do sistema / Relatórios

- [x] **Feito** - Corrigir nome duplicado do Fábio.
- [ ] **Pendente** - Corrigir gráfico de cobertura que mostra só os primeiros 7 leilões.
- [ ] **Pendente** - No mensal, mostrar todos os leilões do mês.
- [ ] **Pendente** - No anual, mostrar média mensal de cobertura.
- [x] **Feito** - Criar checklist/status com checks para marcar demandas concluídas.

## Validação já realizada

- [x] **Feito** - Build final do projeto executado com sucesso.
- [x] **Feito** - Agenda validada localmente em `http://localhost:3010/agenda`.
- [x] **Feito** - Detalhe do leilão validado com imagem de capa completa.
- [x] **Feito** - Alterações de código enviadas para o GitHub.
