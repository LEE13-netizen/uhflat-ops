// 화면 밀도·가독성 측정: 부서별 첫 화면(PC·휴대폰), 주요 탭
const { chromium } = require('playwright'); const fs = require('fs'); const S = process.env.S;
const seed = JSON.parse(fs.readFileSync(S + '/data/seed.json', 'utf8'));
// 평범한 오전 10시 상태: 퇴실 일부 처리, 청소 일부 진행
const D = '2026-12-02', day = seed.roomDays[D].rooms, at = t => Date.parse(`${D}T${t}:00+09:00`), by = (t, role) => ({ at: at(t), by: 'T', uid: 'u', role });
const turn = Object.keys(day).filter(k => day[k].stay === '퇴실·입실').sort();
seed.roomSvc = {}; turn.slice(0, 20).forEach((id, i) => { seed.roomSvc[`${D}__${id}`] = Object.assign({ date: D, roomId: id, co: by('09:30', 'FO'), hkAck: by('09:35', 'HK') }, i < 6 ? { start: by('09:50', 'HK') } : {}, i < 3 ? { cleaned: by('10:10', 'HK'), done: by('10:20', 'HK') } : {}); });
(async () => {
  const b = await chromium.launch(); const out = [];
  for (const mobile of [false, true]) for (const role of ['fo', 'hk', 'fm', 'mg']) for (const tab of ['board', 'work', 'svc']) {
    const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1366, height: 900 } });
    await ctx.addInitScript(s => { localStorage.clear(); try { ['FO','HK','FM','MG'].forEach(r => localStorage.setItem('opsFrameUi:guided:' + r, '1')); } catch (e) {} for (const c in s) localStorage.setItem('opsFrame:v1:' + c, JSON.stringify(s[c])); }, seed);
    const p = await ctx.newPage(); await p.clock.install({ time: new Date(`${D}T10:00:00+09:00`) });
    await p.goto('http://127.0.0.1:8765/local.html#' + role); await p.waitForTimeout(500);
    const nm = { fo: '프론트', hk: '키핑', fm: '시설', mg: '관리자' }[role]; const k = p.locator('#lock button:visible', { hasText: nm }).first(); if (await k.count()) await k.click(); await p.waitForTimeout(500);
    await p.evaluate(() => { const c = document.getElementById('conn'); if (c) c.remove(); });   // 로컬 시험 안내 제외(운영엔 없음)
    if (tab !== 'board') { await p.click('#menuBtn'); await p.waitForTimeout(400); await p.locator(`[data-tab="${tab}"]`).filter({ visible: true }).first().click(); await p.waitForTimeout(500); await p.evaluate(() => { const c = document.getElementById('conn'); if (c) c.remove(); }); }
    const m = await p.evaluate(() => {
      const H = innerHeight, vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H && getComputedStyle(e).visibility !== 'hidden'; };
      const ctrls = [...document.querySelectorAll('button, a, input, select, summary, [role=tab]')].filter(vis);
      const small = ctrls.filter(e => { const r = e.getBoundingClientRect(); return r.height < 36 || r.width < 36; });
      let txt = 0; const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = walk.nextNode())) { const el = n.parentElement; if (!el || !vis(el)) continue; const r = el.getBoundingClientRect(); if (r.top < H && r.bottom > 0) txt += n.textContent.trim().length; }
      const hints = [...document.querySelectorAll('#view p.sub, #view small, #view .note')].filter(vis);
      const hintChars = hints.reduce((a, e) => a + e.textContent.trim().length, 0);
      const loud = [...document.querySelectorAll('.blinkrow, .tf.hot, .tf.need, .needbtn, .ob.hot, .rt.need, .rt.hot, .chip.warn, .cat.t-hot')].filter(vis).length;
      const docLen = document.getElementById('view').innerText.length, pageH = document.documentElement.scrollHeight;
      return { ctrls: ctrls.length, small: small.length, smallEx: small.slice(0, 4).map(e => (e.textContent || e.placeholder || e.id || '').trim().slice(0, 12)), foldText: txt, hintChars, loud, docLen, screens: +(pageH / H).toFixed(1) };
    });
    out.push(Object.assign({ role, tab, dev: mobile ? '폰' : 'PC' }, m));
    if (tab === 'board' || mobile) await p.screenshot({ path: `${S}/shots/persona-${role}-${tab}-${mobile ? 'm' : 'pc'}.png` });
    await ctx.close();
  }
  console.log('역할 탭   기기 | 첫화면 버튼 · 작은버튼 · 첫화면 글자 · 안내문 글자 · 강조(빨강/깜빡) · 화면 길이(배)');
  out.forEach(o => console.log(`${o.role} ${o.tab.padEnd(5)} ${o.dev} | ${String(o.ctrls).padStart(3)} · ${String(o.small).padStart(3)} ${JSON.stringify(o.smallEx)} · ${String(o.foldText).padStart(5)} · ${String(o.hintChars).padStart(5)} · ${String(o.loud).padStart(3)} · ${o.screens}`));
  fs.writeFileSync(S + '/data/persona.json', JSON.stringify(out));
  await b.close();
})();
