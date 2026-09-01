"""
Extrai o bloco "PERFIL DE CONSUMO" das faturas do Sicoob (PDF) para JSON.

O extrator de lancamentos (extract_faturas.py) perde a descricao de alguns
itens quando o PDF quebra a linha do estabelecimento, entao somar por regex
sub-representa a categoria. O perfil de consumo e a classificacao do proprio
Sicoob e fecha com o total da fatura — e a fonte certa para dizer "X% da
fatura e passagem e hotel".

Uso: python scripts/extrai-perfil-consumo-faturas.py <saida.json> <tag>=<pdf> ...
Ex.:  python scripts/extrai-perfil-consumo-faturas.py \
        outputs/expozebu-2026/perfil-consumo-faturas-abril.json \
        MASTER-2026-04=.codex-dev/cartoes-bula-2026/input/sicoob_2026_06_24_14_30_08.pdf
"""
import io
import json
import os
import re
import sys

import pdfplumber

LINHA = re.compile(r"^(.+?)\s+(\d+,\d{2})\s+([\d.]+,\d{2})\s*$", re.M)
val = lambda s: float(s.replace(".", "").replace(",", "."))


def perfil(pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        txt = "\n".join(p.extract_text() or "" for p in pdf.pages)
    bloco = txt.split("PERFIL DE CONSUMO")[1].split("O pagamento total")[0]
    itens = [{"tipo": m.group(1).strip(), "pct": val(m.group(2)), "valor": val(m.group(3))}
             for m in LINHA.finditer(bloco)]
    if not itens:
        raise SystemExit(f"perfil de consumo nao encontrado em {pdf_path}")
    return itens


saida, *pares = sys.argv[1:]
out = {}
for par in pares:
    tag, pdf_path = par.split("=", 1)
    out[tag] = {"arquivo": os.path.basename(pdf_path), "perfil": perfil(pdf_path)}

os.makedirs(os.path.dirname(saida) or ".", exist_ok=True)
with io.open(saida, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print(saida, "->", {k: len(v["perfil"]) for k, v in out.items()})
