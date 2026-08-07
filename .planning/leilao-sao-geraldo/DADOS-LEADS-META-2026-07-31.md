# Dados apurados — leads São Geraldo × Meta Ads

**Extração:** 31/07/2026 · **Fonte:** `Leads JMP - Bula Assessoria.xlsx` (abas LEADS GERAIS,
TOUROS, FEMEAS, unificadas por WhatsApp) + números de gasto lidos em `RECONCILIACAO-SUBGASTO.md`.
**Escopo:** somente São Geraldo. **Leilão:** 01/08/2026, sábado, 12h.

Filtro São Geraldo = qualquer um de Origem / utm_campaign / campaign_name / utm_content /
adset_name / ad_name / form_name contendo "SAO GERALDO". Deduplicado por telefone.

## 1. Volume

| | |
|---|---|
| Leads São Geraldo (únicos) | **31** |
| MQL pela régua (≥100 cabeças **E** inscrição estadual) | **13 (42%)** |
| Base total da planilha (todos os produtos) | 1.737 |
| Janela real de captação | 29, 30 e 31/07 — **3 dias** |

Leads por dia: **29/07 = 12 · 30/07 = 15 · 31/07 = 4** (parcial, extração às ~16h).

## 2. Custo — janela 29–30/07 (único período com gasto conhecido)

Gasto: R$315,80 em 2 dias (Aberto R$185,37 + RMKT R$130,43). 21.058 impressões, 850 cliques,
CTR 4,04%, CPM R$14,99.

| Conjunto | Leads | MQL | Gasto | CPL | CPMQL |
|---|---:|---:|---:|---:|---:|
| CA - SAO GERALDO - web e inst RMKT | 12 | 6 | R$130,43 | **R$10,87** | **R$21,74** |
| CA - SAO GERALDO - web - Aberto | 11 | 4 | R$185,37 | R$16,85 | R$46,34 |
| (sem utm / orgânico / perpétuo) | 4 | 2 | — | — | — |
| **Total** | **27** | **12** | **R$315,80** | **R$11,70** | **R$26,32** |

> O RMKT entrega MQL a **menos da metade do custo** do Aberto (R$21,74 vs R$46,34), com 59% menos
> verba. Nota: o RMKT tem teto de público — não escala linearmente.

**Subentrega confirmada:** R$300/dia autorizados para São Geraldo, R$157,90/dia entregues (53%).
Metade da verba do leilão não saiu. Diagnóstico em `RECONCILIACAO-SUBGASTO.md`: suspeita de
**limite de gastos da conta** (o perpétuo cai junto, CPM caindo com gasto caindo, frequência 1,98).

## 3. Por anúncio (criativo)

| Anúncio | Leads | MQL | % MQL | Rota dominante |
|---|---:|---:|---:|---|
| video-sao-geraldo03 | 10 | 5 | **50%** | Instant Form (10/10) |
| video-sao-geraldo01 | 13 | 4 | 31% | Landing (12/13) |
| video-sao-geraldo05 | 2 | 2 | 100% | misto — volume baixo demais |
| video-sao-geraldo04 | 2 | 0 | 0% | Instant Form — só entrou em 31/07 |
| (sem utm) | 3 | 1 | 33% | Landing |
| video-perpetuo-touro02 | 1 | 1 | 100% | vazamento do perpétuo |

**video-sao-geraldo01 e 03 concentram 23 dos 31 leads e 9 dos 13 MQL.** O 04 e o 05 são recentes
e não têm massa para decidir.

## 4. Por rota de captação

| Rota | Leads | MQL | % MQL | Atendidos pela equipe |
|---|---:|---:|---:|---:|
| Landing São Geraldo (site) | 17 | 7 | 41% | **16 de 17 (94%)** |
| Meta — Formulário Instantâneo | 14 | 6 | 43% | **5 de 14 (36%)** |

As duas rotas convertem em MQL na **mesma taxa** (41% vs 43%). A diferença está no atendimento:
9 dos 14 leads do Instant Form nunca foram tocados — é o resíduo do bug de destino descrito em
`LEADS-INSTANTFORM-DESALINHADOS.md`.

## 5. Perfil dos 13 MQL

- **UF:** MG=4, MS=2, BA/SE/GO/PA/MA/RO/PE=1 cada.
- **Zona:** Sudeste=4, Centro-Oeste=3, Nordeste=3, Norte=2, MA=1.
- **Plataforma:** facebook=9, instagram=3.
- **Momento:** Pecuária de corte=6, Cria=3, Ciclo completo=2, Confinamento=1, Recria=1.
- **Rebanho:** 100–500=5, >500=3, 301–500=2, >3000=1, 501–1000=1, 101–300=1.
- **Quantidade desejada:** 12 dos 13 pedem **1 a 5 touros**.

## 6. Por que 18 leads caíram fora da régua

Sem inscrição estadual: 11 · rebanho <100 cabeças: 13 · interesse não é touro: 5 (sobreposição).
Ou seja: o filtro que mais corta é **rebanho pequeno**, não IE.

## 7. Funil de atendimento (os 31)

| Etapa | Leads | dos quais MQL |
|---|---:|---:|
| (não tocado) | 10 | 4 |
| QUALIFICAÇÃO | 10 | 3 |
| NÃO RESPONDEU | 8 | 3 |
| CADASTRO OK | 2 | 2 |
| INFORMAÇÃO CAPTADAS | 1 | 1 |

**Só 2 dos 31 chegaram a CADASTRO OK. 4 MQL nunca foram tocados** — a <20h do leilão.

## 8. Horário de chegada dos leads

Pico claro entre **17h e 21h** (14 dos 31 leads, 45%). Segundo bloco fraco de manhã (6h–12h, 8).

## 9. O que NÃO temos

- Gasto por **anúncio** (só por conjunto, e só de 29–30/07).
- Gasto de **31/07** — nenhum dado.
- LPV, cliques e impressões por anúncio.
- Se o limite de gastos da conta foi levantado depois de 30/07.
