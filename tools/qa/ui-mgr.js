// 관리자: 담당별 진행 카드 · 관리자 담당 바꾸기 · 15시 입실 위험 조기 경고 (테스트 데이터)
const { chromium } = require('playwright'); const fs = require('fs'); const S = process.env.S;
const seed = JSON.parse(fs.readFileSync(S + '/data/seed.json', 'utf8'));
const NAMES = ['김민지', '박서연', '이하늘', '최유나'];
const D = '2026-12-02', day = seed.roomDays[D], ids = Object.keys(day.rooms).filter(k => /퇴실|연박/.test(day.rooms[k].stay)).sort();
day.assign = {}; ids.forEach((id, i) => { day.assign[id] = NAMES[i % 4 === 3 && i % 3 === 0 ? 0 : i % 4]; });
// 김민지에게 몰아 주기(밀림 만들기): 처음 30실 전부
ids.slice(0, 30).forEach(id => { day.assign[id] = '김민지'; });
const R = []; const rec = (id, ok, note) => { R.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} — ${note}`); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR' });
  await ctx.addInitScript(s => { try { ['FO','HK','FM','MG'].forEach(r => localStorage.setItem('opsFrameUi:guided:' + r, '1')); } catch (e) {} if (!localStorage.getItem('opsFrame:v1:property')) for (const c in s) localStorage.setItem('opsFrame:v1:' + c, JSON.stringify(s[c])); }, seed);
  const errs = []; let p;
  const open = async (role, time) => { if (p) await p.close(); p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.clock.install({ time: new Date(`${D}T${time}:00+09:00`) });
    await p.goto('http://127.0.0.1:8765/local.html#' + role); await p.waitForTimeout(600);
    const k = p.locator('#lock button:visible', { hasText: { mg: '관리자', hk: '키핑', fo: '프론트' }[role] }).first(); if (await k.count()) await k.click(); await p.waitForTimeout(500); };
  const go = async tab => { await p.click('#menuBtn'); await p.waitForTimeout(400); await p.locator(`[data-tab="${tab}"]`).filter({ visible: true }).first().click(); await p.waitForTimeout(500); };
  // 1) 담당별 진행
  await open('mg', '10:30'); await go('svc');
  const card = await p.locator('.asgc').count(), people = await p.locator('.asgp').allInnerTexts();
  const late = people.filter(t => /밀림/.test(t)).map(t => t.split('\n')[0]);
  rec('관리자 청소·재실에 담당별 진행 카드', card === 1 && people.length >= 4, `${people.length}칸: ${people.map(t => t.replace(/\s+/g, ' ').slice(0, 34)).join(' | ')}`);
  rec('일이 몰린 사람 "밀림" 표시', late.includes('김민지') && late.length === 1, `밀림: ${late.join(',') || '없음'}`);
  await p.locator('.asgp', { hasText: '박서연' }).first().click(); await p.waitForTimeout(400);
  const shown = await p.evaluate(() => [...document.querySelectorAll('#sv-stay .srow .sn, #sv-out .srow .sn')].map(e => e.textContent.trim()));
  const okW = shown.length > 0 && shown.every(t => { const [bn, no] = t.split(' '); return (day.assign[(bn === '본관' ? 'main-' : 'annex-') + no] || '') === '박서연'; });
  rec('이름 누르면 그 사람 방만(본관·신관 모두)', okW, `${shown.length}줄`);
  // 2) 관리자 담당 바꾸기
  await p.click('[data-asgedit]'); await p.waitForTimeout(400);
  const sel = p.locator('#sv-out select[data-asg], #sv-stay select[data-asg]').first(); const sid = await sel.getAttribute('data-asg');
  await sel.selectOption('이하늘'); await p.waitForTimeout(600);
  const saved = await p.evaluate(k => { const d = JSON.parse(localStorage.getItem('opsFrame:v1:roomSvc') || '{}'); const v = d[k] || (d.docs || {})[k]; return v && v.asg ? v.asg.name : null; }, D + '__' + sid);
  rec('관리자 화면에서 담당 바꾸기 저장', saved === '이하늘', `${sid} → ${saved}`);
  // 3) 15시 위험 조기 경고
  await open('fo', '11:30'); const bar1 = (await p.locator('#openbar').innerText().catch(() => '')).replace(/\s+/g, ' ');
  await open('fo', '12:30'); const bar2 = (await p.locator('#openbar').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const hot2 = await p.locator('#openbar .ob.hot', { hasText: '입실' }).count();
  rec('11:30에는 입실 준비 알림 없음', !/입실 준비 안 됨/.test(bar1), bar1.slice(0, 120));
  rec('12:30부터 당일 입실 준비 알림 + 15시 부족 예상(빨강)', /입실 준비 안 됨/.test(bar2) && /15시 \d+실 부족 예상/.test(bar2) && hot2 === 1, bar2.slice(0, 160));
  if (errs.length) { console.log('errors', errs); R.push(false); }
  await b.close(); console.log(`pass ${R.filter(Boolean).length}/${R.length}`);
})();
