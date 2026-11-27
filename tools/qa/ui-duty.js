// 근무 인원(부서별 총 인원 · 근무 시작/끝 · 14시간 자동 종료) + 운영 기록(인원·정비 진행·고객 요청 처리 시간) — 테스트 데이터
const { chromium } = require('playwright'); const fs = require('fs'); const S = process.env.S;
const seed = JSON.parse(fs.readFileSync(S + '/data/seed.json', 'utf8'));
const D1 = '2026-12-01', D2 = '2026-12-02', T = (d, hm) => new Date(`${d}T${hm}:00+09:00`).getTime();
// 직원 목록: 키핑 5(활성) + 1(비활성), 프론트 2, 시설 1
const staff = {}; [['김민지', 'HK'], ['박서연', 'HK'], ['이하늘', 'HK'], ['최유나', 'HK'], ['정다은', 'HK'], ['퇴사자', 'HK', false], ['프론트A', 'FO'], ['프론트B', 'FO'], ['시설A', 'FM']]
  .forEach(([name, dept, active], i) => { staff['s' + i] = { name, dept, active: active !== false }; });
// 12/1 근무: 키핑 4명 09~17, 프론트 2명 07~16, 시설 1명 18시 시작(끝 안 누름 → 14시간 뒤 자동 종료)
const duty = {}; let n = 0; const ev = (type, dept, name, at) => { duty['d' + (n++)] = { type, dept, name, uid: '', personal: false, at, date: new Date(at + 9 * 3600e3).toISOString().slice(0, 10) }; };
['김민지', '박서연', '이하늘', '최유나'].forEach(x => { ev('start', 'HK', x, T(D1, '09:00')); ev('end', 'HK', x, T(D1, '17:00')); });
['프론트A', '프론트B'].forEach(x => { ev('start', 'FO', x, T(D1, '07:00')); ev('end', 'FO', x, T(D1, '16:00')); });
ev('start', 'FM', '시설A', T(D1, '18:00'));
ev('start', 'HK', '정다은', T(D2, '08:00'));   // 오늘 근무 중 1명
// 12/1 정비: 퇴실 56실 10:00부터 3분 간격 시작, 40분 뒤 완료 → 마지막 13:25 · 재실 20실 완료
const R1 = seed.roomDays[D1].rooms, outs = Object.keys(R1).filter(k => /^퇴실/.test(R1[k].stay)).sort(), stays = Object.keys(R1).filter(k => R1[k].stay === '연박').sort().slice(0, 20);
const svc = {};
outs.forEach((id, i) => { const s0 = T(D1, '10:00') + i * 180000; svc[D1 + '__' + id] = { date: D1, roomId: id, co: { at: s0 - 3600000 }, start: { at: s0 }, cleaned: { at: s0 + 2400000 }, done: { at: s0 + 2400000 } }; });
stays.forEach((id, i) => { svc[D1 + '__' + id] = { date: D1, roomId: id, reply: { type: 'time', window: '11:00~13:00' }, done: { at: T(D1, '12:00') + i * 60000 } }; });
// 고객 요청 3건(30·60·90분) · 불출 2건(20·40분)
const tasks = {}; [30, 60, 90].forEach((m, i) => { const c = T(D1, '10:00') + i * 600000; tasks['t' + i] = { kind: 'request', title: '고객 요청 ' + i, status: '완료', priority: '보통', fromDept: 'FO', toDept: 'HK', createdAt: c, updatedAt: c + m * 60000, doneAt: c + m * 60000, room: '' }; });
const deliveries = {}; [20, 40].forEach((m, i) => { const a = T(D1, '14:00') + i * 600000; deliveries['v' + i] = { date: D1, roomId: outs[i], at: a, items: [], done: { at: a + m * 60000 } }; });
Object.assign(seed, { staff, duty, roomSvc: svc, tasks, deliveries });
// 기대값은 데이터에서 계산(실제 예약 패턴 56실 / 합성 패턴 등 퇴실 수가 달라도 맞게)
const NO = outs.length, at = i => T(D1, '10:00') + i * 180000 + 2400000, hhmm = t => new Date(t + 9 * 3600e3).toISOString().slice(11, 16);
const E = { end: hhmm(at(NO - 1)), p50: hhmm(at(Math.ceil(NO * 0.5) - 1)), p90: hhmm(at(Math.ceil(NO * 0.9) - 1)), perHr: String(Math.round((NO + 20) / 32 * 10) / 10) };
const R = []; const rec = (id, ok, note) => { R.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} — ${note}`); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR', acceptDownloads: true });
  await ctx.addInitScript(s => { try { ['FO','HK','FM','MG'].forEach(r => localStorage.setItem('opsFrameUi:guided:' + r, '1')); } catch (e) {} if (!localStorage.getItem('opsFrame:v1:property')) for (const c in s) localStorage.setItem('opsFrame:v1:' + c, JSON.stringify(s[c])); }, seed);
  const errs = []; let p;
  const open = async (role, time) => { if (p) await p.close(); p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.clock.install({ time: new Date(`${D2}T${time}:00+09:00`) });
    await p.goto('http://127.0.0.1:8765/local.html#' + role); await p.waitForTimeout(600);
    const k = p.locator('#lock button:visible', { hasText: { mg: '관리자', hk: '키핑', fo: '프론트' }[role] }).first(); if (await k.count()) await k.click(); await p.waitForTimeout(600); };
  const go = async tab => { await p.click('#menuBtn'); await p.waitForTimeout(400); await p.locator(`[data-tab="${tab}"]`).filter({ visible: true }).first().click(); await p.waitForTimeout(600); };
  // 1) 키핑: 근무 시작 전 알림 → 이름 고르고 근무 시작 → 근무 끝
  await open('hk', '10:00');
  const bar = await p.locator('.dutybar').count();
  await p.locator('.dutybar [data-tab="shift"]').click(); await p.waitForTimeout(500);
  const hk0 = (await p.locator('.dutyr', { hasText: '키핑' }).innerText()).replace(/\s+/g, ' ');
  rec('근무 시작 전 알림 · 부서별 근무 중/전체(비활성 제외)', bar === 1 && /키핑 1 \/ 전체 5명/.test(hk0), `알림 ${bar} · "${hk0.slice(0, 40)}"`);
  await p.selectOption('#dutyName', '김민지'); await p.click('[data-duty="start"]'); await p.waitForTimeout(500);
  const hk1 = (await p.locator('.dutyr', { hasText: '키핑' }).innerText()).replace(/\s+/g, ' '), me1 = await p.locator('#dutyCard').innerText();
  await go('svc'); const bar2 = await p.locator('.dutybar').count();
  rec('근무 시작 → 근무 중 2명 · 알림 사라짐', /키핑 2 \/ 전체 5명/.test(hk1) && /김민지/.test(me1) && /근무 중/.test(me1) && bar2 === 0, `"${hk1.slice(0, 50)}" · 다른 화면 알림 ${bar2}`);
  await go('shift'); await p.click('[data-duty="end"]'); await p.waitForTimeout(500);
  const hk2 = (await p.locator('.dutyr', { hasText: '키핑' }).innerText()).replace(/\s+/g, ' ');
  const fm = (await p.locator('.dutyr', { hasText: '시설' }).innerText()).replace(/\s+/g, ' ');
  rec('근무 끝 · 끝 안 누른 근무는 14시간 뒤 자동 종료', /키핑 1 \/ 전체 5명/.test(hk2) && /시설 0 \/ 전체 1명/.test(fm), `"${hk2.slice(0, 30)}" · "${fm.slice(0, 30)}"`);
  const saved = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('opsFrame:v1:duty') || '{}')).filter(x => x.name === '김민지' && x.date === '2026-12-02').map(x => x.type).join(','));
  rec('근무 시작·끝은 기록으로 남음(추가만)', saved === 'start,end', saved);
  // 2) 관리자: 운영 기록
  await open('mg', '10:00'); await go('dash'); await p.waitForTimeout(1200);
  const row = (await p.locator('#olog tr[data-ologsel="2026-12-01"]').innerText()).replace(/\s+/g, ' ');
  rec(`운영 기록 12/1 줄(키핑 4명 · 퇴실 ${NO}/${NO} · ${E.p50}/${E.p90}/${E.end} · ${E.perHr}방/인시)`, row.startsWith(`12/01 4 / — ${NO}/${NO} ${E.p50} · ${E.p90} · ${E.end}`) && row.includes(' ' + E.perHr + ' '), row);
  rec('고객 요청 3건 처리 1시간 · 불출 2건 30분', /3 1시간 0분/.test(row) && /2 30분/.test(row), row);
  await p.click('#olog tr[data-ologsel="2026-12-01"]'); await p.waitForTimeout(400);
  const sum = (await p.locator('#olog').innerText()).replace(/\s+/g, ' ');
  const svg = await p.locator('#olog svg.ochart rect').count();
  rec('그날 시간대 그래프 + 요약', svg === 18 && /키핑 근무 최대 4명\(근무 32시간\)/.test(sum) && /프론트 2/.test(sum) && sum.includes('50% ' + E.p50), `막대 ${svg} · ${sum.match(/키핑 근무 최대[^|]*/)?.[0]}`);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-olog="csv"]')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  const line = csv.split('\r\n').find(l => l.startsWith('"2026-12-01"')) || '';
  rec('CSV 내려받기', /^﻿"날짜"/.test(csv) && line.includes(`"${NO}","${NO}"`) && line.includes(`"${E.end}"`), `${dl.suggestedFilename()} · ${line.slice(0, 90)}`);
  await p.locator('#olog').screenshot({ path: S + '/shots/olog.png' });
  if (errs.length) { console.log('errors', errs); R.push(false); }
  await b.close(); console.log(`pass ${R.filter(Boolean).length}/${R.length}`);
})();
