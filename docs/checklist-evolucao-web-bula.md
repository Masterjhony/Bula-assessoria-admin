# Checklist de evolução - Web Bula

Data: 31/05/2026

Projeto: Web Bula / Agenda pública de leilões

## Resumo executivo

A agenda pública da Bula foi revisada com base nas solicitações consolidadas e na planilha atualizada do Google Drive. O foco desta etapa foi deixar a página pública mais fiel à operação real de leilões, com dados completos, capas visíveis, melhor apresentação visual e uma experiência mais clara para o cliente final.

## Checklist geral

### Dados e planilha

- [x] Baixar a planilha atualizada do Google Drive e substituir a cópia local usada no projeto.
- [x] Sincronizar a agenda com a planilha atualizada de 2026.
- [x] Validar a aba de junho/2026 e incluir os leilões novos que entraram após a última planilha local.
- [x] Corrigir a leitura da coluna de horário nas abas em que o cabeçalho da coluna C vem vazio no XLSX exportado pelo Google.
- [x] Capturar o campo de acordo/comissão quando a coluna vem como "ACORDO".
- [x] Manter os dados internos preservados e expor publicamente apenas informações adequadas ao cliente.
- [x] Remover da agenda pública o item antigo duplicado "TOUROS MATINHA", mantendo apenas o "LEILÃO VIRTUAL TOUROS MATINHA" da planilha atual.
- [x] Validar que a agenda pública mostra 23 leilões no período atual exibido.
- [x] Validar que não há leilões públicos do período sem imagem de capa.

### Imagens e capas dos leilões

- [x] Extrair as imagens embutidas na planilha XLSX atualizada.
- [x] Subir as capas extraídas para o storage do Supabase.
- [x] Preencher capas faltantes para Katayama Trilogia, Santa Nice, Nelore MNO, Fazenda Rio Bonito e Leilão Virtual Touros Matinha.
- [x] Criar capas institucionais da Bula para leilões que não tinham flyer embutido na planilha: Fêmeas Nelore JMP, Nelore Kriz, Nelore Ceia e Nelore IPB.
- [x] Ajustar a página de detalhes para permitir visualizar a imagem de capa inteira, sem corte.
- [x] Validar carregamento da capa completa na página de detalhe do leilão Katayama.

### Interface e experiência da agenda

- [x] Usar o vídeo de fundo solicitado como hero banner da agenda.
- [x] Aumentar a presença da logo da Bula no banner principal.
- [x] Remover o uso de verde inadequado e aproximar a interface de uma linguagem preto/branco/dourado mais coerente com a marca.
- [x] Corrigir o botão "Fale com a Bula", que estava ilegível, deixando-o com contraste adequado.
- [x] Reorganizar a agenda pública para exibir maio e junho/2026 no contexto atual.
- [x] Melhorar os cards dos leilões com busca, filtros por área e informações mais completas.
- [x] Exibir o criatório nos cards e na página de detalhes quando a planilha fornece essa informação.
- [x] Melhorar a seção de criatórios parceiros para ficar mais elegante e menos mecânica.
- [x] Remover menções a "planilha" no texto público.
- [x] Remover menções a "remates" na seção de criatórios parceiros.
- [x] Adicionar links de referência oficial quando identificados para criatórios com presença institucional pública.
- [x] Ajustar textos gerais para uma comunicação mais comercial, clara e adequada ao cliente.

### Página de detalhe do leilão

- [x] Manter hero visual com a capa do leilão.
- [x] Adicionar bloco específico "Imagem de capa" com a arte inteira.
- [x] Exibir data, horário, criatório, local, modelo, leiloeira, condição e demais dados disponíveis.
- [x] Garantir que o detalhe de um leilão continue acessível mesmo quando ele pertence ao período público atual.
- [x] Atualizar textos de "remate" para "leilão" nas áreas principais de detalhe.

### Validação técnica

- [x] Rodar sincronização em modo de validação antes da escrita real.
- [x] Rodar sincronização real com a planilha atualizada.
- [x] Confirmar que não há imagens faltantes nos leilões públicos do período.
- [x] Rodar `npm run build` com sucesso.
- [x] Reiniciar o servidor local em `http://localhost:3010`.
- [x] Validar visualmente a agenda no navegador local.
- [x] Validar visualmente a página de detalhe com capa completa.

## Itens deixados fora por orientação

- [ ] Administrativo - ignorado nesta etapa conforme orientação.
- [ ] Perfil / Imagem - ignorado nesta etapa conforme orientação.
- [ ] Alinhamento - ignorado nesta etapa conforme orientação.

## Pendências recomendadas

- [ ] Definir o número oficial do WhatsApp para substituir o link genérico `https://wa.me/` no botão "Fale com a Bula".
- [ ] Enviar para homologação do Marcelo/cliente final após o push.
- [ ] Revisar futuramente logos oficiais dos criatórios que ainda não possuem arquivo de marca salvo no projeto.

## Evidências de validação

- Build final executado com sucesso.
- Agenda local validada em `http://localhost:3010/agenda`.
- Página de detalhe validada em `http://localhost:3010/agenda/63741134-3551-4678-839e-3226b3e1c91e`.
- Banco validado com 23 leilões públicos visíveis no período e zero imagens faltantes.
