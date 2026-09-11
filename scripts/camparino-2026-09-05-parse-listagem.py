"""
Lê a LISTAGEM DE LOTES da Programa Leilões (PDFs 'Agropecuária Camparino LTDA.pdf',
22 e 23/08/2026) e produz outputs/camparino-fechamento-2026-09/listagem-programa.json.

pdftotext embaralha as colunas (células de várias linhas), então a leitura é por
posição: cada linha é ancorada no token de 'Valor Total' (x > 765pt) e as demais
células são o texto que cai na mesma faixa vertical, coluna por coluna.
Conferência embutida: soma dos valores = total impresso e valor = lance × 30 × qtd.
"""
import json, re, sys
import fitz  # PyMuPDF

OUT = 'outputs/camparino-fechamento-2026-09'
PDFS = [('camparino-A', '2026-08-22'), ('camparino-B', '2026-08-23')]

def num(s): return float(s.replace('.', '').replace(',', '.'))

out = {}
for name, etapa in PDFS:
    doc = fitz.open(f'{OUT}/anexos/{name}.pdf')
    W = []
    for i, p in enumerate(doc):
        for w in p.get_text('words'):
            W.append({'page': i + 1, 'x0': round(w[0], 1), 'y0': round(w[1], 1), 't': w[4]})
    json.dump(W, open(f'{OUT}/anexos/{name}-words.json', 'w', encoding='utf8'), ensure_ascii=False)
    rows = []
    for p in range(1, len(doc) + 1):
        P = [w for w in W if w['page'] == p]
        vals = [w for w in P if w['x0'] > 765 and re.fullmatch(r'\d{1,3}(\.\d{3})*,\d{2}', w['t'])]
        tot_y = [w['y0'] for w in P if w['t'] == 'Lotes' and any(x['t'] == 'Total' and abs(x['y0'] - w['y0']) < 3 for x in P)]
        vals = sorted([v for v in vals if not (tot_y and abs(v['y0'] - tot_y[0]) < 12)], key=lambda v: v['y0'])
        ys = [v['y0'] for v in vals]
        for i, v in enumerate(vals):
            y = v['y0']
            lo = (ys[i - 1] + y) / 2 if i > 0 else y - 9
            hi = (ys[i + 1] + y) / 2 if i + 1 < len(ys) else y + 14
            band = lambda w: lo < w['y0'] + 2 < hi
            col = lambda a, b: ' '.join(w['t'] for w in sorted([w for w in P if a < w['x0'] < b and band(w)], key=lambda w: (round(w['y0']), w['x0'])))
            lance = [w['t'] for w in P if 697 < w['x0'] < 731 and abs(w['y0'] - y) < 4 and re.fullmatch(r'\d{1,3}(\.\d{3})*,\d{2}', w['t'])]
            qtd = [w['t'] for w in P if 739 < w['x0'] < 747 and abs(w['y0'] - y) < 4]
            rows.append({'etapa': etapa, 'pagina': p, 'lote': col(0, 56).replace('CIENC IA', 'CIENCIA'), 'vendedor': col(90, 200),
                         'comprador': col(235, 400), 'animal': col(405, 516), 'agente': col(518, 622), 'categoria': col(624, 676),
                         'lance': num(lance[0]) if lance else None, 'qtd': int(qtd[0]) if qtd else None, 'valor': num(v['t'])})
    tot = round(sum(r['valor'] for r in rows), 2)
    bad = [r for r in rows if r['lance'] and abs(r['lance'] * 30 * (r['qtd'] or 1) - r['valor']) > 0.01]
    print(name, 'linhas', len(rows), 'soma', tot, '| valor != lance x30:', len(bad), '| sem lote/agente:',
          sum(1 for r in rows if not r['lote'] or not r['agente']))
    for r in rows:
        if 'bula' in r['agente'].lower():
            print('   BULA', r['lote'], '|', r['comprador'], '|', r['animal'], '|', r['lance'], r['qtd'], r['valor'])
    out[etapa] = rows
json.dump(out, open(f'{OUT}/listagem-programa.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
