# Compares scripts/audit-placeholders.mjs measurements: loaded vs a loading
# state, above the fold - kind, width (4px), position (6px), height (8px).

import json,sys
L=json.load(open(sys.argv[1])); S=json.load(open(sys.argv[2])); label=sys.argv[3]
for u in L:
    l=L[u]; s=S.get(u,[])
    rows=[]
    for i in range(max(len(l),len(s))):
        a=l[i] if i<len(l) else None; b=s[i] if i<len(s) else None
        if a and a['y']>1000 and (not b or b['y']>1000): continue  # below the fold
        bad=[]
        if not a or not b: bad.append('missing')
        else:
            same = {('block','list'),('chart','block')}
            if a['k']!=b['k'] and (a['k'],b['k']) not in same: bad.append(f"kind {b['k']}->{a['k']}")
            if abs(a['w']-b['w'])>4: bad.append(f"w {b['w']}->{a['w']}")
            if abs(a['y']-b['y'])>6: bad.append(f"y {b['y']}->{a['y']}")
            if abs(a['h']-b['h'])>8 and not (b['h']>=640 and a['h']>=640): bad.append(f"h {b['h']}->{a['h']}")
        if bad: rows.append(f"  #{i} {(a or b)['t'] or (a or b)['k']}: {', '.join(bad)}")
    print(f"{'OK ' if not rows else 'BAD'} [{label}] {u}"); [print(r) for r in rows]
