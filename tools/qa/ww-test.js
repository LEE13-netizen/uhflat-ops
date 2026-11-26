// web/store-supabase.js watchWhere 동작 시험(가짜 Supabase 클라이언트)
global.window = global; global.document = { addEventListener() {}, hidden: false }; global.addEventListener = () => {}; global.dispatchEvent = () => {}; global.Event = function () {};
const ROOT = process.argv[2]; require(ROOT + '/js/store.js'); require(ROOT + '/web/store-supabase.js');
const rows = [{ id: '2026-12-02__a', data: { date: '2026-12-02', roomId: 'a' } }, { id: '2026-12-01__b', data: { date: '2026-12-01', roomId: 'b' } }, { id: '2026-12-02__c', data: { date: '2026-12-02', roomId: 'c' } }];
function fakeSb(failFilter) {
  const chans = [];
  const sb = {
    queries: [],
    channel(name) { const ch = { name, on(e, f, h) { ch.f = f; ch.h = h; return ch; }, subscribe(cb) { setTimeout(() => cb('SUBSCRIBED'), 0); chans.push(ch); return ch; } }; return ch; },
    removeChannel(ch) { ch.removed = true; },
    from() { const q = { f: {}, select() { return q; }, eq(k, v) { q.f[k] = v; return q; }, range() { sb.queries.push(Object.assign({}, q.f)); const jf = Object.keys(q.f).find(k => k.includes('->>'));
      if (jf && failFilter) return Promise.resolve({ data: null, error: { message: 'filter not supported', code: 'PGRST100' } });
      return Promise.resolve({ data: rows.filter(r => !jf || r.data[jf.split('->>')[1]] === q.f[jf]), error: null }); } }; return q; },
    rpc() { return Promise.resolve({ error: null }); }, chans
  };
  return sb;
}
(async () => {
  for (const fail of [false, true]) {
    const sb = fakeSb(fail), be = OPS.Store.makeSupabaseBackend(sb); let got = [];
    const off = be.watchWhere('roomSvc', 'date', '2026-12-02', l => { got = l.map(x => x.id).sort(); });
    await new Promise(r => setTimeout(r, 30));
    const first = got.slice();
    // 실시간: 같은 날짜 새 문서 / 다른 날짜 문서
    const ch = sb.chans.find(c => c.f && c.f.filter === 'col=eq.roomSvc');
    ch.h({ eventType: 'INSERT', new: { id: '2026-12-02__d', data: { date: '2026-12-02', roomId: 'd' } } });
    ch.h({ eventType: 'INSERT', new: { id: '2026-12-03__e', data: { date: '2026-12-03', roomId: 'e' } } });
    await new Promise(r => setTimeout(r, 10));
    console.log(fail ? '[필터 실패 → 전체 받기]' : '[정상: 서버에서 거르기]', 'first', JSON.stringify(first), 'after', JSON.stringify(got), 'queries', JSON.stringify(sb.queries.map(q => Object.keys(q).join('+'))));
    off();
  }
})();
