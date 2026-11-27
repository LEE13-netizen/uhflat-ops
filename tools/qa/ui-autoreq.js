const { chromium } = require('playwright'); const fs = require('fs'); const S = process.env.S;
const base = JSON.parse(fs.readFileSync(S + '/data/seed.json', 'utf8'));
const D = '2026-12-02', stays = Object.keys(base.roomDays[D].rooms).filter(k => base.roomDays[D].rooms[k].stay === '연박' && k.startsWith('main')).sort();
const R = []; const rec = (id, ok, note) => { R.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} — ${note}`); };
async function run(policy) {
  const seed = JSON.parse(JSON.stringify(base));
  seed.roomDays[D].requests = { [stays[0]]: { from: '11:00', to: '13:00' }, [stays[1]]: { from: '14:00', to: '16:00' } };
  seed.settings = { main: { stayPolicy: policy, stayWin: '10:00~16:00' } };
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'Asia/Seoul' });
  await ctx.addInitScript(s => { localStorage.clear(); try { ['FO','HK','FM','MG'].forEach(r => localStorage.setItem('opsFrameUi:guided:' + r, '1')); } catch (e) {} for (const c in s) localStorage.setItem('opsFrame:v1:' + c, JSON.stringify(s[c])); }, seed);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.clock.install({ time: new Date(`${D}T12:00:00+09:00`) });
  const open = async role => { await p.goto('http://127.0.0.1:8765/local.html#' + role); await p.waitForTimeout(500); const k = p.locator('#lock button:visible', { hasText: role === 'fo' ? '프론트' : '키핑' }).first(); if (await k.count()) await k.click(); await p.waitForTimeout(400); await p.click('#menuBtn'); await p.waitForTimeout(350); await p.locator('[data-tab="svc"]').filter({ visible: true }).first().click(); await p.waitForTimeout(500); };
  await open('fo');
  const r0 = (await p.locator('.srow', { hasText: '본관 ' + stays[0].split('-')[1] }).first().innerText()).replace(/\s+/g, ' ');
  const nAuto = await p.locator('#sv-stay .chip.auto').count(), nNo = await p.locator('details.secd[data-sec="fo-s-no"] .srow').count();
  if (policy === 'request') rec('청소표 메모 시간 → 재실 요청', /11:00~13:00/.test(r0) && /청소표 요청/.test(r0) && nAuto === 2, `"${r0.slice(0, 60)}" · 자동 ${nAuto} · 요청 없음 ${nNo}`);
  else rec('기본 정비: 요청 없는 재실 전부 기본 시간대', nAuto === stays.length && nNo === 0, `자동 ${nAuto}/${stays.length} · 요청 없음 ${nNo}`);
  if (policy === 'default') {   // 청소 X → 빠짐
    const row = p.locator('.srow', { hasText: '본관 ' + stays[3].split('-')[1] }).first();
    await row.locator('[data-svc="edit"]').click(); await p.waitForTimeout(300); await row.locator('[data-svc="refuse"]').click(); await p.waitForTimeout(400);
    await open('hk');
    const hkTodo = await p.locator('details.secd[data-sec="hk-s-todo"] .srow').allInnerTexts();
    rec('청소 X 하면 키핑 할 일에서 빠짐', !hkTodo.some(t => t.includes(' ' + stays[3].split('-')[1])) && hkTodo.length >= stays.length - 1, `키핑 할 재실 ${hkTodo.length} (전체 재실 본관 ${stays.length})`);
  } else {
    await open('hk');
    const hkTodo = (await p.locator('details.secd[data-sec="hk-s-todo"] .srow').allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
    const req2 = hkTodo.filter(t => !/일째 점검/.test(t));
    rec('키핑 할 재실 청소에 청소표 요청 2실(7일 점검 제외)', req2.length === 2 && [0, 1].every(i => req2.some(t => t.includes(' ' + stays[i].split('-')[1]))), `할 재실 ${hkTodo.length} · 요청 ${req2.length} · ${hkTodo.map(t => t.slice(0, 40)).join(' | ')}`);
  }
  if (policy === 'request') {   // 호수 검색 + 여러 실 한꺼번에
    await open('fo');
    const no = stays[5].split('-')[1];
    await p.fill('#svq', no.slice(0, 3)); await p.waitForTimeout(400);
    const focus = await p.evaluate(() => document.activeElement && document.activeElement.id);
    const shown = (await p.locator('#sv-stay .srow .sn').allInnerTexts());
    rec('호수 검색(앞자리) 결과만 보임 · 입력칸 포커스 유지', shown.length > 0 && shown.every(t => t.replace(/\D/g, '').startsWith(no.slice(0, 3))) && focus === 'svq', `"${no.slice(0, 3)}" → ${shown.length}실 · 포커스 ${focus}`);
    await p.fill('#svq', ''); await p.waitForTimeout(300);
    await p.click('[data-bulk="on"]'); await p.waitForTimeout(300);
    const pickIds = stays.slice(4, 9);
    for (const id of pickIds) { await p.locator(`[data-bulkid="${id}"]`).check(); await p.waitForTimeout(120); }
    await p.fill('#bkF', '13:00'); await p.fill('#bkT', '15:00'); await p.locator('#bkT').dispatchEvent('change');
    const lab = await p.locator('[data-bulk="req"]').innerText();
    await p.click('[data-bulk="req"]'); await p.waitForTimeout(800);
    const got = await p.evaluate(ids => ids.map(id => { const d = JSON.parse(localStorage.getItem('opsFrame:v1:roomSvc') || '{}'); const v = d['2026-12-02__' + id] || (d.docs || {})['2026-12-02__' + id]; return v && v.reply ? v.reply.window : null; }), pickIds);
    const rows = await Promise.all(pickIds.map(async id => (await p.locator('.srow', { hasText: '본관 ' + id.split('-')[1] }).first().innerText()).replace(/\s+/g, ' ')));
    rec('여러 실 한꺼번에 요청 저장(5실, 13:00~15:00)', /5실/.test(lab) && rows.every(t => /13:00~15:00/.test(t) && !/청소표 요청|기본 정비/.test(t)), `${lab} → ${rows.filter(t => /13:00~15:00/.test(t)).length}/5 반영 · 저장소 ${JSON.stringify(got)}`);
    await p.click('[data-bulk="allno"]'); await p.waitForTimeout(300);
    const nSel = await p.locator('[data-bulkid]:checked').count(), nNoReq = stays.length - 2 - 5;
    rec('직접 입력 안 한 방 전부 고르기', nSel >= nNoReq, `골라진 ${nSel} (직접 입력 안 한 본관 재실 약 ${nNoReq} + 별관)`);
    await p.click('[data-bulk="none"]'); await p.locator(`[data-bulkid="${stays[10]}"]`).check(); await p.waitForTimeout(150);
    await p.click('[data-bulk="refuse"]'); await p.waitForTimeout(600);
    const r10 = (await p.locator('.srow', { hasText: '본관 ' + stays[10].split('-')[1] }).first().innerText()).replace(/\s+/g, ' ');
    rec('한꺼번에 청소 X', /청소 X|청소 없음/.test(r10), r10.slice(0, 70));
  }
  if (errs.length) console.log('errors', errs);
  await b.close();
}
(async () => { await run('request'); await run('default'); console.log(`pass ${R.filter(Boolean).length}/${R.length}`); })();
