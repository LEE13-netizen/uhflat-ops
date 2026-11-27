// 교대·인수인계 + 근무 마감(1차): 남은 것 자동 수집 · 이유 없으면 마감 안 됨 · 다음 근무 작업대에 메모
const { chromium } = require('playwright'); const fs = require('fs'); const S = process.env.S;
const seed = JSON.parse(fs.readFileSync(S + '/data/seed.json', 'utf8'));
const D = '2026-12-02';
const R = []; const rec = (id, ok, note) => { R.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} — ${note}`); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR' });
  await ctx.addInitScript(s => { try { ['FO','HK','FM','MG'].forEach(r => localStorage.setItem('opsFrameUi:guided:' + r, '1')); } catch (e) {} if (!localStorage.getItem('opsFrame:v1:property')) for (const c in s) localStorage.setItem('opsFrame:v1:' + c, JSON.stringify(s[c])); }, seed);
  const errs = []; let p;
  const open = async (role, time) => { if (p) await p.close(); p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.clock.install({ time: new Date(`${D}T${time}:00+09:00`) });
    await p.goto('http://127.0.0.1:8765/local.html#' + role); await p.waitForTimeout(600);
    const k = p.locator('#lock button:visible', { hasText: { hk: '키핑', fo: '프론트', fm: '시설' }[role] }).first(); if (await k.count()) await k.click(); await p.waitForTimeout(500); };
  const go = async tab => { await p.click('#menuBtn'); await p.waitForTimeout(400); await p.locator(`[data-tab="${tab}"]`).filter({ visible: true }).first().click(); await p.waitForTimeout(500); };
  // 키핑 주간 17:50: 몇 방 퇴실 처리(프론트) 후 마감
  await open('fo', '11:00'); await go('svc');
  for (let i = 0; i < 3; i++) { const btn = p.locator('#sv-out [data-svc="co"]').first(); if (await btn.count()) { await btn.click(); await p.waitForTimeout(300); } }
  await open('hk', '17:50'); await go('shift');
  const items = (await p.locator('.hvi').allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
  rec('남은 것 자동 수집(키핑: 객실 상태 포함)', items.some(t => /입실 가능 아님/.test(t)), items.join(' | '));
  await p.fill('#hvMemo', '1207호 수건 추가 요청 23시. 카드번호 1234-5678-9012-3456');
  const before = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('opsFrame:v1:handovers') || '{}')).length);
  await p.evaluate(() => { const w = document.getElementById('hvWhy'); if (w) w.removeAttribute('required'); });
  await p.click('#hvForm button[type=submit]'); await p.waitForTimeout(400);
  const mid = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('opsFrame:v1:handovers') || '{}')).length);
  rec('남은 것이 있는데 이유 없으면 마감 안 됨', mid === before, `기록 ${before} → ${mid}`);
  await p.fill('#hvWhy', '손님 외출 중 2실, 야간에 이어서'); await p.click('#hvForm button[type=submit]'); await p.waitForTimeout(500);
  const saved = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('opsFrame:v1:handovers') || '{}')));
  const h = saved[saved.length - 1] || {};
  rec('이유 적으면 마감 기록(남김 건수·메모·카드번호 가림)', saved.length === before + 1 && h.leftTotal > 0 && /1207호/.test(h.memo || '') && !/9012/.test(h.memo || ''), JSON.stringify({ leftTotal: h.leftTotal, memo: h.memo, why: h.why }).slice(0, 200));
  // 야간 키핑 22:10: 작업대에 교대 전달
  await open('hk', '22:10'); await go('work');
  const card = (await p.locator('.carryc', { hasText: '교대 전달' }).innerText().catch(() => '')).replace(/\s+/g, ' ');
  rec('다음 근무 작업대에 교대 전달(메모·이유·객실 미완료)', /1207호/.test(card) && /손님 외출/.test(card) && /입실 가능 아님/.test(card), card.slice(0, 200));
  if (errs.length) { console.log('errors', errs); R.push(false); }
  await b.close(); console.log(`pass ${R.filter(Boolean).length}/${R.length}`);
})();
