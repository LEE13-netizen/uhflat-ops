const { chromium } = require('playwright'); const fs = require('fs'); const S = process.env.S;
const seed = JSON.parse(fs.readFileSync(S + '/data/seed.json', 'utf8'));
// 청소표 업로드처럼 12/2 담당 넣기(테스트 데이터): 층 묶음으로 8명
const NAMES = ['김민지', '박서연', '이하늘', '최유나', '정다은', '한지우', '오세영', '윤가람'];
const day = seed.roomDays['2026-12-02'], ids = Object.keys(day.rooms).filter(k => /퇴실|연박/.test(day.rooms[k].stay)).sort();
day.assign = {}; ids.forEach((id, i) => { day.assign[id] = NAMES[Math.floor(i / Math.ceil(ids.length / NAMES.length))]; });
day.assign['main-208'] = '박서연 / 최유나';
const R = []; const rec = (id, ok, note) => { R.push({ id, ok, note }); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} — ${note}`); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR' });
  await ctx.addInitScript(s => { if (!localStorage.getItem('opsFrame:v1:property')) for (const c in s) localStorage.setItem('opsFrame:v1:' + c, JSON.stringify(s[c])); }, seed);
  const errs = []; let p;
  const open = async (role) => { if (p) await p.close(); p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept('새담당')); await p.clock.install({ time: new Date('2026-12-02T09:00:00+09:00') });
    await p.goto('http://127.0.0.1:8765/local.html#' + role); await p.waitForTimeout(500); const nm = { hk: '키핑', fo: '프론트' }[role]; const k = p.locator('#lock button:visible', { hasText: nm }).first(); if (await k.count()) await k.click(); await p.waitForTimeout(400); };
  const go = async tab => { await p.click('#menuBtn'); await p.waitForTimeout(400); await p.locator(`[data-tab="${tab}"]`).filter({ visible: true }).first().click(); await p.waitForTimeout(500); };
  const want = n => ids.filter(id => (day.assign[id] || '').includes(n)).length;
  await open('hk'); await go('svc');
  const hasSel = await p.locator('#hkMeSel').count();
  await p.selectOption('#hkMeSel', '김민지'); await p.waitForTimeout(500);
  const bar = await p.locator('.minebar').innerText();
  const rows = await p.locator('#view .srow').count();
  const mine = want('김민지');
  rec('이름 고르기 → 내 방', hasSel && new RegExp('김민지님 담당 ' + mine + '실').test(bar.replace(/\s+/g, ' ')), `처음 화면에 이름 고르기 ${hasSel ? '있음' : '없음'} · "${bar.replace(/\s+/g, ' ').slice(0, 40)}" · 정답 ${mine}실 · 화면 줄 ${rows}`);
  await p.screenshot({ path: S + '/shots/asg-hk-mine.png' });
  // 줄마다 실제 담당 확인
  const shown = await p.evaluate(() => [...document.querySelectorAll('#view .srow .sn')].map(e => e.textContent.trim()));
  const ok2 = shown.every(t => { const [bn, no] = t.split(' '); const id = (bn === '본관' ? 'main-' : 'annex-') + no; return (day.assign[id] || '').includes('김민지'); });
  rec('내 방에는 내 담당만', ok2 && shown.length > 0, `${shown.length}줄, 남의 방 ${shown.length - shown.filter(t => { const [bn, no] = t.split(' '); return (day.assign[(bn === '본관' ? 'main-' : 'annex-') + no] || '').includes('김민지'); }).length}줄`);
  await p.click('[data-hkmine="0"]'); await p.waitForTimeout(400);
  const allN = await p.locator('#view .srow').count();
  rec('전체 보기', allN > rows, `전체 ${allN}줄 (내 방 ${rows}줄)`);
  await p.click('[data-hkmine="1"]'); await p.waitForTimeout(300);
  await go('board'); const outlined = await p.locator('.rt.mine').count();
  rec('현황판에 내 방 테두리', outlined === mine, `테두리 ${outlined}칸 / 정답 ${mine}`);
  await go('svc');
  // 두 사람 칸: 박서연으로 바꿔 208 보이는지
  await p.click('[data-hkme]'); await p.waitForTimeout(300); await p.selectOption('#hkMeSel', '최유나'); await p.waitForTimeout(400);
  const has208 = await p.locator('#view .srow', { hasText: '본관 208' }).count();
  rec('두 명 담당 칸(박서연 / 최유나)', has208 > 0, `최유나 내 방에 208 ${has208 ? '보임' : '안 보임'}`);
  // 부서장: 담당 바꾸기 (로컬 모드는 로그인 없음 → 바꾸기 허용)
  await p.click('[data-hkmine="0"]'); await p.waitForTimeout(300);
  await p.click('[data-asgedit]'); await p.waitForTimeout(400);
  const sel = p.locator('select[data-asg="main-206"]');
  await sel.selectOption('이하늘'); await p.waitForTimeout(500);
  let doc = await p.evaluate(() => JSON.parse(localStorage.getItem('opsFrame:v1:roomSvc') || '{}')['2026-12-02__main-206']);
  rec('부서장이 담당 바꾸기', doc && doc.asg && doc.asg.name === '이하늘', `206 → ${doc && doc.asg && doc.asg.name} (기록: ${doc && doc.log && doc.log[0].act})`);
  await p.locator('select[data-asg="main-206"]').selectOption('__sheet'); await p.waitForTimeout(500);
  doc = await p.evaluate(() => JSON.parse(localStorage.getItem('opsFrame:v1:roomSvc') || '{}')['2026-12-02__main-206']);
  const v = await p.locator('select[data-asg="main-206"]').inputValue();
  rec('청소표대로 되돌리기', doc && doc.asg === null && v === '__sheet', `asg ${JSON.stringify(doc && doc.asg)} · 선택 "${v}"`);
  await p.screenshot({ path: S + '/shots/asg-hk-edit.png' });
  // 프론트: 담당 칩
  await open('fo'); await go('svc');
  const chips = await p.locator('#view .chip.asg').count();
  rec('프론트 목록에 담당 이름', chips > 0, `담당 칩 ${chips}개`);
  await p.locator('[data-room]').first().count();
  console.log('page errors', errs.slice(0, 3));
  await b.close();
})();
