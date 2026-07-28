import re
s = open('p3.svg').read()
S = 300/72.0

def hexof(rgbstr):
    nums = [float(x.strip().rstrip('%')) for x in rgbstr.split(',')]
    return '#%02X%02X%02X' % tuple(round(n*255/100) for n in nums)

# all <path ...  fill="rgb(...)" ... d="..."/>
pat = re.compile(r'<path([^>]*?)d="([^"]*)"', re.S)
rows=[]
for m in pat.finditer(s):
    attrs, d = m.group(1), m.group(2)
    fm = re.search(r'\bfill="rgb\(([^)]*)\)"', attrs)
    if not fm: continue
    col = hexof(fm.group(1))
    nums = [float(x) for x in re.findall(r'-?\d+\.?\d*(?:e-?\d+)?', d)]
    xs = nums[0::2]; ys = nums[1::2]
    if not xs: continue
    rows.append((col, min(xs)*S, max(xs)*S, min(ys)*S, max(ys)*S, len(nums)))

from collections import Counter
print(Counter(r[0] for r in rows).most_common(15))
print('total filled paths', len(rows))
MAP = {'#B59C74','#806853','#8E9F93','#999999','#95816D','#BAC2BB','#C1C1C1','#A4A4A4'}
sel=[r for r in rows if r[0] in MAP]
sel.sort(key=lambda r:(r[0], r[3]))
print(f"{'color':<9} {'cx':>6} {'cy':>6}  bbox_x           bbox_y          npts")
for c,x0,x1,y0,y1,n in sel:
    print(f"{c:<9} {(x0+x1)/2:>6.0f} {(y0+y1)/2:>6.0f}  [{x0:>6.0f}-{x1:>6.0f}] [{y0:>6.0f}-{y1:>6.0f}] {n}")
