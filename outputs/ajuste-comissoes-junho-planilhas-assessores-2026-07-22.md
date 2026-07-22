# Ajuste comissões JUNHO/2026 — planilhas dos assessores (pasta 0626)

Data: 22/07/2026 • Fontes: `COMISSAO JUNHO DOUGLAS.xlsx`, `PLANILHA COMISSÃO BULA junho26_21_07 (1).xlsx` (Fábio), `planilha Leo.jpeg` (Leonardo Serafim), em `C:\Users\Notebook-Acer\Desktop\Fechamento assessores 0626`.
Script: `scripts/ajusta-comissoes-junho-planilhas-assessores-2026-07-22.mjs` (idempotente; marcador `[FECH-ASSESSORES-0626 22/07]` em tudo que foi tocado).

Planilhas tratadas como condição real das comissões (vendas canceladas pós-leilão). Ajustados **bula_leilao_fechamento** (Admin → fechamento leilões: por_assessor + vgv_total + comissao_assessoria) e **erp_contas_pagar** (CPs de comissão, venc. 27/07).

## Totais por assessor (CPs em aberto, venc. 27/07)

| Assessor | CPs ajustados | Planilha | Confere |
|---|---:|---:|---|
| Douglas Bispo | 28.493,00 | 28.493,00 | ✅ exato |
| Leonardo Serafim | 18.866,00 | 18.866,00 | ✅ exato |
| Fábio Omena | 60.645,00 | 64.929,00 (itemizada) | ✅ menos pendências (abaixo) |

## Cancelamentos aplicados (sistema → planilha)

- **JMP Touros (14/06)** — Douglas: 282.100 → 234.100 (−48.000; CP 5.642 → 4.682). Fábio: 1.312.000 → 1.315.000 (+3.000; CP 39.360 → 39.450).
- **Kriz Matrizes (16/06)** — Douglas: 285.000 → 261.000 (−24.000; CP criado: 5.220). Leo confere (CP criado: 2.652 — faltava).
- **KatiSpera (20/06)** — Douglas: 185.100 → 165.000 (CP 3.702 → 3.300).
- **Terra Brava (16-18/06)** — Fábio: 80.400 → 60.000 (CP 2.412 → 1.800). Douglas confere.
- **MEAB & Modelo (23/06)** — Douglas: 452.100 → 434.100, mas comissão SOBE p/ 10.185 (lotes 16 e 14 do Henrique Areas a **5%** = 2.505 + demais a 2%). CP criado (faltava). Leo: CP criado (2.292, faltava).

## Correções de atribuição / lançamentos que faltavam

- **FLOC (15/06)** — atribuição trocada: Douglas fica c/ lotes 11 e 13 (30.600 → CP 612), Fábio c/ lotes 24, 17e23 e 30 (66.300 → CP 1.989). VGV do leilão inalterado (96.900) — confirma que era troca, não cancelamento.
- **Camparino (06/06)** — o lote "Não informado" (24.500) era o lote 32 do Fábio. Fábio: 68.600 → 93.100 (parcelas 14x; CP 4.410 → 2.793). Leo: CP 840 → 392 (só lote 82, 19.600). VGV do leilão inalterado (184.100).
- **Tresmar (11/06)** — fechamento só tinha Fábio (30.000). Adicionados Douglas (lote 17, 30.000 → CP novo 600) e Leo (lotes 1 e 15, 126.000 → CP novo 2.520). VGV 30.000 → 186.000.
- **Jacamim (07/06)** — Fábio tinha 2 lotes no sistema, planilha traz 3 (55/44/83): 53.100 → 73.200 (CP 1.593 → 2.196).
- **Matinha (21/06)** — BAT 13 do Fábio em **40 parcelas** (não 30): 84.000 → 112.000 (CP 2.520 → 3.360).
- **Flor do Aratau (07/06)** — os "14 animais não informados" (312.300) são do **Douglas**, pago pela **Bula Remates** a 0,5% s/ faturamento total (1.134.900) = **5.674,50 — fora do ERP da Assessoria** (registrado no fechamento). Lote 01 (123.000) agora aparece como Gustavo Rusa (comissão à parte, regra do áudio). Fábio lote 05: 21.600 → 21.300 (CP 648 → 639).

## ⚠️ Pendências — decisão do chefe (nada foi pago/apagado)

1. **Douglas × Santa Nice (3.360) e JMP Bezerras 13/06 (2.520)**: os CPs existem no ERP mas **não constam na planilha dele**. Flagados "CONFERIR ANTES DE PAGAR" — confirmar se cancelou ou se ele esqueceu de listar (se cancelou, são −5.880).
2. **Fábio × Flor do Aratau**: ele reivindica o lote 01 (123.000 × 3% = 3.690) + corte 40 fêmeas (118.800 × 0,5% = 594), mas a regra do áudio de 30/06 diz que a comissão do lote 01 é do **Gustavo Rusa**. Mantive só o lote 05 (639) e flaguei. Se o chefe der razão ao Fábio: +4.284.
3. **Fábio × MEAB (2.421)**: a própria planilha dele marca como "VENDA SEM APROVACAO" (Rodrigo Rocha, 80.700). CP já existia flagado — mantido aguardando.
4. **Venda paralela JMP (2.889)**: planilha do Fábio lista 96.300 como "venda paralela — Marcelo Moura / venda Mateus CPD" (fora do total dele). Nenhum CP gerado (Mateus CPD já está 0% no fechamento).
5. **Total digitado na planilha do Fábio (64.479) difere da soma das linhas (64.929) em 450** — erro de fórmula na planilha dele, usei os valores linha a linha.
6. **CP Bulinha JMP Touros (29.986)** segue a contradição antiga (fechamento diz 0% por ser dono da FdB, CP existe) — não mexi, já estava flagado.
