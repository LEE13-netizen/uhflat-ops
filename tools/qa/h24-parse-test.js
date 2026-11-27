// 24시 스테이 읽기 시험(테스트 데이터): 메모(한글·영어) · 하늘색 숫자 · 두 날짜 칸 병합 · 입실 시각 · 오인(24시 이후 도착) 방지
// 사용: node h24-parse-test.js <저장소 경로>  (같은 폴더에 xlsx·jszip 필요)
const XLSX = require('xlsx'), JSZip = require('jszip'); global.XLSX = XLSX; global.JSZip = JSZip; global.window = global;
const ROOT = process.argv[2];
require(ROOT + '/js/seocho-ct.js'); require(ROOT + '/js/rooms.js');
const CT = Object.values(global.OPS).find(v => v && v.generate && v.readStays);
const serial = d => (Date.parse(d + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 864e5;
const D = ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30'];
// 열: A 동, B 호수, C 객실명, D~ 날짜(7열마다 날짜가 있어야 날짜 행으로 인식 → D~AP까지 날짜를 이어 둔다)
const NC = 40, dates = []; for (let i = 0; i < NC; i++) dates.push(new Date(Date.parse('2026-11-25T00:00:00Z') + i * 864e5).toISOString().slice(0, 10));
const aoa = [[], ['동', '호수', '객실명'].concat(dates.map(serial))];
const ROOMS = { 101: {}, 102: {}, 103: {}, 104: {}, 105: {}, 106: {}, 107: {} };
Object.keys(ROOMS).forEach(r => aoa.push(['A', +r, 'Studio']));
const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!merges'] = [];
const col = d => 3 + dates.indexOf(d), row = r => 2 + Object.keys(ROOMS).indexOf(String(r));
const put = (r, d, v, cm, span) => { const a = XLSX.utils.encode_cell({ r: row(r), c: col(d) }); ws[a] = { t: 'n', v }; if (cm) ws[a].c = [{ a: 'x', t: cm }]; if (span) ws['!merges'].push({ s: { r: row(r), c: col(d) }, e: { r: row(r), c: col(d) + span - 1 } }); };
put(101, '2026-11-27', 80000);                                                     // 일반 1박
put(102, '2026-11-27', 45000, '야놀자\n24시 스테이\n체크인\n2026년 11월 27일 15:00', 2);   // 24시: 두 칸 병합 → 1박으로
put(103, '2026-11-27', 52000, 'Agoda\n24 Hours Stay\nCheck-in: 3:00 PM');             // 영어 메모 · 다음 날 같은 방 새 입실
put(103, '2026-11-28', 70000, '부킹\n예약번호: 99887766');
put(104, '2026-11-27', 40000);                                                     // 하늘색 숫자만(메모 없음)
put(105, '2026-11-27', 90000, null, 2);                                            // 하늘색 숫자 2칸(메모 없음) → 박수는 그대로
put(106, '2026-11-27', 60000, '여기어때\n24시 이후 도착 예정');                       // "24시 이후 도착"은 24시 스테이 아님
put(107, '2026-11-28', 45000, '네이버\n24H stay\n입실 오후 2시');                     // 오늘(11/28) 입실 24시
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '2611(본관)');
(async () => {
  // 하늘색 글자색(styles.xml)을 104·105 칸에 입힌다
  const z = await JSZip.loadAsync(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  let sty = await z.file('xl/styles.xml').async('string');
  sty = sty.replace(/<fonts count="(\d+)">([\s\S]*?)<\/fonts>/, (m, n, body) => `<fonts count="${+n + 1}">${body}<font><sz val="11"/><color rgb="FF00B0F0"/><name val="Calibri"/></font></fonts>`);
  const fontId = +(sty.match(/<fonts count="(\d+)"/)[1]) - 1;
  let xfN; sty = sty.replace(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/, (m, n, body) => { xfN = +n; return `<cellXfs count="${+n + 1}">${body}<xf numFmtId="0" fontId="${fontId}" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>`; });
  z.file('xl/styles.xml', sty);
  let sh = await z.file('xl/worksheets/sheet1.xml').async('string');
  for (const r of [104, 105]) { const ref = XLSX.utils.encode_cell({ r: row(r), c: col('2026-11-27') }); sh = sh.replace(new RegExp(`<c r="${ref}"([^>]*?)( s="\\d+")?([^>]*)>`), `<c r="${ref}"$1$3 s="${xfN}">`); }
  z.file('xl/worksheets/sheet1.xml', sh);
  const bytes = await z.generateAsync({ type: 'uint8array' });
  const wb2 = XLSX.read(bytes, { type: 'array', cellNF: true });
  const stays = CT.readStays(wb2);
  const blue = await CT.readFontBlue(bytes, wb2, stays);
  const T = '2026-11-28', g = CT.generate(stays, T, {}, { main: {}, annex: {} }, {});
  const by = {}; g.main.forEach(r => { by[r.room] = r; });
  const day27 = global.OPS.Rooms.dayFrom(stays, '2026-11-27', null, { main: 'main', annex: 'annex' }), day28 = global.OPS.Rooms.dayFrom(stays, T, null, { main: 'main', annex: 'annex' });
  const R = []; const ok = (name, c, note) => { R.push(c); console.log(`[${c ? 'PASS' : 'FAIL'}] ${name} — ${note}`); };
  const f = r => (by[r] ? `${by[r].state}/${by[r].kind} h24=${JSON.stringify(by[r].h24 || null)} flags=${JSON.stringify(by[r].flags)} risk=${JSON.stringify(by[r].risk || [])}` : '없음');
  ok('일반 1박은 그대로 퇴실', by[101] && by[101].state === '퇴실' && !by[101].h24, f(101));
  ok('24시 스테이(한글 메모, 두 칸 병합) → 1박: 오늘 퇴실 15:00', by[102] && by[102].state === '퇴실' && by[102].h24 && by[102].h24.co === '15:00' && by[102].flags.some(x => /2일에 걸쳐/.test(x)), f(102));
  ok('24시 스테이(영어 메모, 3:00 PM) + 같은 날 새 입실 → 겹침 경고', by[103] && by[103].state === '퇴실·입실' && by[103].h24 && by[103].h24.co === '15:00' && (by[103].risk || []).some(x => /24시 스테이 퇴실 15:00/.test(x)), f(103));
  ok('하늘색 숫자만 → 24시 스테이 추정(메모 확인 안내)', blue && by[104] && by[104].h24 && by[104].flags.some(x => /하늘색/.test(x)), f(104));
  ok('하늘색 숫자 2칸(메모 없음) → 박수 바꾸지 않음(오늘 재실)', by[105] && by[105].state !== '퇴실' && by[105].state !== '퇴실·입실', f(105));
  ok('"24시 이후 도착"은 24시 스테이 아님', by[106] && by[106].state === '퇴실' && !by[106].h24, f(106));
  ok('OPS 11/27 입실 칸에 24시 표시', day27['main-102'] && day27['main-102'].stay === '입실' && day27['main-102'].h24 && /24시 스테이 입실 15:00/.test(day27['main-102'].flags[0]), JSON.stringify(day27['main-102']));
  ok('OPS 11/28 퇴실 칸에 퇴실 시각', day28['main-102'] && day28['main-102'].h24 && day28['main-102'].h24.co === '15:00' && day28['main-107'] && /24시 스테이 입실 14:00/.test((day28['main-107'].flags || [])[0] || ''), JSON.stringify([day28['main-102'], day28['main-107']]));
  const sp = global.OPS.Rooms.spansFrom(stays, { main: 'main', annex: 'annex' }, '2026-11-20', '2026-12-31');
  ok('투숙 기간(stayIndex)도 1박', JSON.stringify(sp['main-102']) === JSON.stringify([['2026-11-27', '2026-11-28']]), JSON.stringify(sp['main-102']));
  console.log(R.every(Boolean) ? '24시 스테이 읽기: 통과' : '24시 스테이 읽기: 실패');
  process.exit(R.every(Boolean) ? 0 : 1);
})();
