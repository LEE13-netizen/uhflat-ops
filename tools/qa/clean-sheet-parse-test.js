// 청소표 담당 읽기 시험: 야간 검수 청소표 열 배치(본관 B~L, 신관 B~K)로 만든 파일
const XLSX = require('xlsx'); global.XLSX = XLSX; global.window = global;
const ROOT = process.argv[2];
require(ROOT + '/js/seocho-ct.js'); require(ROOT + '/js/rooms.js');
const CT = Object.values(global.OPS).find(v => v && v.learnFromCleanSheet) || global.OPS.SeochoCT || global.OPS.CT;
const serial = d => (Date.parse(d + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 864e5;
const main = [[serial('2026-12-02')], [], ['', '당일', '청소기준', 'UH기준', '동', '호수', '객실구분', '청소', '메모', '완료', '담당', '확인'],
  ['', '당일', 1, 1, 'A', 206, '1C', '객실청소', '', '완료', '김민지', ''],
  ['', '', 1, 1, 'A', 208, '1B-1', '재실청소', '11~13', '', '박서연 / 최유나', ''],
  ['', '', 1, 1, 'A', 209, '1B-1', '전체재실', '오후 2시 정비 부탁', '', '', ''],
  ['', '', 1, 1, 'A', 211, '1B', '재실청소', '', '', '13:00', ''],
  ['', '', 1, 1, 'A', 212, '1B', '재실청소', '※확인 11/24 1512호 13시', '', '', ''],   // 확인 줄·날짜·호수는 시간 아님 → 요청 없음
  ['', '', 1, 1, 'A', 213, '1B', '재실청소', '13시', '', '', ''],
  ['', '', 1, 1, 'A', 214, '1B', '객실청소', '11~13', '', '', '']];          // 퇴실(객실청소) 메모는 재실 요청 아님          // 시간이 잘못 들어간 담당 칸 → 버림
const annex = [[serial('2026-12-02')], [], ['', '당일', 'UH기준', '호수', '비번', '객실구분', '청소', '비고', '완료', '담당', '확인'],
  ['', '당일', 1, 1002, '****', 'Studio Double', '객실청소', '', '', '이하늘', ''],
  ['', '', 1, 1004, '****', 'Studio Double', '재실청소', '12~', '', '김민지', '']];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(main), '청소표(본관)');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(annex), '청소표(신관)');
const learned = CT.learnFromCleanSheet(wb);
console.log('date', JSON.stringify(learned.date), 'kinds main', JSON.stringify(learned.kinds.main));
console.log('assign', JSON.stringify(learned.assign));
console.log('cleanFrom', JSON.stringify(global.OPS.Rooms.cleanFrom(learned, { main: 'main', annex: 'annex' }).assign));
// [web] 재실 요청 시간(메모) 확인 — 틀리면 실패로 끝낸다
const got = global.OPS.Rooms.cleanFrom(learned, { main: 'main', annex: 'annex' }).requests || {};
const want = { 'main-208': '11:00~13:00', 'main-209': '14:00~16:00', 'main-213': '13:00~15:00', 'annex-1004': '12:00~14:00' };
const gotS = Object.fromEntries(Object.entries(got).map(([k, q]) => [k, q.from + '~' + q.to]));
console.log('requests', JSON.stringify(gotS));
const okReq = JSON.stringify(Object.keys(gotS).sort().map(k => [k, gotS[k]])) === JSON.stringify(Object.keys(want).sort().map(k => [k, want[k]]));
console.log(okReq ? '재실 요청 시간 읽기: 통과' : '재실 요청 시간 읽기: 실패 (기대 ' + JSON.stringify(want) + ')');
if (!okReq) process.exit(1);
