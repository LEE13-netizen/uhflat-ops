// 24시 스테이 화면(테스트 데이터): 퇴실 시각까지는 "퇴실 시간 지남"에서 빠짐 · 칩·현황판 표시 · 프론트 레이트가 우선
const { chromium } = require('playwright'); const fs = require('fs'); const S = process.env.S;
const seed = JSON.parse(fs.readFileSync(S + '/data/seed.json', 'utf8'));
const D = '2026-12-02', R2 = seed.roomDays[D].rooms;
const outs = Object.keys(R2).filter(k => /^퇴실/.test(R2[k].stay) && k.startsWith('main')).sort();
const A = outs[0], B = outs[1];
R2[A] = Object.assign({}, R2[A], { h24: { co: '15:00', ci: '' }, flags: ['24시 스테이 — 퇴실 15:00'] });
R2[B] = Object.assign({}, R2[B], { h24: { co: '', ci: '' }, flags: ['24시 스테이 — 퇴실 시각 확인(하늘색 숫자로 추정, 메모 확인)'] });
const R = []; const rec = (id, ok, note) => { R.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} — ${note}`); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR' });
  await ctx.addInitScript(s => { try { ['FO','HK','FM','MG'].forEach(r => localStorage.setItem('opsFrameUi:guided:' + r, '1')); localStorage.setItem('opsFrameUi:dutyHide', 'x'); } catch (e) {} if (!localStorage.getItem('opsFrame:v1:property')) for (const c in s) localStorage.setItem('opsFrame:v1:' + c, JSON.stringify(s[c])); }, seed);
  const errs = []; let p;
  const open = async (role, time) => { if (p) await p.close(); p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.clock.install({ time: new Date(`${D}T${time}:00+09:00`) });
    await p.goto('http://127.0.0.1:8765/local.html#' + role); await p.waitForTimeout(600);
    const k = p.locator('#lock button:visible', { hasText: { hk: '키핑', fo: '프론트' }[role] }).first(); if (await k.count()) await k.click(); await p.waitForTimeout(600); };
  const go = async tab => { await p.click('#menuBtn'); await p.waitForTimeout(400); await p.locator(`[data-tab="${tab}"]`).filter({ visible: true }).first().click(); await p.waitForTimeout(600); };
  const noA = A.split('-')[1], noB = B.split('-')[1];
  // 1) 12:00 프론트: 퇴실 시간 지남에서 24시 2실 빠짐
  await open('fo', '12:00');
  const n12 = await p.evaluate(() => { const b = document.querySelector('#openbar [data-bfset="o-coover"] b'); return b ? +b.textContent : 0; });
  const tile = (await p.locator(`.rt[data-room="${A}"]`).innerText()).replace(/\s+/g, ' ');
  rec('현황판 칸에 24H 퇴실 시각', /24H 15:00/.test(tile), tile);
  await go('svc');
  const rowA = (await p.locator('#sv-out .srow', { hasText: '본관 ' + noA }).first().innerText()).replace(/\s+/g, ' ');
  rec('프론트 청소·재실 줄: "24시 스테이 퇴실 15:00"', /24시 스테이 퇴실 15:00/.test(rowA), rowA.slice(0, 90));
  // 2) 15:10: A는 퇴실 시간 지남에 들어감, B(시각 모름)는 계속 빠짐
  await open('fo', '15:10');
  const n15 = await p.evaluate(() => { const b = document.querySelector('#openbar [data-bfset="o-coover"] b'); return b ? +b.textContent : 0; });
  const all = outs.length + Object.keys(R2).filter(k => /^퇴실/.test(R2[k].stay) && !k.startsWith('main')).length;
  rec('퇴실 시간 지남: 12시엔 24시 2실 제외, 15:10엔 15시 퇴실 방 포함', n12 === all - 2 && n15 === all - 1, `12:00 ${n12} · 15:10 ${n15} · 전체 퇴실 ${all}`);
  // 3) 키핑: 할 청소 퇴실 전 줄에 24시 표시
  await open('hk', '10:00'); await go('svc');
  const hk = (await p.locator('details.secd[data-sec="hk-o-pre"]').innerText()).replace(/\s+/g, ' ');
  rec('키핑 퇴실 전 목록에 24시 스테이 퇴실 시각', new RegExp(noA + '[^]*?24시 스테이 퇴실 15:00').test(hk) || /24시 스테이 퇴실 15:00/.test(hk), hk.slice(0, 120));
  // 4) 프론트가 레이트 13:00 직접 넣으면 그 값이 우선
  await open('fo', '12:00'); await go('svc');
  const row = p.locator('#sv-out .srow', { hasText: '본관 ' + noA }).first();
  await row.locator('[data-svc="edit"]').click(); await p.waitForTimeout(300);
  await row.locator(`#lt-${A.replace(/([^\w-])/g, '\\$1')}`).fill('13:00').catch(() => {});
  await row.locator('[data-svc="late"]').click(); await p.waitForTimeout(500);
  const rowA2 = (await p.locator('#sv-out .srow', { hasText: '본관 ' + noA }).first().innerText()).replace(/\s+/g, ' ');
  rec('프론트 레이트 직접 입력이 우선', /레이트 13:00/.test(rowA2) && !/24시 스테이 퇴실 15:00/.test(rowA2), rowA2.slice(0, 90));
  if (errs.length) { console.log('errors', errs); R.push(false); }
  await b.close(); console.log(`pass ${R.filter(Boolean).length}/${R.length}`);
})();
