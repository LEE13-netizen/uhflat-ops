// 부서별 첫 화면 · 현황판 조작 줄 · 안내 문구 숨기기
const { open, chromium } = require('./ui-common.js');
const R = []; const rec = (id, ok, note) => { R.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} — ${note}`); };
const hintLen = p => p.evaluate(() => [...document.querySelectorAll('.hint')].filter(e => e.offsetParent).reduce((n, e) => n + e.textContent.trim().length, 0));
(async () => {
  const b = await chromium.launch();
  for (const [role, tab] of [['hk', 'svc'], ['fm', 'work'], ['fo', 'board']]) {
    const { ctx, page } = await open(b, { role, time: '2026-12-02T10:00:00+09:00' });
    const on = await page.evaluate(() => { const t = document.querySelector('[data-tab][aria-current="page"], [data-tab].on, [data-tab][aria-selected="true"]'); return t ? t.dataset.tab : (document.querySelector('#sv-out, #sv-stay') ? 'svc' : document.querySelector('.bsec') ? 'board' : '?'); });
    const svc = await page.locator('#sv-out, #sv-stay, .minebar').count(), brd = await page.locator('.bsec, .cats').count(), work = await page.locator('#fTitle, .card h2:has-text("업무 등록"), .card h2:has-text("할 일")').count();
    const real = tab === 'svc' ? svc > 0 : tab === 'board' ? brd > 0 : work > 0 && brd === 0;
    rec(`첫 화면 ${role.toUpperCase()} → ${tab}`, real, `표시 탭 ${on} · 청소 ${svc} · 현황판 ${brd} · 작업대 ${work}`);
    if (role === 'fo') {
      const live = await page.locator('section.card > p.live').count(), inFold = await page.locator('details.lgd .lgst').count();
      const chip = await page.locator('#bNeedBtn').count();
      await page.click('#bNeedBtn'); await page.waitForTimeout(300);
      const pressed = await page.getAttribute('#bNeedBtn', 'aria-pressed');
      rec('현황판: 평상 상태 줄은 접힘(이 기기 전용 경고는 밖)', inFold === 1, `밖 상태 줄 ${live}(로컬 모드라 경고 1 정상) · 접힌 상태 ${inFold}`);
      rec('현황판: "업무 있는 객실만" 칩', chip === 1 && pressed === 'true', `칩 ${chip} · 눌림 ${pressed}`);
      await page.click('#menuBtn'); await page.waitForTimeout(300); await page.locator('[data-tab="svc"]').filter({ visible: true }).first().click(); await page.waitForTimeout(500);
      const h0 = await hintLen(page);
      await page.click('#menuBtn'); await page.waitForTimeout(300); await page.check('#hideHint'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      const h1 = await hintLen(page);
      await page.reload(); await page.waitForTimeout(800);
      const kept = await page.evaluate(() => document.body.classList.contains('nohint'));
      rec('안내 문구 숨기기(이 기기 저장)', h0 > 100 && h1 === 0 && kept, `안내 글자 ${h0} → ${h1} · 새로고침 후 유지 ${kept}`);
    }
    await ctx.close();
  }
  { // 첫 로그인 안내(이 기기·부서마다 한 번) + 용어집
    const fs = require('fs'), seed = JSON.parse(fs.readFileSync(process.env.S + '/data/seed.json', 'utf8'));
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    await ctx.addInitScript(s => { if (!localStorage.getItem('opsFrame:v1:property')) for (const c in s) localStorage.setItem('opsFrame:v1:' + c, JSON.stringify(s[c])); }, seed);
    const page = await ctx.newPage(); await page.clock.install({ time: new Date('2026-12-02T09:00:00+09:00') });
    const enter = async () => { await page.goto('http://127.0.0.1:8765/local.html#hk'); await page.waitForTimeout(600); const k = page.locator('#lock button:visible', { hasText: '키핑' }).first(); if (await k.count()) await k.click(); await page.waitForTimeout(900); };
    await enter();
    const shown = await page.locator('#dlg[open] .gsteps li').count(), title = await page.locator('#dlg[open] h3').innerText().catch(() => '');
    await page.locator('#dlg[open] .acts #dlgX').click(); await page.waitForTimeout(300);
    await page.evaluate(() => { localStorage.setItem('opsFrameUi:locked', '1'); }); await enter();
    const again = await page.locator('#dlg[open]').count();
    rec('첫 로그인 안내 3장(키핑) · 두 번째는 안 뜸', shown === 3 && /키핑/.test(title) && again === 0, `안내 ${shown}장 "${title}" · 다시 ${again}`);
    await page.click('#menuBtn'); await page.waitForTimeout(400); await page.click('#guideBtn'); await page.waitForTimeout(300); await page.click('[data-guide="terms"]'); await page.waitForTimeout(200);
    const terms = await page.locator('#dlg[open] .terms dt').count();
    rec('메뉴 "처음 쓰는 분 · 용어집"', terms >= 15, `용어 ${terms}개`);
    await page.screenshot({ path: process.env.S + '/shots/guide-terms.png' });
    await ctx.close();
  }
  await b.close(); console.log(`pass ${R.filter(Boolean).length}/${R.length}`);
})();
