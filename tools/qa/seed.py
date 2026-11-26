# 실제 예약표에서 읽어 둔 객실별 숙박 기간(이름 없음)으로 로컬 시험 데이터를 만든다. 표시: 테스트 데이터
import json,datetime as dt,sys
S=sys.argv[1]; r0=json.load(open(S+'/data/stayIndex.json'))
OFF=dt.timedelta(days=35)   # 실제 10/28(수, 만실·퇴실 88) 패턴을 12/2(수)로 옮긴다
sh=lambda s:(dt.date.fromisoformat(s)+OFF).isoformat()
r={k:[[sh(x[0]),sh(x[1])]+x[2:] for x in v] for k,v in r0.items()}
D=dt.date.fromisoformat
rooms={}
for k in r:
    b,no=k.split('-',1); rooms[k]={"b":b,"no":no,"dong":"","building":"본관" if b=="main" else "신관","type":""}
for k,t in [("main-203","창고"),("main-213","장기형 숙소(판매불가)"),("main-1611","")]:
    rooms[k]={"b":"main","no":k.split('-')[1],"dong":"A","building":"본관","type":t}
master={"buildings":[{"id":"main","name":"본관"},{"id":"annex","name":"신관"}],"rooms":rooms,"src":{"reservation":{"at":1796164200000,"file":"테스트 데이터(실제 예약 패턴·이름 없음)"}}}
def day(T):
    out={}
    for k,v in r.items():
        res=[x for x in v if len(x)==2]
        leave=any(D(b)==T for a,b in res); arrive=any(D(a)==T for a,b in res)
        mid=[(a,b) for a,b in res if D(a)<T<D(b)]
        if mid:
            d=(T-D(mid[0][0])).days
            out[k]={"stay":"연박","clean":"전체재실" if d%3==2 else "재실청소","flags":[],"day":d}
        elif leave and arrive: out[k]={"stay":"퇴실·입실","clean":"객실청소","flags":[],"sameDayIn":True}
        elif leave: out[k]={"stay":"퇴실","clean":"객실청소","flags":[],"sameDayIn":False}
        elif arrive: out[k]={"stay":"입실","clean":"","flags":[]}
        else: out[k]={"stay":"공실","clean":"","flags":[]}
    return out
days={}
for i in range(-1,4):
    T=dt.date(2026,12,2)+dt.timedelta(i); iso=T.isoformat()
    days[iso]={"date":iso,"rooms":day(T),"src":master["src"]}
seed={"property":{"main":master},"roomDays":days,"stayIndex":{"main":{"from":"2026-11-30","to":"2027-03-30","at":1796164200000,"file":"테스트 데이터","borders":True,"rooms":r}}}
json.dump(seed,open(S+'/data/seed.json','w'),ensure_ascii=False)
import collections; c=collections.Counter(x["stay"] for x in days["2026-12-02"]["rooms"].values()); print('2026-12-02',dict(c))
