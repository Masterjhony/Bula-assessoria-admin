import json, re, subprocess
# index -> UF, confirmed visually on overlay.png
IDX = {0:'AM',1:'PA',2:'MT',3:'MG',4:'BA',5:'MS',6:'GO',7:'MA',8:'RS',9:'TO',10:'SP',
       11:'PI',12:'RO',13:'RR',14:'PR',15:'AC',16:'CE',17:'AP',18:'SC',19:'PE',20:'PB',
       21:'RN',22:'ES',23:'RJ',24:'(ilha AP)',25:'AL',26:'SE',27:'(lagoa RS)',28:'DF'}
INK2FAIXA = {'#B59C74':'gratis','#806853':'gratis2lotes','#8E9F93':'consulta','#999999':'semEntrega'}

# declared, read straight out of frete.ts
ts = open('/Users/joaogabrielsantosdosanjos/Documents/FORMULA-DO-BOI/pagina-eao/src/app/saogeraldo/_lib/frete.ts').read()
decl = dict(re.findall(r"sigla: '(\w\w)'.*?faixa: '(\w+)'", ts))

res = json.load(open('results.json'))
rows=[]
for i,p in enumerate(res):
    uf = IDX[i]
    if uf.startswith('('): continue
    med = INK2FAIXA[p['modal']]
    rows.append((uf, decl[uf], med, p['modal'], p['vector'], p['cx'], p['cy'], p['frac']))
ORDER = ['RO','AC','AM','RR','PA','AP','TO','MA','PI','CE','RN','PB','PE','AL','SE','BA',
         'MG','ES','RJ','SP','PR','SC','RS','MS','MT','GO','DF']
rows.sort(key=lambda r: ORDER.index(r[0]))
print(f"{'UF':<3} {'ponto amostrado':<16} {'raster':<8} {'vetor':<8} {'pureza':>6}  {'PDF diz':<13} {'frete.ts diz':<13} veredito")
bad=[]
for uf,d,m,modal,vec,cx,cy,frac in rows:
    ok = 'CONFERE' if d==m else '*** DIVERGE ***'
    if d!=m: bad.append(uf)
    print(f"{uf:<3} ({cx:>4},{cy:>4})       {modal:<8} {vec:<8} {frac*100:>5.1f}%  {m:<13} {d:<13} {ok}")
print()
print('divergências:', bad or 'nenhuma')
from collections import Counter
print('distribuição medida no PDF:', dict(Counter(r[2] for r in rows)))
print('distribuição declarada    :', dict(Counter(r[1] for r in rows)))
print('total UFs auditadas       :', len(rows))
