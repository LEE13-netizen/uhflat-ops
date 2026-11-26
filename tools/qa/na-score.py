import json,sys,collections
d=json.load(open(sys.argv[1])); R=d['R']; mm=d['out']['mm']; daily=d['out']['daily']
M='2026-11'
def touches(r):
    import datetime as dt
    a=dt.date.fromisoformat(r['checkin']); b=dt.date.fromisoformat(r['checkout'])
    return any((a+dt.timedelta(i)).isoformat()[:7]==M for i in range((b-a).days))
byRes=collections.defaultdict(list)
for row in mm['rows']: byRes[str(row['resNo'])].append(row)
EXP={'amt':{'AMT'},'sheet_miss':{'SHEET_MISS'},'cancel_billed':{'CANCEL'},'split_one':{'SPLIT_ERR'},'typo':{'INFO','SHEET_MISS','PLAT_MISS'},'plat_miss':{'PLAT_MISS'}}
OKL={'ok','var_rates_lines','cancel_clean'}
stat=collections.defaultdict(collections.Counter); fp=[]; fn=[]
for r in R:
    if not touches(r): continue
    lab=r['label']+('/'+r['sub'] if r['sub'] else '')
    rows=byRes.get(r['resNo'],[])
    if r['label']=='typo':
        typo=r['resNo'][:-1]+str((int(r['resNo'][-1])+3)%10); rows=rows+byRes.get(typo,[])
    codes=set(c for x in rows for c in x['codes']); st=set(x['status'] for x in rows)
    flagged=bool(st-{'OK','LACK','ZERO'}) 
    if r['label'] in EXP:
        hit=bool(codes & EXP[r['label']])
        stat[lab]['detected' if hit else ('flagged_other' if flagged else 'missed')]+=1
        if not hit: fn.append((lab,r['resNo'],sorted(st),rows[0]['msg'][:90] if rows else 'no row'))
    elif r['label']=='var_rates_nolines':
        stat[lab]['SPLIT_warn' if 'SPLIT' in codes else ('ok' if not flagged else 'other')]+=1
    else:
        if not rows: stat[lab]['absent']+=1
        elif flagged: stat[lab]['FALSE_ALARM']+=1; fp.append((lab,r['resNo'],sorted(codes),rows[0]['msg'][:100]))
        else: stat[lab]['ok']+=1
for k in sorted(stat): print(f'{k:22}', dict(stat[k]))
print('\nverdict',mm['verdict'],'T',mm['T'])
print('\nFALSE ALARMS',len(fp)); [print(' ',x) for x in fp[:8]]
print('MISSED/WRONG',len(fn)); [print(' ',x) for x in fn[:8]]
print('\nDAILY statuses',collections.Counter(x['status'] for x in daily).most_common())
