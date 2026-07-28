import re, numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

S = 300/72.0
svg = open('p3.svg').read()
A = np.asarray(Image.open('p3-003.png').convert('RGB')).astype(int)
H, W, _ = A.shape

INKS = {'gratis':(0xB5,0x9C,0x74), 'gratis2lotes':(0x80,0x68,0x53),
        'consulta':(0x8E,0x9F,0x93), 'semEntrega':(0x99,0x99,0x99)}
# gap mínimo entre duas tintas quaisquer = 11 (semEntrega vs consulta).
# tolerância 4 é seguramente inambígua: nenhum pixel pode casar com duas tintas.
TOL = 4

exec(open('/Users/joaogabrielsantosdosanjos/Documents/FORMULA-DO-BOI/pagina-eao/scripts/audita-frete-02-amostra.py').read().split("print('map polygons found")[0]
     .replace("img = Image.open('p3-003.png').convert('RGB')","img = Image.open('p3-003.png').convert('RGB')"))
# ^ reaproveita flatten()/shoelace()/polys do script já auditado

IDX = {0:'AM',1:'PA',2:'MT',3:'MG',4:'BA',5:'MS',6:'GO',7:'MA',8:'RS',9:'TO',10:'SP',
       11:'PI',12:'RO',13:'RR',14:'PR',15:'AC',16:'CE',17:'AP',18:'SC',19:'PE',20:'PB',
       21:'RN',22:'ES',23:'RJ',24:'ilhaAP',25:'AL',26:'SE',27:'lagoaRS',28:'DF'}
polys.sort(key=lambda p:-p[4])

# classificação exata de cada pixel da página
cls = np.full((H,W), -1, np.int8)
for i,(k,c) in enumerate(INKS.items()):
    d = np.abs(A - np.array(c)).max(axis=2)
    cls[d <= TOL] = i
white = (A.min(axis=2) >= 200)
dark  = (A.max(axis=2) <= 95)
KEYS = list(INKS)

union = np.zeros((H,W), bool)
rows = []
for i,(col,pts,cx,cy,area,x0,x1,y0,y1) in enumerate(polys):
    uf = IDX[i]
    msk = Image.new('L',(W,H),0); ImageDraw.Draw(msk).polygon(pts, fill=255)
    full = np.asarray(msk) > 0
    union |= full
    er = ndimage.binary_erosion(full, np.ones((7,7)))     # 3px de folga só p/ o traço
    if er.sum() < 200: er = full
    n = er.sum()
    counts = {k:int(((cls==j) & er).sum()) for j,k in enumerate(KEYS)}
    wb = int((white & er).sum()); dk = int((dark & er).sum())
    other = n - sum(counts.values()) - wb - dk
    rows.append((uf, col, n, counts, wb, dk, other))

print(f"{'UF':<8}{'vetor':<9}{'px':>8}  {'gratis':>8}{'2lotes':>8}{'consul':>8}{'semEnt':>8} {'rotulo':>7}{'traco':>7}{'transi':>7}  OUTRAS TINTAS")
flag=[]
for uf,col,n,c,wb,dk,other in rows:
    mine = {'#B59C74':'gratis','#806853':'gratis2lotes','#8E9F93':'consulta','#999999':'semEntrega'}[col]
    intruders = {k:v for k,v in c.items() if k!=mine and v>0}
    tag = '—' if not intruders else ' '.join(f'{k}:{v}' for k,v in intruders.items())
    if intruders and max(intruders.values()) > n*0.005: flag.append((uf,intruders))
    print(f"{uf:<8}{col:<9}{n:>8}  {c['gratis']:>8}{c['gratis2lotes']:>8}{c['consulta']:>8}{c['semEntrega']:>8} {wb:>7}{dk:>7}{other:>7}  {tag}")
print()
print('UFs com tinta estranha > 0.5% da área:', flag or 'NENHUMA')
np.save('union.npy', union)
