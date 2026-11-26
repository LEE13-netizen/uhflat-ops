const { chromium, devices } = require('playwright');
const fs = require('fs');
const S = process.env.S, URL = 'http://127.0.0.1:8765/local.html';
const seed = JSON.parse(fs.readFileSync(S + '/data/seed.json', 'utf8'));
async function open(browser, { role = 'fo', mobile = false, time = '2026-12-02T08:00:00+09:00', keep } = {}) {
  const ctx = keep || await browser.newContext(mobile ? { ...devices['iPhone 13'], locale: 'ko-KR', timezoneId: 'Asia/Seoul' } : { viewport: { width: 1366, height: 900 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  if (!keep) await ctx.addInitScript(s => { try { if (!localStorage.getItem('opsFrame:v1:property')) for (const c in s) localStorage.setItem('opsFrame:v1:' + c, JSON.stringify(s[c])); } catch (e) {} }, seed);
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(time) });
  const log = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log.push(m.type() + ': ' + m.text().slice(0, 200)); });
  page.on('pageerror', e => log.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('dialog', d => { log.push('dialog: ' + d.message().slice(0, 120)); d.accept(); });
  await page.goto(URL + '#' + role);
  await page.waitForTimeout(600);
  const NAME = { fo: '프론트', hk: '키핑', fm: '시설', mg: '관리자' }[role];
  const pick = page.locator('#lock button:visible', { hasText: NAME }).first();
  if (await pick.count()) { await pick.click(); await page.waitForTimeout(500); }
  return { ctx, page, log };
}
async function visibleControls(page) {
  return page.evaluate(() => [...document.querySelectorAll('button, a, [role=tab], select, input')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight && getComputedStyle(e).visibility !== 'hidden'; }).map(e => (e.id ? '#' + e.id + ' ' : '') + (e.dataset.tab ? '[tab=' + e.dataset.tab + '] ' : '') + (e.textContent || e.placeholder || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 28)));
}
async function go(page, tab) {   // 사람처럼: 메뉴 → 항목 (두 번 누름)
  if (!(await page.locator('#side.open, .side.open, aside.open').count())) { const m = page.locator('#menuBtn'); if (await m.isVisible()) { await m.click(); await page.waitForTimeout(450); } }
  const t = page.locator('[data-tab="' + tab + '"]').filter({ visible: true }).first();
  if (!(await t.count())) return false;
  await t.click({ timeout: 4000 }).catch(async () => { await page.evaluate(x => document.querySelector('[data-tab="' + x + '"]').click(), tab); });
  await page.waitForTimeout(450); return true;
}
module.exports = { open, S, chromium, visibleControls, go };
