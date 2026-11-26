// 청소표 담당 읽기 시험: 야간 검수 청소표 열 배치(본관 B~L, 신관 B~K)로 만든 파일
const XLSX = require('xlsx'); global.XLSX = XLSX; global.window = global;
const ROOT = process.argv[2];
require(ROOT + '/js/seocho-ct.js'); require(ROOT + '/js/rooms.js');
const CT = Object.values(global.OPS).find(v => v && v.learnFromCleanSheet) || global.OPS.SeochoCT || global.OPS.CT;
const serial = d => (Date.parse(d + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 864e5;
const main = [[serial('2026-12-02')], [], ['', '당일', '청소기준', 'UH기준', '동', '호수', '객실구분', '청소', '메모', '완료', '담당', '확인'],
  ['', '당일', 1, 1, 'A', 206, '1C', '객실청소', '', '완료', '김민지', ''],
  ['', '', 1, 1, 'A', 208, '1B-1', '재실청소', '11~13', '', '박서연 / 최유나', ''],
  ['', '', 1, 1, 'A', 209, '1B-1', '전체재실', '', '', '', ''],
  ['', '', 1, 1, 'A', 211, '1B', '재실청소', '', '', '13:00', '']];          // 시간이 잘못 들어간 담당 칸 → 버림
const annex = [[serial('2026-12-02')], [], ['', '당일', 'UH기준', '호수', '비번', '객실구분', '청소', '비고', '완료', '담당', '확인'],
  ['', '당일', 1, 1002, '****', 'Studio Double', '객실청소', '', '', '이하늘', ''],
  ['', '', 1, 1004, '****', 'Studio Double', '재실청소', '', '', '김민지', '']];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(main), '청소표(본관)');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(annex), '청소표(신관)');
const learned = CT.learnFromCleanSheet(wb);
console.log('date', JSON.stringify(learned.date), 'kinds main', JSON.stringify(learned.kinds.main));
console.log('assign', JSON.stringify(learned.assign));
console.log('cleanFrom', JSON.stringify(global.OPS.Rooms.cleanFrom(learned, { main: 'main', annex: 'annex' }).assign));
