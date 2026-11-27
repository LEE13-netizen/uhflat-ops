// VIP 객실(인스펙 필요) 시험 — 테스트 데이터, 12/2
const { chromium } = require('playwright'); const fs = require('fs'); const S = process.env.S;
const seed = JSON.parse(fs.readFileSync(S + '/data/seed.json', 'utf8'));
const D = '2026-12-02', day = seed.roomDays[D].rooms;
const turn = Object.keys(day).filter(k => day[k].stay === '퇴실·입실' && k.startsWith('main')).sort()[0];
const empty = Object.keys(day).find(k => day[k].stay === '입실') || Object.keys(day).find(k => day[k].stay === '공실');
const R = []; const rec = (id, ok, note) => { R.push({ id, ok }); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} — ${note}`); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'Asia/Seoul' });
  await ctx.addInitScript(s => { try { ['FO','HK','FM','MG'].forEach(r => localStorage.setItem('opsFrameUi:guided:' + r, '1')); } catch (e) {} if (!localStorage.getItem('opsFrame:v1:property')) for (const c in s) localStorage.setItem('opsFrame:v1:' + c, JSON.stringify(s[c])); }, seed);
  const errs = [], dlg = []; let p;
  const open = async (role, time) => { if (p) await p.close(); p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => { dlg.push(d.message()); d.accept(); });
    await p.clock.install({ time: new Date(`${D}T${time || '09:00'}:00+09:00`) }); await p.goto('http://127.0.0.1:8765/local.html#' + role); await p.waitForTimeout(500);
    const nm = { fo: '프론트', hk: '키핑', fm: '시설' }[role]; const k = p.locator('#lock button:visible', { hasText: nm }).first(); if (await k.count()) await k.click(); await p.waitForTimeout(600); };
  const room = async id => {   // 객실 칸은 현황판에 있다(키핑·시설은 첫 화면이 다르므로 현황판으로 먼저)
    if (!(await p.locator(`.rt[data-room="${id}"]`).filter({ visible: true }).count())) { await p.click('#menuBtn'); await p.waitForTimeout(350); await p.locator('[data-tab="board"]').filter({ visible: true }).first().click(); await p.waitForTimeout(500); }
    await p.locator(`.rt[data-room="${id}"]`).first().click(); await p.waitForTimeout(400); };
  const closeD = async () => { const x = p.locator('#dlgX'); if (await x.isVisible()) await x.click(); await p.waitForTimeout(200); };
  const doc = (id, d) => p.evaluate(([k]) => JSON.parse(localStorage.getItem('opsFrame:v1:roomSvc') || '{}')[k] || null, [`${d || D}__${id}`]);
  const tap = async sel => { const l = p.locator(sel).first(); await l.evaluate(e => e.scrollIntoView({ block: 'center' })); await l.click(); await p.waitForTimeout(350); };
  // 1) 프론트: VIP 지정(퇴실일까지)
  await open('fo', '08:30'); await room(turn);
  await p.fill('#dlg .vipnote', 'VIP 회원 · 웰컴 과일'); await p.selectOption('#dlg .vipscope', 'stay'); await tap('#dlg [data-svc="vipset"]');
  const d1 = await doc(turn); const nextDays = await p.evaluate(([id, D]) => { const m = JSON.parse(localStorage.getItem('opsFrame:v1:roomSvc') || '{}'); return Object.keys(m).filter(k => k.endsWith('__' + id) && k > D + '__' && m[k].vip).map(k => k.slice(0, 10)); }, [turn, D]);
  rec('프론트 VIP 지정(퇴실일까지)', d1 && d1.vip && d1.vip.note === 'VIP 회원 · 웰컴 과일', `${turn} 메모 "${d1 && d1.vip && d1.vip.note}" · 지정된 날 ${[D].concat(nextDays).join(', ')}`);
  await closeD(); await room(empty); await tap('#dlg [data-svc="vipset"]'); await closeD();
  rec('빈 방 입실 VIP 지정', !!((await doc(empty)) || {}).vip, `${empty}(${day[empty].stay})`);
  // 2) 퇴실 완료 → 청소 → 점검 완료 (프론트·키핑)
  await room(turn); await tap('#dlg [data-svc="co"]'); await closeD();
  await open('hk', '11:00'); await room(turn);
  for (const a of ['start', 'cleaned', 'done']) { const bt = p.locator(`#dlg [data-svc="${a}"]`); if (await bt.count()) { await tap(`#dlg [data-svc="${a}"]`); if (!(await p.locator('#dlg[open]').count())) await room(turn); } }
  await closeD();
  const toast = await p.locator('#undoBar').innerText().catch(() => '');
  rec('점검 완료 알림 문구(VIP)', /VIP 인스펙 후 입실 가능/.test(toast) && !/입실 가능으로 바꿨습니다/.test(toast), toast.replace(/\s+/g, ' ').slice(0, 80));
  const tile = (await p.locator(`.rt[data-room="${turn}"]`).innerText()).replace(/\s+/g, ' ');
  rec('점검 끝나도 VIP는 입실 가능 아님', /VIP/.test(tile) && /VIP 인스펙/.test(tile) && !/입실 가능/.test(tile), `현황판 칸 "${tile.slice(0, 50)}"`);
  const hbar = (await p.locator('#openbar').innerText()).replace(/\s+/g, ' ');
  rec('키핑 미마감에 VIP 인스펙 대기', /VIP 인스펙 대기 2/.test(hbar), hbar.slice(0, 90));
  await p.click('#menuBtn'); await p.waitForTimeout(350); await p.locator('[data-tab="svc"]').filter({ visible: true }).first().click(); await p.waitForTimeout(500);
  const sec = (await p.locator('.vipsec').innerText()).replace(/\s+/g, ' ');
  rec('VIP 인스펙 칸', /VIP 인스펙 남음 2 \/ 2/.test(sec) && (sec.match(/VIP 인스펙 완료/g) || []).length >= 2, sec.slice(0, 160));
  await p.screenshot({ path: S + '/shots/vip-hk.png' });
  // 3) 프론트 쪽 보이는 것
  await open('fo', '11:10');
  const fbar = (await p.locator('#openbar').innerText()).replace(/\s+/g, ' ');
  const readyLab = (await p.locator('.cats [data-bf="c-ready"]').innerText()).replace(/\s+/g, ' ');
  const inReady = await p.evaluate(id => { const b = document.querySelector('.cats [data-bf="c-ready"]'); if (b.disabled) return false; b.click(); return [...document.querySelectorAll('.rt[data-room]')].some(e => e.dataset.room === id); }, turn);
  rec('프론트: VIP 준비 안 됨 · 입실 가능에서 빠짐', /VIP 준비 안 됨 2/.test(fbar) && /입실 가능 0/.test(readyLab) && !inReady, `알림 "${fbar.slice(0, 60)}" · 칩 "${readyLab}" · ${turn} 입실 가능 ${inReady ? '포함(오류)' : '아님'}`);
  // 4) 부서장 VIP 인스펙
  await open('hk', '11:20'); await room(turn); await tap('#dlg [data-svc="vipok"]'); await closeD();
  const d2 = await doc(turn); const tile2 = (await p.locator(`.rt[data-room="${turn}"]`).innerText()).replace(/\s+/g, ' ');
  rec('VIP 인스펙 완료 → 입실 가능', d2.vipOk && /입실 가능/.test(tile2), `칸 "${tile2.slice(0, 50)}" · 기록 ${d2.log[0].act}`);
  await open('fo', '11:25');
  const fbar2 = (await p.locator('#openbar').innerText().catch(() => '')).replace(/\s+/g, ' ');
  await p.click('#menuBtn'); await p.waitForTimeout(350); await p.locator('[data-tab="svc"]').filter({ visible: true }).first().click(); await p.waitForTimeout(500);
  const foRow = (await p.locator('#sv-out .srow', { hasText: '본관 ' + turn.split('-')[1] }).first().innerText()).replace(/\s+/g, ' ');
  rec('프론트에 입실 가능 알림', /입실 가능 확인/.test(foRow) && /VIP 준비 안 됨 1/.test(fbar2), `줄 "${foRow.slice(0, 70)}" · 알림 "${fbar2.slice(0, 50)}"`);
  // 5) 내일 미리 지정 가능, 내일 인스펙은 막힘
  await p.locator('[data-rdate="2026-12-03"]').first().click(); await p.waitForTimeout(300);
  const tmr = Object.keys(seed.roomDays['2026-12-03'].rooms).find(k => seed.roomDays['2026-12-03'].rooms[k].stay === '퇴실·입실' && k.startsWith('main'));
  await p.click('#menuBtn'); await p.waitForTimeout(350); await p.locator('[data-tab="board"]').filter({ visible: true }).first().click(); await p.waitForTimeout(400);
  await room(tmr); await tap('#dlg [data-svc="vipset"]');
  const t1 = await doc(tmr, '2026-12-03'); const vb = p.locator('#dlg [data-svc="vipok"]'); let blocked = true;
  if (await vb.count()) { await tap('#dlg [data-svc="vipok"]'); blocked = !((await doc(tmr, '2026-12-03')) || {}).vipOk; }
  rec('내일 VIP 미리 지정 / 내일 인스펙은 막힘', !!(t1 && t1.vip) && blocked, `${tmr} 12/3 지정 ${!!(t1 && t1.vip)} · 인스펙 ${blocked ? '막힘' : '됨(오류)'}`);
  await closeD();
  // 6) 해제
  await p.locator('[data-rdate="2026-12-02"]').first().click(); await p.waitForTimeout(300);
  await room(empty); await tap('#dlg [data-svc="vipclr"]'); const d3 = await doc(empty);
  rec('VIP 해제', d3 && d3.vip === null, `${empty} vip=${JSON.stringify(d3 && d3.vip)} (확인창 ${dlg.some(m => /VIP 지정을 해제/.test(m)) ? '뜸' : '없음'})`);
  console.log('page errors', errs.slice(0, 3), `pass ${R.filter(r => r.ok).length}/${R.length}`);
  await b.close();
})();
