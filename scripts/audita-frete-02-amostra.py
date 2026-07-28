import re, numpy as np
from PIL import Image, ImageDraw
from collections import Counter

S = 300/72.0
svg = open('p3.svg').read()
img = Image.open('p3-003.png').convert('RGB')
A = np.asarray(img).astype(int)

INK = {'#B59C74':'gratis', '#806853':'gratis2lotes', '#8E9F93':'consulta', '#999999':'semEntrega'}

def hexof(t):
    n=[float(x.strip().rstrip('%')) for x in t.split(',')]
    return '#%02X%02X%02X'%tuple(round(v*255/100) for v in n)

def flatten(d):
    """Return list of subpaths (each a list of (x,y) in raster px)."""
    toks = re.findall(r'[MLCZmlcz]|-?\d*\.?\d+(?:e-?\d+)?', d)
    subs, cur, pos, i = [], [], (0,0), 0
    cmd = None
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t; i += 1
            if cmd in 'Zz':
                if cur: subs.append(cur); cur = []
            continue
        if cmd in 'ML':
            x,y = float(toks[i])*S, float(toks[i+1])*S; i += 2
            if cmd == 'M':
                if cur: subs.append(cur)
                cur = [(x,y)]
            else: cur.append((x,y))
            pos = (x,y)
        elif cmd == 'C':
            p = [float(v) for v in toks[i:i+6]]; i += 6
            p1,p2,p3 = (p[0]*S,p[1]*S),(p[2]*S,p[3]*S),(p[4]*S,p[5]*S)
            p0 = pos
            for k in range(1,13):
                u = k/12
                x = (1-u)**3*p0[0]+3*(1-u)**2*u*p1[0]+3*(1-u)*u*u*p2[0]+u**3*p3[0]
                y = (1-u)**3*p0[1]+3*(1-u)**2*u*p1[1]+3*(1-u)*u*u*p2[1]+u**3*p3[1]
                cur.append((x,y))
            pos = p3
        else:
            i += 1
    if cur: subs.append(cur)
    return subs

def shoelace(pts):
    x=np.array([p[0] for p in pts]); y=np.array([p[1] for p in pts])
    return abs(np.dot(x,np.roll(y,-1))-np.dot(y,np.roll(x,-1)))/2

polys=[]
for m in re.finditer(r'<path([^>]*?)d="([^"]*)"', svg, re.S):
    fm = re.search(r'\bfill="rgb\(([^)]*)\)"', m.group(1))
    if not fm: continue
    col = hexof(fm.group(1))
    if col not in INK: continue
    subs = flatten(m.group(2))
    if not subs: continue
    big = max(subs, key=shoelace)
    if shoelace(big) < 400: continue
    xs=[p[0] for p in big]; ys=[p[1] for p in big]
    # skip legend swatches (left column x<520, and the right-hand swatch x>2200)
    cx, cy = sum(xs)/len(xs), sum(ys)/len(ys)
    if cx < 520 or cy > 3450: continue   # legend swatches only
    polys.append((col, big, cx, cy, shoelace(big), min(xs),max(xs),min(ys),max(ys)))

print('map polygons found:', len(polys))

results=[]
for col, pts, cx, cy, area, x0,x1,y0,y1 in polys:
    msk = Image.new('L', img.size, 0)
    ImageDraw.Draw(msk).polygon(pts, fill=255)
    m = np.asarray(msk) > 0
    # erode so we never sample a border stroke or a label edge
    from scipy import ndimage
    m = ndimage.binary_erosion(m, np.ones((9,9)), iterations=1)
    if m.sum() < 30:
        m = np.asarray(msk) > 0
    px = A[m]
    cnt = Counter(map(tuple, px))
    top = [( '#%02X%02X%02X'%c, n) for c,n in cnt.most_common(3)]
    modal = top[0][0]
    frac = top[0][1]/m.sum()
    results.append(dict(vector=col, modal=modal, frac=round(frac,3),
                        cx=int(cx), cy=int(cy), area=int(area), top=top,
                        bbox=(int(x0),int(x1),int(y0),int(y1)), npx=int(m.sum())))

results.sort(key=lambda r: -r['area'])
for r in results:
    print(f"vec {r['vector']} modal {r['modal']} frac{r['frac']:>6} c=({r['cx']:>4},{r['cy']:>4}) area={r['area']:>8} npx={r['npx']:>7} bbox={r['bbox']}")
import json; json.dump(results, open('results.json','w'))
