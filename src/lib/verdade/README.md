# ERP VERDADE

O ERP deixou de guardar **valores** e passou a produzir a verdade a partir de
**fatos + regras + validações**. Nenhum número aparece sem carimbo.

```
FATOS  →  REGRAS  →  VARIÁVEIS DERIVADAS  →  VALIDAÇÕES  →  DECISÃO
```

Cada variável responde sempre as mesmas seis perguntas:

| | |
|---|---|
| **Valor** | quanto é |
| **Origem** | de quais fatos saiu (tabela, filtro, nº de linhas) |
| **Fórmula** | como foi formado, em português, refazível na mão |
| **Cobertura** | que fração do universo a fórmula conseguiu enxergar |
| **Atualização** | quando o fato mais novo entrou |
| **Confiança** | 0–100, decomposta em motivos |

## Como usar

```bash
npm run verdade          # relatório completo
npm run verdade:curto    # uma linha por variável
npm run verdade:json     # para outro programa consumir
npx tsx scripts/verdade.mts caixa.saldo   # detalha uma variável
```

Sai com código **1** se houver validação falhando ou variável bloqueada — serve
de gate em automação. Na interface: **ERP › Confiança dos Números**
(`/erp#verdade`), servido por `GET /api/erp/verdade`.

## Arquitetura

| Arquivo | Papel |
|---|---|
| `tipos.ts` | vocabulário: Lacuna, Cobertura, Conflito, Confiança, Variável |
| `fatos.ts` | **a foto** — uma leitura paginada de todas as fontes, um instante só |
| `confianca.ts` | a fórmula da nota, com constantes num lugar só |
| `catalogo.ts` | variáveis do núcleo financeiro + agregação dos domínios |
| `validacoes.ts` | invariantes do núcleo + agregação dos domínios |
| `motor.ts` | roda validações, resolve variáveis em ordem de dependência, carimba |
| `dominios/*.ts` | um módulo por área do ERP, cada um com `VARIAVEIS` e `VALIDACOES` |

## As três decisões que fazem isto funcionar

**1. Lacuna tem impacto declarado.** Tratar tudo como erro de valor faz o
sistema gritar em cima de número certo — e quem lê aprende a ignorar.

- `valor` — a soma pode estar errada. Só isto derruba a cobertura.
- `interpretacao` — a soma está certa, o rótulo mente. Ex.: "vencido" num CR
  cujo vencimento é o automático de leilão+45d.
- `atribuicao` — soma e rótulo certos, falta o dono. Ex.: título sem fornecedor.

**2. Total com composição herda a confiança ponderada.** "A receber: R$ 862 mil"
é 98% comissão já apurada; herdar a nota da fatia estimada de 2% seria mentir ao
contrário. Já "A pagar: R$ 378 mil" é 83% folha projetada — e por isso fica
bloqueado: não é dívida.

**3. Validação declara quem ela contamina.** `afeta: ['receita.mes', ...]` faz o
conflito derrubar a confiança do número afetado, em vez de virar linha vermelha
num relatório que ninguém lê.

## Convenções canônicas

O ERP tinha definições concorrentes para a mesma ideia, e elas divergiam:

- **Transferência interna** — quatro definições (nome da categoria, `dre_grupo =
  'ignorar'`, `transferencia_par_id`). A canônica é a **união**: `ehTransferencia()`
  em `fatos.ts`. Quem usava só o `transferencia_par_id` somava R$ 473.749,61 de
  dinheiro que nunca foi receita.
- **Compromisso futuro** — `origem = 'estimativa'` no ERP × `tags` com
  `'orcamento'` no Balanço. Canônica: `compromissoFuturo()`. A divergência fazia
  R$ 17.011,00 de CR estimado entrar no Balanço como ativo real.
- **Escala do acordo** — `acordo_pct_*` são **frações** (`0.03` = 3%), não
  percentuais.

As validações `convencao_*` acusam a divergência enquanto as duas convenções
coexistirem no banco.

## Como adicionar

**Variável nova** — declare no domínio certo em `dominios/`, exportada em
`VARIAVEIS`. Se ela não estiver no catálogo, não pode ser apresentada; é essa
regra que impede número solto de voltar a existir.

**Validação nova** — em `VALIDACOES` do domínio, sempre com `afeta` preenchido.
Leitura pura sobre a foto: nada de consultar o banco de dentro de uma regra.

**Gate em relatório** — `exigePublicavel(rel, 'caixa.saldo')` devolve o valor ou
lança `ValorNaoPublicavel`. Com `{ forcar: true }` passa, mas devolve o carimbo
para o relatório imprimir a ressalva; nunca some com o aviso em silêncio.

## Calibração

Constantes em `confianca.ts`. Piso de publicação: **70** (`CONFIANCA_MINIMA_PUBLICACAO`
em `tipos.ts`). O acumulado de alertas tem teto (`PENALIDADE_WARN_MAX`) de
propósito: um valor exato cercado de ressalvas cai para "confira antes de usar",
nunca para zero — senão o painel inteiro fica vermelho e as pessoas param de
olhar, que é o fracasso clássico deste tipo de sistema.
