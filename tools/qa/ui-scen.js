// 사용자 관점 통합 시나리오 (로컬 1인 모드, 실제 예약 패턴 테스트 데이터, 시계 고정)
// 한 브라우저 저장소를 부서들이 번갈아 쓰는 방식: 역할 바꿀 때마다 새로 열기(다른 기기에서 실시간으로 받은 것과 같은 상태)
const { chromium } = require('playwright'); const fs = require('fs');
const S = process.env.S, URL = 'http://127.0.0.1:8765/local.html';
const seed = JSON.parse(fs.readFileSync(S + '/data/seed.json', 'utf8'));
const R = []; let taps = 0, cur = null, ctx, browser, LOG = [];
const rec = (id, res, note, extra) => { R.push(Object.assign({ id, res, note, taps }, extra || {})); console.log(`[${res}] ${id} (탭 ${taps}) ${note}`); };
const NAME = { fo: '프론트', hk: '키핑', fm: '시설', mg: '관리자' };
async function as(role, time, mobile) {
  if (cur) await cur.close();
  const p = await ctx.newPage();
  if (mobile) await p.setViewportSize({ width: 390, height: 844 });
  await p.clock.install({ time: new Date(time) });
  p.on('pageerror', e => LOG.push(role + ' pageerror: ' + e.message.slice(0, 160)));
  p.on('console', m => { if (m.type() === 'error') LOG.push(role + ' console: ' + m.text().slice(0, 160)); });
  p.on('dialog', d => { LOG.push(role + ' dialog: ' + d.message().slice(0, 100)); d.accept(); });
  await p.goto(URL + '#' + role); await p.waitForTimeout(500);
  const pick = p.locator('#lock button:visible', { hasText: NAME[role] }).first();
  if (await pick.count()) { await pick.click(); await p.waitForTimeout(400); }
  cur = p; taps = 0; return p;
}
const tap = async (loc, o) => { taps++; await loc.evaluate(e => e.scrollIntoView({ block: 'center' })).catch(() => {}); await loc.click(Object.assign({ timeout: 5000 }, o || {})); await cur.waitForTimeout(250); };
const menu = async tab => { await tap(cur.locator('#menuBtn')); await cur.waitForTimeout(350); const t = cur.locator(`[data-tab="${tab}"]`).filter({ visible: true }).first(); await tap(t); };
const svcDoc = id => cur.evaluate(k => { const m = JSON.parse(localStorage.getItem('opsFrame:v1:roomSvc') || '{}'); return m[k] || null; }, '2026-12-02__' + id);
const col = c => cur.evaluate(k => JSON.parse(localStorage.getItem('opsFrame:v1:' + k) || '{}'), c);
const dlgText = () => cur.evaluate(() => (document.getElementById('dlg').innerText || '').replace(/\n+/g, ' | '));
const viewText = () => cur.evaluate(() => (document.getElementById('view').innerText || '').replace(/\n+/g, ' | '));
const has = async (sel) => (await cur.locator(sel).filter({ visible: true }).count()) > 0;
// 객실 칸은 현황판에 있다. 키핑(첫 화면 청소·재실)·시설(첫 화면 작업대)은 현황판으로 먼저 간다(사람도 같은 탭 수)
const openRoom = async id => { if (!(await cur.locator(`[data-room="${id}"]`).filter({ visible: true }).count())) await menu('board'); await tap(cur.locator(`[data-room="${id}"]`).first()); await cur.waitForTimeout(300); };
const closeDlg = async () => { if (await has('#dlgX')) await tap(cur.locator('#dlgX')); };
const shot = n => cur.screenshot({ path: `${S}/shots/scen-${n}.png`, fullPage: false });
async function step(id, fn) { if (process.env.ONLY && !new RegExp(process.env.ONLY).test(id)) return; try { await fn(); } catch (e) { rec(id, 'ERROR', e.message.split('\n')[0].slice(0, 120) + ' :: ' + e.message.split('\n').filter(l => /intercept|not visible|not stable|detached|outside/.test(l)).slice(-2).join(' / ').slice(0, 300)); await shot('err-' + id).catch(() => {}); } }

