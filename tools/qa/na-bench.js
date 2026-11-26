// 야간 검수(직원용) 정산 엔진 정확도 시험대
// 실제 예약표 숙박 기간(본관, 날짜만)에 가상 채널·예약번호·이름·요금을 붙이고, 오류를 정답과 함께 심는다.
// 월 매출 정산(mmRun)과 일일 정산대조(runCompare 버튼)를 실제 페이지 코드로 돌려 정답과 비교한다.
const { chromium } = require('playwright'); const fs = require('fs');
const S = process.env.S, SEED = +(process.argv[2] || 7), M = process.argv[3] || '2026-11';
let rs = SEED >>> 0; const rnd = () => { rs = (rs + 0x6D2B79F5) >>> 0; let t = rs; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const D = s => new Date(s + 'T00:00:00Z'), add = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }, days = (a, b) => Math.round((D(b) - D(a)) / 864e5);
const idx = JSON.parse(fs.readFileSync(S + '/data/stayIndex.json', 'utf8'));
// 실제 숙박: 본관, 체크인 10/20~11/30, 퇴실 ≤ 12/10, 30박 이하
const stays = [];
Object.entries(idx).forEach(([k, v]) => { if (!k.startsWith('main-')) return; v.filter(x => x.length === 2).forEach(([a, b]) => { if (a >= '2026-10-20' && a <= '2026-11-30' && b <= '2026-12-10' && days(a, b) <= 30) stays.push({ room: k.slice(5), checkin: a, checkout: b }); }); });
const CH = [['아고다', 10], ['부킹닷컴', 10], ['익스피디아', 10], ['야놀자', 12], ['여기어때', 16], ['네이버', 10], ['트립닷컴', 16]];
const FIRST = ['KIM', 'LEE', 'PARK', 'CHOI', 'JUNG', 'KANG', 'CHO', 'YOON', 'JANG', 'LIM', 'SMITH', 'WANG', 'TANAKA', 'NGUYEN'];
const LAST = ['MINSU', 'JIHO', 'SEOYEON', 'HAYOON', 'DOYUN', 'JOHN', 'WEI', 'YUKI', 'ANH', 'SORA', 'JUNWOO', 'EMMA'];
const used = new Set; const resNoOf = len => { let s; do { s = String(1 + Math.floor(rnd() * 9)); while (s.length < len) s += Math.floor(rnd() * 10); } while (used.has(s)); used.add(s); return s; };
// 라벨 배정
const R = stays.map((s, i) => {
  const [ch, len] = pick(CH); const nights = days(s.checkin, s.checkout);
  const rate = Math.round((70 + rnd() * 80)) * 1000;
  const name = pick(FIRST) + ' ' + pick(LAST);
  const crosses = s.checkin.slice(0, 7) !== add(s.checkout, -1).slice(0, 7);
  const r = { ...s, ch, resNo: resNoOf(len), name, nights, rate, crosses, label: 'ok', sub: '' };
  const x = rnd();
  if (crosses) { r.label = x < .3 ? 'split_one' : x < .45 ? 'var_rates_nolines' : x < .6 ? 'var_rates_lines' : 'ok'; }
  else if (x < .05) r.label = 'amt';
  else if (x < .08) r.label = 'sheet_miss';
  else if (x < .10) r.label = 'cancel_billed';
  else if (x < .12) r.label = 'cancel_clean';
  else if (x < .15) r.label = 'typo';
  else if (x < .18) r.label = 'plat_miss';
  else if (x < .26) { r.label = 'ok'; r.sub = 'nocmt_tail'; }      // 둘째 밤부터 코멘트 없이 금액만
  else if (x < .32) { r.label = 'ok'; r.sub = 'name_only'; }       // 코멘트에 예약번호 없이 이름만
  else if (x < .38) { r.label = 'ok'; r.sub = 'round1'; }          // 수수료 반올림 1원 차이
  return r;
});
// 시트 칸 · 플랫폼 행 만들기
const cells = [], plat = {}; const spans = [];
R.forEach(r => {
  const nightsArr = Array.from({ length: r.nights }, (_, i) => add(r.checkin, i));
  let rates = nightsArr.map(() => r.rate);
  if (r.label === 'var_rates_nolines' || r.label === 'var_rates_lines') rates = nightsArr.map(d => [5, 6].includes(D(d).getUTCDay()) ? r.rate + 40000 : r.rate);
  let P = rates.reduce((a, b) => a + b, 0);
  const cancelled = r.label === 'cancel_billed' || r.label === 'cancel_clean';
  if (r.label !== 'plat_miss') {
    (plat[r.ch] = plat[r.ch] || []).push({ bld: 'main', resNo: r.resNo, resNoFull: r.resNo, name: r.name, amount: r.sub === 'round1' ? P + 1 : P, rawAmount: Math.round(P / 0.85), feePct: 15, feeDerived: 'none', checkin: r.checkin, cancelled, phone: '', altNos: [], checkout: r.checkout, nights: r.nights, altIds: [r.resNo] });
  }
  r.P = P;
  if (r.label === 'sheet_miss' || r.label === 'cancel_clean') return;
  const resInCmt = r.label === 'typo' ? r.resNo.slice(0, -1) + ((+r.resNo.slice(-1) + 3) % 10) : r.resNo;
  const lines = r.label === 'var_rates_lines' ? '\n' + nightsArr.map((d, i) => `${d}\t${rates[i].toLocaleString('en-US')}`).join('\n') : '';
  if (r.label === 'split_one') {   // 월 경계 숙박을 첫날 한 칸(병합)에 전액
    cells.push({ date: r.checkin, room: r.room, amount: P, channel: r.ch, reservationNo: r.resNo, guestName: r.name, nonOta: false, noComment: false, rawComment: `${r.ch} ${r.resNo} ${r.name}` });
    spans.push({ room: r.room, ad: r.checkin, n: r.nights, rooms: [r.room] });
    return;
  }
  nightsArr.forEach((d, i) => {
    let amt = rates[i];
    if (r.label === 'amt' && i === 0) amt += pick([10000, -15000, 20000]);
    const tail = r.sub === 'nocmt_tail' && i > 0;
    const cmt = tail ? '' : r.sub === 'name_only' ? `${r.ch} ${r.name}` : `${r.ch} ${resInCmt} ${r.name}${lines}`;
    cells.push({ date: d, room: r.room, amount: amt, channel: tail ? '' : r.ch, reservationNo: tail || r.sub === 'name_only' ? '' : resInCmt, guestName: tail ? '' : r.name, nonOta: false, noComment: tail, rawComment: cmt });
  });
});
const truthCount = R.reduce((o, r) => (o[r.label + (r.sub ? '/' + r.sub : '')] = (o[r.label + (r.sub ? '/' + r.sub : '')] || 0) + 1, o), {});

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ timezoneId: 'Asia/Seoul' });
  await ctx.route(/cdnjs\.cloudflare\.com|fonts\.googleapis|fonts\.gstatic/, r => r.request().url().includes('cdnjs') ? r.fulfill({ contentType: 'application/javascript', body: 'window.XLSX=window.XLSX||{utils:{decode_range(){return{s:{r:0,c:0},e:{r:0,c:0}}},encode_cell(){return""}}};window.forge=window.forge||{};window.JSZip=window.JSZip||function(){};window.Chart=window.Chart||function(){return{destroy(){},update(){}}};' }) : r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 150)));
  p.on('dialog', d => d.accept());
  await p.goto('http://127.0.0.1:8765/na.html'); await p.waitForTimeout(1500);
  const out = await p.evaluate(({ cells, plat, spans, M }) => {
    const res = {};
    try {
      sheetCells = cells.map(c => Object.assign({}, c, { date: new Date(c.date + 'T00:00:00Z') }));   // 실제 파서처럼 날짜 객체
      sheetRows = cells.filter(c => c.channel && c.reservationNo).map(c => ({ date: new Date(c.date + 'T00:00:00Z'), room: c.room, amount: c.amount, channel: c.channel, reservationNo: c.reservationNo, nonOta: false, comment: c.rawComment }));
      sheetSpans = spans; sheetDates = []; for (let d = new Date('2026-10-01T00:00:00Z'); d <= new Date('2026-12-31T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) sheetDates.push(d.toISOString().slice(0, 10));
      __mmIdx = null; mmSettleFiles = [];
      platformFilesData = Object.entries(plat).map(([ch, rows], i) => {
        const e = { id: 'p' + i, file: { name: ch + '.xlsx' }, channelType: ch, rows, needsPassword: false, byResNo: {}, byResNoFull: {}, byResNoSegment: {} };
        rows.forEach(r => { const k = normKey(r.resNo); (e.byResNo[k] = e.byResNo[k] || []).push(r); });
        return e;
      });
      const R = mmRun(M, 0);
      res.mm = { verdict: R.verdict, s1: R.s1, s2: R.s2, s3: R.s3, stage3: R.stage3, T: { sheetAllM: R.T.sheetAllM, matchedS: R.T.matchedS, platC: R.T.platC, diff: R.T.diff, identityGap: R.T.identityGap, tolTotal: R.T.tolTotal }, rows: R.rows.map(r => ({ kind: r.kind, resNo: r.resNo, status: r.status, codes: r.issues.map(i => i.code), msg: (r.issues[0] || {}).msg || '', notes: r.notes, S_M: r.S_M, C_M: r.C_M, P: r.P, Stot: r.Stot })) };
    } catch (e) { res.mmErr = e.message + ' ' + (e.stack || '').split('\n')[1]; }
    try {
      const tol = document.getElementById('tolerance'); if (tol) tol.value = '0';
      document.getElementById('runCompare').click();
      res.daily = reconciled.map(r => ({ resNo: r.reservationNo || r.resNo || '', status: r.status, ch: r.channel, sheetAmount: r.sheetAmount, platAmount: r.platformAmount !== undefined ? r.platformAmount : r.platAmount, date: r.date ? fmtDate(r.date) : '' }));
    } catch (e) { res.dailyErr = e.message; }
    return res;
  }, { cells, plat, spans, M });
  fs.writeFileSync(`${S}/data/na-out-${SEED}.json`, JSON.stringify({ R, out, errs }, null, 0));
  console.log(JSON.stringify({ stays: R.length, cells: cells.length, truthCount, mmErr: out.mmErr, dailyErr: out.dailyErr, pageErrs: errs.slice(0, 5), verdict: out.mm && out.mm.verdict, T: out.mm && out.mm.T, dailyN: out.daily && out.daily.length }, null, 1));
  await b.close();
})();
