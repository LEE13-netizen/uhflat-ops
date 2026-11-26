import json,collections,datetime as dt,statistics as st,sys
rooms=json.load(open(sys.argv[1]))
D=lambda s:dt.date.fromisoformat(s)
los=[];bad=[];overlap=[];marks=collections.Counter();markLen=[]
occ=collections.Counter();co=collections.Counter();ci=collections.Counter();turn=collections.Counter();gap=collections.Counter();blk=collections.Counter()
long_rooms=set();per_room_res=collections.Counter()
for r,v in rooms.items():
    res=sorted([x for x in v if len(x)==2]); mk=[x for x in v if len(x)==3]
    for a,b,_ in mk:
        n=(D(b)-D(a)).days; markLen.append(n); marks[r]+=1
        for k in range(max(n,0)): blk[D(a)+dt.timedelta(k)]+=1
    for a,b in res:
        n=(D(b)-D(a)).days
        if n<=0: bad.append((r,a,b)); continue
        los.append(n); per_room_res[r]+=1
        if n>=30: long_rooms.add(r)
        for k in range(n): occ[D(a)+dt.timedelta(k)]+=1
        co[D(b)]+=1; ci[D(a)]+=1
    allv=sorted(res+[x[:2] for x in mk])
    for (a1,b1),(a2,b2) in zip(allv,allv[1:]):
        if D(a2)<D(b1): overlap.append((r,a1,b1,a2,b2))
    for (a1,b1),(a2,b2) in zip(res,res[1:]):
        if a2==b1: turn[D(b1)]+=1
        elif D(a2)>D(b1): gap[min((D(a2)-D(b1)).days,8)]+=1
print('reservations',len(los),'marked cells',len(markLen),'rooms with marks',len(marks),'mark nights avg',round(st.mean(markLen),1) if markLen else 0)
print('bad(<=0 nights)',len(bad),bad[:3]); print('overlaps (incl marks)',len(overlap)); print(overlap[:6])
c=collections.Counter(min(x,15) for x in los); print('LOS',sorted(c.items()),'mean',round(st.mean(los),2),'median',st.median(los))
print('LOS>=3: %.1f%%  >=7: %.1f%%  >=30: %d stays in %d rooms'%(100*sum(1 for x in los if x>=3)/len(los),100*sum(1 for x in los if x>=7)/len(los),sum(1 for x in los if x>=30),len(long_rooms)))
print('vacant gap nights between stays (8=8+)',sorted(gap.items()))
print('date       dow occ  %  CO  CI  turn blk')
for d in sorted(x for x in occ if dt.date(2026,10,26)<=x<=dt.date(2026,11,30)):
    print(d, d.strftime('%a'), '%3d %3d %3d %3d %3d %3d'%(occ[d], round(100*occ[d]/232), co[d], ci[d], turn[d], blk[d]))
w=[d for d in occ if dt.date(2026,10,26)<=d<=dt.date(2026,11,25)]
print('Oct26-Nov25: occ avg %.1f (%.0f%%), CO avg %.1f max %d, CI avg %.1f, sameDayTurn avg %.1f max %d'%(st.mean(occ[d] for d in w),100*st.mean(occ[d] for d in w)/232,st.mean(co[d] for d in w),max(co[d] for d in w),st.mean(ci[d] for d in w),st.mean(turn[d] for d in w),max(turn[d] for d in w)))
dow=collections.defaultdict(list)
for d in w: dow[d.strftime('%a')].append(co[d])
print('checkouts by weekday',{k:round(st.mean(v),1) for k,v in dow.items()})
# stay-cleaning load: for each day, stays in-house (not arrival, not departure) and full-clean days per 3-day cycle
sl=collections.Counter();full=collections.Counter()
for r,v in rooms.items():
    for x in v:
        if len(x)!=2: continue
        a,b=D(x[0]),D(x[1]); n=(b-a).days
        for k in range(1,n):
            sl[a+dt.timedelta(k)]+=1
            if k%3==2: full[a+dt.timedelta(k)]+=1
print('stay rooms/day avg %.1f, full-clean due/day avg %.1f, max %d'%(st.mean(sl[d] for d in w),st.mean(full[d] for d in w),max(full[d] for d in w)))
fut=[d for d in occ if d>dt.date(2026,11,30)]
print('Dec-Feb already booked: avg occ %.1f max %d'%(st.mean(occ[d] for d in fut),max(occ[d] for d in fut)))