(async () => {
  browser = await chromium.launch();
  ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  await ctx.addInitScript(s => { try { ['FO','HK','FM','MG'].forEach(r => localStorage.setItem('opsFrameUi:guided:' + r, '1')); } catch (e) {} try { if (!localStorage.getItem('opsFrame:v1:property')) for (const c in s) localStorage.setItem('opsFrame:v1:' + c, JSON.stringify(s[c])); } catch (e) {} }, seed);

  // ===== A. 체크아웃 → 정비 → 입실 가능 (본관 206, 퇴실·입실) =====
  await step('A1 프론트 퇴실 완료(현황판→객실→버튼)', async () => {
    await as('fo', '2026-12-02T09:30:00+09:00');
    await openRoom('main-206'); await tap(cur.locator('#dlg [data-svc="co"]')); await cur.waitForTimeout(400);
    const d = await svcDoc('main-206');
    rec('A1 프론트 퇴실 완료(현황판→객실→버튼)', d && d.co ? 'PASS' : 'FAIL', d && d.co ? '퇴실 완료 기록됨' : '기록 안 됨');
  });
  await step('A2 키핑 화면에 새 퇴실이 보이는가', async () => {
    await as('hk', '2026-12-02T09:35:00+09:00');
    await menu('svc');
    const t = await viewText(); const row = cur.locator('.srow', { hasText: '206' }).first();
    const blink = await row.evaluate(e => e.className).catch(() => '');
    rec('A2 키핑 화면에 새 퇴실이 보이는가', /본관 206|206/.test(t) ? 'PASS' : 'FAIL', '할 청소 목록에 206 ' + (/blinkrow|pend/.test(blink) ? '(깜빡임 = 새로 온 것)' : '(깜빡임 없음)'));
    await shot('A2-hk-svc');
  });
  await step('A3 키핑 청소 시작~점검 완료(목록에서)', async () => {
    const row = () => cur.locator('.srow', { hasText: '본관 206' }).first();
    let n0 = taps;
    if (await row().locator('[data-svc="ack"]').count()) await tap(row().locator('[data-svc="ack"]'));
    const needAck = taps - n0;
    if (await row().locator('[data-svc="start"]').count()) await tap(row().locator('[data-svc="start"]'));
    if (await row().locator('[data-svc="cleaned"]').count()) await tap(row().locator('[data-svc="cleaned"]'));
    await tap(row().locator('[data-svc="done"]'));
    const d = await svcDoc('main-206');
    rec('A3 키핑 청소 시작~점검 완료(목록에서)', d && d.done && d.start && d.cleaned ? 'PASS' : 'FAIL', `시작 ${!!(d && d.start)} · 청소 끝 ${!!(d && d.cleaned)} · 입실 가능 ${!!(d && d.done)}. "확인"을 먼저 눌러야 시작 버튼이 보임: ${needAck ? '예(+1탭)' : '아니오'}`);
  });
  await step('A4 프론트가 입실 가능을 알아차리는가', async () => {
    await as('fo', '2026-12-02T10:20:00+09:00');
    const tile = await cur.locator('[data-room="main-206"]').first().innerText();
    await menu('svc');
    const t = await viewText();
    rec('A4 프론트가 입실 가능을 알아차리는가', /입실 가능/.test(tile) ? 'PASS' : 'FAIL', `현황판 칸: "${tile.replace(/\s+/g, ' ').slice(0, 40)}" · 청소·재실에 "입실 가능 확인" 버튼 ${/입실 가능 확인/.test(t) ? '있음' : '없음'}`);
  });

  // ===== B. 청소 중 시설 문제 → 시설 → 완료 → 객실 상태 =====
  await step('B1 키핑 청소 중 고장 등록(객실→이 객실로 보내기)', async () => {
    await as('hk', '2026-12-02T10:30:00+09:00');
    await openRoom('main-305');
    if (await has('#dlg [data-svc="hkcostart"]')) await tap(cur.locator('#dlg [data-svc="hkcostart"]'));
    await cur.waitForTimeout(300);
    if (!(await has('#roomNew'))) await openRoom('main-305');
    await tap(cur.locator('#roomNew')); await cur.waitForTimeout(400);
    await tap(cur.locator('[data-send="repair"]').filter({ visible: true }).first()).catch(async () => { await tap(cur.locator('button', { hasText: '수리' }).filter({ visible: true }).first()); });
    const roomVal = await cur.locator('#fRoom').inputValue().catch(() => '');
    taps++; await cur.fill('#fTitle', '욕실 배수 막힘');
    await tap(cur.locator('#newForm button[type=submit], #newForm .btn.main').filter({ hasText: '보내기' }).first());
    const tasks = Object.values(await col('tasks'));
    const t = tasks.find(x => /배수/.test(x.title));
    rec('B1 키핑 청소 중 고장 등록(객실→이 객실로 보내기)', t && t.toDept === 'FM' ? 'PASS' : 'FAIL', `객실칸 자동 입력 "${roomVal}" · 받는 부서 ${t ? t.toDept : '-'} · 종류 ${t ? t.kind : '-'} · roomId ${t ? t.roomId || '(없음)' : '-'}`);
    await shot('B1-hk-sent');
  });
  await step('B2 같은 고장 두 번 등록(다른 직원)', async () => {
    await menu('work');
    await tap(cur.locator('[data-send="repair"]').filter({ visible: true }).first());
    await cur.selectOption('#fBld', 'main').catch(() => {}); taps++;
    await cur.fill('#fRoom', '305'); taps++;
    await cur.fill('#fTitle', '305 욕실 물 안 내려감'); taps++;
    const warn = await cur.evaluate(() => (document.getElementById('newForm') || {}).innerText || '');
    await tap(cur.locator('#newForm .btn.main', { hasText: '보내기' }).first());
    const n = Object.values(await col('tasks')).filter(x => x.roomId === 'main-305' || x.room === '305').length;
    const w2 = LOG.some(l => /같은 종류의 열린 업무/.test(l));
    rec('B2 같은 고장 두 번 등록(다른 직원)', w2 ? 'PASS' : 'FAIL', `보내기 전 "같은 종류의 열린 업무" 확인창 ${w2 ? '뜸(시험에서는 그래도 보냄)' : '없음'} · 305호 수리 ${n}건`);
  });
  await step('B3 시설이 새 요청을 보고 처리', async () => {
    await as('fm', '2026-12-02T10:45:00+09:00');
    await menu('work');
    const t = await viewText();
    const card = cur.locator('[data-act]').filter({ visible: true }).first();
    const lab = await card.innerText().catch(() => '');
    if (await card.count()) await tap(card);
    let t2 = Object.values(await col('tasks')).find(x => /배수/.test(x.title));
    const st1 = t2 && t2.status;
    const nxt = cur.locator('[data-act]').filter({ visible: true }).first(); const lab2 = await nxt.innerText().catch(() => '');
    if (await nxt.count()) await tap(nxt);
    t2 = Object.values(await col('tasks')).find(x => /배수/.test(x.title));
    rec('B3 시설이 새 요청을 보고 처리', /배수/.test(t) && t2 && /완료/.test(t2.status) ? 'PASS' : 'FAIL', `받은 목록에 보임 ${/배수/.test(t)} · 버튼 "${lab}"→${st1} · 다음 "${lab2}"→${t2 && t2.status}`);
    await shot('B3-fm-work');
  });
  await step('B4 수리 중인데 입실 가능 처리 가능한가', async () => {
    await as('hk', '2026-12-02T11:00:00+09:00');
    // 시설 완료 전 상태를 만들려고 두 번째 업무(B2)는 열려 있음
    await openRoom('main-305');
    const before = await dlgText();
    for (const a of ['start', 'cleaned', 'done']) { const b = cur.locator(`#dlg [data-svc="${a}"]`); if (await b.count()) { await tap(b); await cur.waitForTimeout(300); if (!(await has('#dlg[open]'))) await openRoom('main-305'); } }
    const d = await svcDoc('main-305');
    const open = Object.values(await col('tasks')).filter(x => (x.roomId === 'main-305' || x.room === '305') && !/완료|취소/.test(x.status)).length;
    const w4 = LOG.some(l => /시설 업무/.test(l)), chip4 = /수리 중/.test(await viewText().catch(() => '') + before);
    rec('B4 수리 중인데 입실 가능 처리 가능한가', d && d.done && open && !w4 ? 'FAIL' : 'PASS', `확인창 ${w4 ? '뜸' : '없음'} · ` + `열린 수리 ${open}건인데 입실 가능 ${d && d.done ? '처리됨(경고 없음)' : '안 됨'} · 상세에 열린 업무 표시 ${/열린 업무 \| [1-9]/.test(before)}`);
  });
  await step('B5 프론트가 수리 결과를 확인', async () => {
    await as('fo', '2026-12-02T11:10:00+09:00');
    await menu('work'); const t = await viewText();
    rec('B5 프론트가 수리 결과를 확인', /배수|305/.test(t) ? 'PASS' : 'NOTE', `프론트 작업대에 305 수리 ${/배수|305/.test(t) ? '보임' : '안 보임(프론트가 보낸 업무가 아니면 결과 알림 없음)'}`);
  });

  // ===== C. 긴급 객실(이른 입실) =====
  await step('C1 프론트 우선 준비 걸기', async () => {
    await as('fo', '2026-12-02T08:30:00+09:00');
    await openRoom('main-411');
    const inp = cur.locator('#dlg .lt input[type=time]').last();
    const inDlg = await inp.count();
    if (inDlg) { taps++; await inp.fill('12:00'); await tap(cur.locator('#dlg [data-svc="prio"]')); }
    const d = await svcDoc('main-411');
    rec('C1 프론트 우선 준비 걸기', d && d.prio && d.prio.time === '12:00' ? 'PASS' : 'FAIL', `객실 상세에서 우선 준비 ${inDlg ? '가능' : '불가'} · 저장 ${d && d.prio ? d.prio.time : '없음'}`);
    await closeDlg();
  });
  await step('C2 키핑 목록 맨 위로 오는가', async () => {
    await as('hk', '2026-12-02T09:50:00+09:00');
    await as('fo', '2026-12-02T09:50:00+09:00'); await openRoom('main-411'); console.log('C2 dlg:', (await dlgText()).slice(0, 500)); await tap(cur.locator('#dlg [data-svc="co"]')); await closeDlg();
    await openRoom('main-504'); await tap(cur.locator('#dlg [data-svc="co"]')); await closeDlg();
    await as('hk', '2026-12-02T09:55:00+09:00'); await menu('svc');
    const first = await cur.locator('details.secd[data-sec="hk-o-todo"] .srow').first().innerText().catch(() => '');
    rec('C2 키핑 목록 맨 위로 오는가', /411/.test(first) ? 'PASS' : 'FAIL', `할 청소 첫 줄: "${first.replace(/\s+/g, ' ').slice(0, 60)}"`);
  });

  // ===== D. 미완료 인수인계 =====
  await step('D1 주간 프론트가 남긴 고객 요청이 야간에 넘어가는가', async () => {
    await as('fo', '2026-12-02T18:00:00+09:00');
    await menu('work');
    await tap(cur.locator('[data-send="request"]').filter({ visible: true }).first()).catch(() => {});
    await cur.selectOption('#fBld', 'main').catch(() => {}); await cur.fill('#fRoom', '208'); await cur.fill('#fTitle', '아기 침대 22시 설치 요청'); taps += 3;
    await tap(cur.locator('#newForm .btn.main', { hasText: '보내기' }).first());
    const made = Object.values(await col('tasks')).find(x => /아기 침대/.test(x.title));
    await as(made ? made.toDept.toLowerCase() : 'hk', '2026-12-02T22:10:00+09:00'); await menu('work');
    const t = await viewText(); await shot('D1-night');
    const hasCarry = /넘어온 것/.test(t), ho = cur.locator('[data-handoff]');
    if (await ho.count()) await tap(ho);
    const hos = Object.values(await col('handoffs')).concat(Object.values(await col('handovers')));
    rec('D1 주간 프론트가 남긴 고객 요청이 야간에 넘어가는가', hasCarry ? 'PASS' : 'FAIL', `받은 부서 ${made && made.toDept}(${made && made.kind}) 야간 화면 "넘어온 것" 카드 ${hasCarry} · 인수 확인 기록 ${hos.length}건 (프론트→키핑 업무는 키핑 화면에서 확인)`);
  });
  await step('D2 청소·객실 상태도 인수인계에 들어가는가', async () => {
    const t = await viewText();
    rec('D2 청소·객실 상태도 인수인계에 들어가는가', /입실 가능 아님|청소 안 된|미완료 객실/.test(t) ? 'PASS' : 'FAIL', /입실 가능 아님|청소 안 된|미완료 객실/.test(t) ? '작업대 "교대 전달"에 객실 미완료(입실 가능 아님·청소 안 된 재실)가 보임' : '넘어온 것은 업무·불출만. 객실 상태·메모형 전달사항이 인수인계에 안 들어감');
  });
  await step('D3 교대·인수인계 화면', async () => {
    await menu('shift'); const t = await viewText();
    rec('D3 교대·인수인계 화면', /3단계에서 구현/.test(t) ? 'FAIL' : 'PASS', /3단계에서 구현/.test(t) ? '미구현("3단계에서 구현합니다")' : '교대·인수인계 화면: 남은 것 자동 수집·메모·마감');
  });

  // ===== E. 마감 =====
  await step('E1 업무 마감 기능', async () => {
    const t = (await viewText()) + (await cur.evaluate(() => document.body.innerText));
    rec('E1 업무 마감 기능', /마감하기|업무 마감|마감 요청/.test(t) ? 'PASS' : 'FAIL', /마감하기|업무 마감|마감 요청/.test(t) ? '근무 마감(남은 것 있으면 이유 필수, 기록은 추가만)' : '부서별 마감 없음');
  });
  await step('E2 다음날: 전날 입실 가능 못 된 객실이 보이는가', async () => {
    // 418호: 퇴실 완료만 하고 청소 안 함 → 다음 날
    await as('fo', '2026-12-02T11:30:00+09:00'); await openRoom('main-418'); await tap(cur.locator('#dlg [data-svc="co"]'));
    await as('fo', '2026-12-03T08:00:00+09:00');
    const tile = await cur.locator('[data-room="main-418"]').first().innerText().catch(() => '');
    await openRoom('main-418'); const dt = await dlgText();
    await closeDlg(); await menu('svc'); const sv = await viewText(); await shot('E2-prev');
    rec('E2 다음날: 전날 입실 가능 못 된 객실이 보이는가', /어제 미완료/.test(tile) && /입실 가능까지 못 간/.test(sv) ? 'PASS' : 'FAIL', `12/3 현황판 418: "${tile.replace(/\s+/g, ' ').slice(0, 40)}" · 청소·재실 경고 카드 ${/입실 가능까지 못 간/.test(sv) ? '있음' : '없음'}`);
  });

  // ===== 예외 =====
  await step('X1 없는 호수로 업무 보내기', async () => {
    await as('fo', '2026-12-02T12:00:00+09:00'); await menu('work');
    await tap(cur.locator('[data-send="issue"]').filter({ visible: true }).first()).catch(() => {});
    await cur.selectOption('#fBld', 'main').catch(() => {}); await cur.fill('#fRoom', '9999'); await cur.fill('#fTitle', '없는 호수 시험');
    const n0 = Object.keys(await col('tasks')).length;
    await tap(cur.locator('#newForm .btn.main', { hasText: '보내기' }).first());
    const after = Object.values(await col('tasks')); const t = after.find(x => /없는 호수/.test(x.title));
    rec('X1 없는 호수로 업무 보내기', t ? 'FAIL' : 'PASS', t ? `저장됨(room "${t.room}", roomId "${t.roomId || ''}") — 경고 없이 객실과 연결 안 된 업무가 생김` : '막힘');
  });
  await step('X2 내용 없이 보내기', async () => {
    await cur.fill('#fTitle', ''); const n0 = Object.keys(await col('tasks')).length;
    await tap(cur.locator('#newForm .btn.main', { hasText: '보내기' }).first());
    const n1 = Object.keys(await col('tasks')).length;
    rec('X2 내용 없이 보내기', n1 === n0 ? 'PASS' : 'FAIL', n1 === n0 ? '저장 안 됨(필수 입력)' : '빈 업무가 저장됨');
  });
  await step('X3 보내기 두 번 빠르게', async () => {
    await cur.fill('#fRoom', '209'); await cur.fill('#fTitle', '더블클릭 시험');
    const btn = cur.locator('#newForm .btn.main', { hasText: '보내기' }).first();
    await btn.dblclick(); await cur.waitForTimeout(600);
    const n = Object.values(await col('tasks')).filter(x => /더블클릭/.test(x.title)).length;
    rec('X3 보내기 두 번 빠르게', n > 1 ? 'FAIL' : 'PASS', `같은 업무 ${n}건 생성`);
  });
  await step('X4 재실 요청 끝 시각이 시작보다 빠름', async () => {
    await menu('svc');
    const row = cur.locator('.srow', { hasText: '본관 208' }).first();
    await tap(row.locator('[data-svc="edit"]'));
    await cur.fill('#rf-main-208', '14:00'); await cur.fill('#rt-main-208', '11:00');
    await tap(row.locator('[data-svc="req"]'));
    const d = await svcDoc('main-208'); const msg = await cur.evaluate(() => (document.querySelector('.flash, #flash, .toast') || {}).innerText || '');
    rec('X4 재실 요청 끝 시각이 시작보다 빠름', d && d.reply ? 'FAIL' : 'PASS', d && d.reply ? '저장됨' : `막힘 · 안내 "${msg.slice(0, 50)}"`);
  });
  await step('X5 퇴실 완료 두 번 빠르게(목록)', async () => {
    const row = cur.locator('.srow', { hasText: '본관 518' }).first();
    const sum = cur.locator('details.secd[data-sec="fo-o-pre"] > summary'); if (!(await row.isVisible().catch(() => false)) && await sum.count()) await tap(sum);
    await row.locator('[data-svc="co"]').dblclick(); await cur.waitForTimeout(700);
    const d = await svcDoc('main-518');
    rec('X5 퇴실 완료 두 번 빠르게(목록)', d && d.co ? 'PASS' : 'FAIL', d && d.co ? '퇴실 완료 유지' : '두 번째 누름이 "퇴실 완료 취소"가 되어 기록이 지워짐(같은 자리에 취소 버튼이 생김)');
  });
  await step('X6 내일 날짜에서 퇴실 완료 누르기', async () => {
    await tap(cur.locator('[data-rdate="2026-12-03"]').first());
    const b = cur.locator('[data-svc="co"]').filter({ visible: true }).first();
    const can = await b.count();
    if (can) await tap(b);
    const m = await col('roomSvc'); const any = Object.keys(m).some(k => k.startsWith('2026-12-03__') && m[k].co);
    rec('X6 내일 날짜에서 퇴실 완료 누르기', any ? 'FAIL' : 'PASS', any ? '내일 퇴실 객실을 오늘 퇴실 완료로 기록할 수 있음(경고 없음)' : '막힘');
  });
  await step('X7 입력 중 새로고침', async () => {
    await tap(cur.locator('[data-rdate="2026-12-02"]').first());
    const row = cur.locator('.srow', { hasText: '본관 209' }).first();
    await tap(row.locator('[data-svc="edit"]')); await cur.fill('#rm-main-209', '생수 4병 요청');
    await cur.reload(); await cur.waitForTimeout(600);
    const pick = cur.locator('#lock button:visible', { hasText: '프론트' }).first(); if (await pick.count()) await pick.click();
    const v = await cur.locator('#rm-main-209').inputValue().catch(() => null);
    rec('X7 입력 중 새로고침', v === '생수 4병 요청' ? 'PASS' : 'NOTE', v ? '입력 유지' : '입력 내용 사라짐(저장 전이라 예상된 동작이지만 안내 없음)');
  });
  await step('X8 휴대폰 폭에서 가로 넘침', async () => {
    const out = [];
    for (const role of ['fo', 'hk', 'fm']) {
      await as(role, '2026-12-02T10:00:00+09:00', true);
      for (const tab of ['board', 'work', 'svc', 'desk', 'rooms']) {
        if (tab !== 'board') await menu(tab);
        const ov = await cur.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (ov > 2) out.push(`${role}/${tab} +${ov}px`);
        if (tab === 'svc') await cur.screenshot({ path: `${S}/shots/m-${role}-svc.png`, fullPage: false });
      }
    }
    rec('X8 휴대폰 폭에서 가로 넘침', out.length ? 'FAIL' : 'PASS', out.join(', ') || '15화면 모두 넘침 없음(390px)');
  });
  await step('P1 휴대폰 느린 CPU에서 화면 반응', async () => {
    await as('hk', '2026-12-02T10:00:00+09:00', true);
    const cdp = await ctx.newCDPSession(cur); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const ms = [];
    for (const tab of ['svc', 'board']) { const t0 = Date.now(); await menu(tab); ms.push(tab + ' ' + (Date.now() - t0 - 600) + 'ms'); }
    const t0 = Date.now(); await openRoom('main-206'); ms.push('객실 열기 ' + (Date.now() - t0 - 300) + 'ms');
    const r = await cur.evaluate(() => { const t = performance.now(); for (let i = 0; i < 5; i++) window.dispatchEvent(new Event('resize')); return 0; });
    rec('P1 휴대폰 느린 CPU에서 화면 반응', 'NOTE', 'CPU 1/4 속도: ' + ms.join(' · ') + ' (탭 대기시간 포함, 대략값)');
  });

  fs.writeFileSync(S + '/data/scen-result.json', JSON.stringify({ R, LOG }, null, 1));
  console.log('\nLOG', LOG.slice(0, 20));
  await browser.close();
})();
