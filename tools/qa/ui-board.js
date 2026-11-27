// 현황판 분류 칩 · 부서별 미마감 알림 시험 (테스트 데이터, 12/2 15:30)
const { chromium } = require('playwright'); const fs = require('fs'); const S = process.env.S;
const seed = JSON.parse(fs.readFileSync(S + '/data/seed.json', 'utf8'));
const D = '2026-12-02', Y = '2026-12-01', day = seed.roomDays[D].rooms, yday = seed.roomDays[Y].rooms;
const ids = st => Object.keys(day).filter(k => st.includes(day[k].stay)).sort();
const outs = ids(['퇴실', '퇴실·입실']), stays = ids(['연박']), frees = ids(['공실']), ins = ids(['입실', '퇴실·입실']);
const yOut = Object.keys(yday).filter(k => /퇴실/.test(yday[k].stay)).sort().slice(0, 3);
const at = t => Date.parse(`${D}T${t}:00+09:00`), by = (t, role) => ({ at: at(t), by: 'T', uid: 'u', role });
seed.roomSvc = {};
yOut.forEach(id => { seed.roomSvc[`${Y}__${id}`] = { date: Y, roomId: id, co: { at: Date.parse(`${Y}T10:00:00+09:00`), by: 'T', role: 'FO' } }; });
const set = (id, o) => { seed.roomSvc[`${D}__${id}`] = Object.assign({ date: D, roomId: id }, o); };
const sameDayIn = outs.filter(k => day[k].stay === '퇴실·입실');
sameDayIn.slice(0, 5).forEach(id => set(id, { co: by('10:00', 'FO'), done: by('12:00', 'HK'), hkAck: by('10:05', 'HK') }));   // 입실 가능 5
set(sameDayIn[5], { co: by('10:00', 'FO'), start: by('11:00', 'HK'), hkAck: by('10:05', 'HK') });                              // 청소 중
set(sameDayIn[6], { co: by('10:00', 'FO'), start: by('11:00', 'HK'), cleaned: by('12:00', 'HK'), hkAck: by('10:05', 'HK') });  // 점검 대기
stays.slice(0, 4).forEach(id => set(id, { reply: Object.assign(by('09:00', 'FO'), { type: 'time', window: '10:00~12:00', from: '10:00', to: '12:00', kinds: ['정비'] }) }));   // 요청 시간 지남
const defectRoom = sameDayIn[10];
seed.tasks = { t1: { kind: 'repair', title: '에어컨 안 됨', room: defectRoom.split('-')[1], building: defectRoom.split('-')[0], roomId: defectRoom, fromDept: 'HK', toDept: 'FM', status: '접수', priority: '주의', createdAt: at('11:00'), updatedAt: at('11:00'), ack: { HK: at('11:00') } } };
const R = []; const rec = (id, ok, note) => { R.push({ id, ok }); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} — ${note}`); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'Asia/Seoul' });
  await ctx.addInitScript(s => { try { ['FO','HK','FM','MG'].forEach(r => localStorage.setItem('opsFrameUi:guided:' + r, '1')); } catch (e) {} if (!localStorage.getItem('opsFrame:v1:property')) for (const c in s) localStorage.setItem('opsFrame:v1:' + c, JSON.stringify(s[c])); }, seed);
  const errs = []; let p;
  const open = async role => { if (p) await p.close(); p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.clock.install({ time: new Date(`${D}T15:30:00+09:00`) });
    await p.goto('http://127.0.0.1:8765/local.html#' + role); await p.waitForTimeout(500); const nm = { fo: '프론트', hk: '키핑', fm: '시설', mg: '관리자' }[role]; const k = p.locator('#lock button:visible', { hasText: nm }).first(); if (await k.count()) await k.click(); await p.waitForTimeout(700); };
  const bar = async () => (await p.locator('#openbar').isVisible()) ? (await p.locator('#openbar').innerText()).replace(/\s+/g, ' ') : '(없음)';
  const num = (t, label) => { const m = t.match(new RegExp(label + ' (\\d+)')); return m ? +m[1] : 0; };
  // 프론트
  await open('fo'); let t = await bar();
  rec('프론트 미마감 줄', /어제 미완료 3/.test(t) && /입실 예정 객실 하자 1/.test(t) && /퇴실 시간 지남/.test(t) && /입실 준비 안 됨/.test(t), t.slice(0, 160));
  const title = await p.title(); rec('탭 제목 숫자', /^\(\d+\) /.test(title), title);
  await p.locator('#openbar [data-bfset="o-indefect"]').click(); await p.waitForTimeout(500);
  const tiles = await p.locator('.rt[data-room]').evaluateAll(es => es.map(e => e.dataset.room));
  rec('알림 누르면 그 객실만', tiles.length === 1 && tiles[0] === defectRoom, `현황판 ${tiles.join(',')} / 정답 ${defectRoom}`);
  await p.screenshot({ path: S + '/shots/board-fo-alert.png' });
  // 분류 칩
  await p.locator('.bfline [data-bf]').click().catch(() => {}); await p.waitForTimeout(300);
  for (const [k, want, name] of [['c-free', frees.length, '공실'], ['c-out', outs.length, '퇴실'], ['c-in', ins.length, '입실 예정'], ['c-stay', stays.length, '재실'], ['c-cleaning', 1, '청소 중'], ['c-insp', 1, '점검 대기'], ['c-ready', 5, '입실 가능'], ['c-defect', 1, '시설 하자'], ['c-prev', 0, '어제 미완료(오늘 객실판)']]) {
    const btn = p.locator(`.cats [data-bf="${k}"]`); const lab = (await btn.innerText()).replace(/\s+/g, ' ');
    if (await btn.isDisabled()) { rec(`분류 ${name}`, want === 0 || k === 'c-prev', `${lab} (비활성)`); continue; }
    await btn.click(); await p.waitForTimeout(400);
    const n = await p.locator('.rt[data-room]').count();
    rec(`분류 ${name}`, n === want || (k === 'c-prev' && n === 3), `칩 "${lab}" · 화면 ${n}칸 · 정답 ${k === 'c-prev' ? 3 : want}`);
    await btn.click(); await p.waitForTimeout(300);
  }
  // 키핑
  await open('hk'); t = await bar();
  rec('키핑 미마감 줄', /어제 미완료 3/.test(t) && /요청 시간 지난 재실 4/.test(t) && /점검 대기 1/.test(t), t.slice(0, 160));
  await p.screenshot({ path: S + '/shots/board-hk-alert.png' });
  // 시설
  await open('fm'); t = await bar();
  rec('시설 미마감 줄', /오늘 입실 객실 하자 1/.test(t) && /열린 시설 업무 1/.test(t), t.slice(0, 160));
  // 다른 날짜 보기에서는 숨김
  await open('fo'); await p.locator('[data-rdate="2026-12-03"]').first().click(); await p.waitForTimeout(400);
  rec('내일 화면에선 알림 숨김', !(await p.locator('#openbar').isVisible()), await bar());
  console.log('page errors', errs.slice(0, 3), `pass ${R.filter(r => r.ok).length}/${R.length}`);
  await b.close();
})();
