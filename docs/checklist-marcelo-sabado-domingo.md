# Checklist das demandas do Marcelo - sábado e domingo

Data de consolidação: 31/05/2026

Projeto: Web Bula / Agenda pública de leilões

Contato de origem: conversa com Marcelo Primo Carneiro no WhatsApp, incluindo mensagens de texto e áudios.

## Resumo para acompanhamento

Este checklist consolida os pedidos levantados nas conversas de sábado e domingo e marca o que já foi executado nesta rodada do projeto `web-bula`. Os itens de Administrativo, Perfil / Imagem e Alinhamento foram deixados fora de execução por orientação expressa.

## Sábado - pedidos iniciais

### Agenda pública da Bula

- [x] Desenvolver uma página de front-end para a Bula Assessoria com a agenda de leilões, semelhante ao modelo que existia anteriormente.
- [x] Montar a página pública de agenda com visual de marca, hero principal, listagem de leilões e navegação para detalhes.
- [x] Organizar a agenda de forma consultável, com agrupamento por mês e leitura fácil dos próximos eventos.
- [x] Criar filtros e busca para facilitar consulta por tipo de leilão, criatório, leiloeira, modalidade e condição comercial.

### Correção de dados e leilões faltantes

- [x] Validar se havia leilão faltando na agenda.
- [x] Atualizar a base com a planilha vigente de 2026.
- [x] Corrigir a leitura dos horários da planilha quando a coluna de horário vinha sem cabeçalho no arquivo exportado.
- [x] Incluir os leilões novos que entraram na planilha após a versão local anterior.
- [x] Remover da agenda pública o item antigo duplicado "TOUROS MATINHA", mantendo o "LEILÃO VIRTUAL TOUROS MATINHA" da planilha atual.

### Fotos, capas e links

- [x] Garantir que os leilões exibidos na agenda tenham imagem/foto de capa.
- [x] Extrair as capas embutidas na planilha XLSX atualizada.
- [x] Subir as capas extraídas para o storage.
- [x] Preencher capas faltantes usando as imagens da planilha quando disponíveis.
- [x] Criar capa institucional da Bula para os leilões sem flyer embutido na planilha, evitando cards vazios.
- [x] Validar que os leilões públicos do período ficaram com zero capas faltantes.

### Controle de andamento

- [x] Criar checklist com marcação de itens concluídos para acompanhamento das demandas.
- [x] Separar itens concluídos, fora de escopo e pendências.
- [x] Gerar PDF de acompanhamento para envio ao chefe.

## Domingo - validação e ajustes complementares

### Planilha e consistência da agenda

- [x] Baixar novamente a planilha do Google Drive porque houve alterações depois da última versão local.
- [x] Colocar a planilha atualizada dentro do projeto.
- [x] Rodar sincronização da agenda a partir da planilha atualizada.
- [x] Revisar os leilões exibidos em `/agenda` contra a planilha.
- [x] Garantir que os leilões exibidos estejam completos no banco e na página pública.
- [x] Validar a agenda pública mostrando 23 leilões visíveis no período atual.

### Hero banner e identidade visual

- [x] Usar o vídeo informado do Cloudinary como hero banner da agenda.
- [x] Aumentar a presença da logo da Bula no banner principal.
- [x] Remover verde inadequado e ajustar a interface para uma linguagem mais próxima da marca.
- [x] Corrigir a área visual clara/branca que não estava adequada no conjunto da página.
- [x] Ajustar textos e visual para uma comunicação mais comercial e compatível com a Bula.

### Botão e interface de contato

- [x] Corrigir o botão "Fale com a Bula", que estava visualmente ruim e ilegível.
- [x] Deixar o botão com contraste adequado, aparência mais limpa e melhor usabilidade.
- [ ] Definir o número oficial do WhatsApp para substituir o link genérico `https://wa.me/`.

### Criatórios parceiros

- [x] Reformular a seção de criatórios parceiros porque a versão anterior estava visualmente fraca.
- [x] Remover menções a "critérios identificados na planilha".
- [x] Remover menções a "planilha" no texto público.
- [x] Não mencionar "remates" na seção de criatórios parceiros.
- [x] Exibir os criatórios de forma mais elegante e institucional.
- [x] Buscar e vincular referências oficiais quando identificadas, como sites institucionais de criatórios.

### Página de detalhes do leilão

- [x] Criar página de detalhe para cada leilão da agenda.
- [x] Garantir que a pessoa consiga ver a imagem de capa inteira na página de detalhe.
- [x] Usar `object-contain` na capa completa para não cortar o flyer.
- [x] Exibir informações completas do leilão quando disponíveis: data, horário, criatório, local, modelo, leiloeira, condição e catálogo.
- [x] Validar a página de detalhe do leilão Katayama com a capa inteira carregando corretamente.

### Capas faltantes no domingo

- [x] Revisar novamente a questão das imagens.
- [x] Identificar leilões sem capa após a sincronização.
- [x] Preencher capas faltantes a partir das imagens embutidas na planilha.
- [x] Gerar capas institucionais para leilões sem flyer disponível na planilha.
- [x] Confirmar que nenhum leilão público do período ficou sem capa.

## Itens fora de escopo por orientação

- [ ] Administrativo - não executado nesta rodada por orientação.
- [ ] Perfil / Imagem - não executado nesta rodada por orientação.
- [ ] Alinhamento - não executado nesta rodada por orientação.

## Pendências recomendadas

- [ ] Definir o WhatsApp oficial da Bula para atualizar o botão "Fale com a Bula".
- [ ] Homologar a agenda com Marcelo/cliente final.
- [ ] Enriquecer futuramente a seção de criatórios com logos oficiais quando houver arquivos confiáveis.

## Evidências do que foi feito

- [x] Build final executado com sucesso com `npm run build`.
- [x] Agenda validada localmente em `http://localhost:3010/agenda`.
- [x] Página de detalhe validada localmente em `http://localhost:3010/agenda/63741134-3551-4678-839e-3226b3e1c91e`.
- [x] Commit e push realizados na branch `main`.
- [x] Commit publicado: `0b20b11 - Melhora agenda publica Bula`.
