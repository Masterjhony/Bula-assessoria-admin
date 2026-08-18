# -*- coding: utf-8 -*-
"""Extrai os DEPs completos (IQG / MGTe / iABCZ) das paginas dos 11 lotes A++."""
import glob, io, re, json, fitz

LOTES = {  # lote -> pagina do PDF
    1: 7, 2: 8, 4: 10, 5: 11, 12: 18, 16: 21, 26: 30, 65: 69, 71: 75, 72: 76, 101: 105
}
IQG_L = ['IQG', 'P120-EMg', 'PD', 'PS', 'PES', 'IPP', 'HP/STAY', 'AOL', 'EGS']
MGTE_L = ['MGTe', 'MP120', 'DP210', 'DP450', 'DPE365', 'D3P', 'DSTAY', 'DAOL', 'DACAB']
IABCZ_L = ['iABCZ', 'PM-EM', 'PD-ED', 'PA-ED', 'PS-ED', 'PE-365', 'IPP', 'STAY', 'AOL', 'PN-ED']


def num(s):
    s = s.strip()
    if s in ('-', '', 'SEM'):
        return None
    return float(s.replace('.', '').replace(',', '.')) if ',' in s else float(s)


def grab(lines, i0, n):
    """n valores a partir de lines[i0]."""
    return [num(x) for x in lines[i0:i0 + n]]


def parse_block(lines, header, labels, rows):
    """rows = ['DEP','TOP%'] ou ['DEP','DECA','P%']. Retorna {label: {row: val}}."""
    try:
        h = lines.index(header)
    except ValueError:
        return None
    n = len(labels)
    out = {lb: {} for lb in labels}
    i = h + n  # pula os n rotulos (o header ja e o 1o rotulo)
    for row in rows:
        while i < len(lines) and lines[i] != row:
            i += 1
        if i >= len(lines):
            return out
        vals = grab(lines, i + 1, n)
        for lb, v in zip(labels, vals):
            out[lb][row] = v
        i += 1 + n
    return out


doc = fitz.open(glob.glob('F:/Leil*o Touros*.pdf')[0])
res = {}
for lote, pg in LOTES.items():
    lines = [l.strip() for l in doc[pg - 1].get_text().split('\n') if l.strip()]
    res[lote] = {
        'iqg': parse_block(lines, 'IQG', IQG_L, ['DEP', 'TOP%']),
        'mgte': parse_block(lines, 'MGTe', MGTE_L, ['DEP', 'TOP%']),
        'iabcz': parse_block(lines, 'iABCZ', IABCZ_L, ['DEP', 'DECA', 'P%']),
    }

out = io.open(r'C:\Users\Notebook-Acer\AppData\Local\Temp\claude\F--Projetos-Desktop-web-bula\5c86e906-a38f-4572-b0c1-fccdc9c20a18\scratchpad\deps.json', 'w', encoding='utf-8')
json.dump(res, out, ensure_ascii=False, indent=1)
out.close()

for lote in LOTES:
    r = res[lote]
    print(lote,
          'DP210', r['mgte']['DP210'], 'DP450', r['mgte']['DP450'],
          'IPPiabcz', r['iabcz']['IPP'], 'DAOL', r['mgte']['DAOL'],
          'DACAB', r['mgte']['DACAB'], 'STAY', r['iabcz']['STAY'])
