/* 웹 전용: 저장소를 Supabase로 바꾼다. 아티팩트의 store.js는 그대로 두고, 그 뒤에 불러와 init만 감싼다.
   표 하나(ops_docs: col, id, data)에 모든 모음을 담고, 실시간은 Supabase Realtime 구독. */
(function (G) {
  const OPS = G.OPS = G.OPS || {};

  function makeSupabaseBackend(sb) {
    const T = "ops_docs";
    const newId = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const row = r => Object.assign({ id: r.id }, r.data || {});
    const fail = (e, what) => { const err = new Error((what || "저장") + " 실패: " + (e && e.message || e)); err.code = e && e.code; return err; };
    async function fetchAll(c) {
      const out = []; const N = 1000;
      for (let from = 0; ; from += N) {
        const { data, error } = await sb.from(T).select("id,data").eq("col", c).range(from, from + N - 1);
        if (error) throw fail(error, "불러오기");
        out.push(...data.map(row));
        if (data.length < N) break;
      }
      return out;
    }
    // 같은 모음을 여러 화면이 지켜보면 구독 하나를 나눠 쓴다
    const hubs = {};
    // 연결 상태(상단 점 표시용): 모든 구독이 SUBSCRIBED면 ok, 하나라도 끊기면 down
    const chState = {};
    OPS.Conn = { state: "connecting" };
    const connUpdate = (c, s) => {
      chState[c] = s;
      const v = Object.values(chState);
      const next = v.some(x => x === "CHANNEL_ERROR" || x === "TIMED_OUT" || x === "CLOSED") ? "down" : v.every(x => x === "SUBSCRIBED") ? "ok" : "connecting";
      if (next !== OPS.Conn.state) { OPS.Conn.state = next; try { dispatchEvent(new Event("ops-conn")); } catch (e) {} }
    };
    // 삭제 알림: Supabase는 DELETE 알림에 필터(col=eq.…)를 걸 수 없어 모음별 구독으로는 오지 않는다.
    // 필터 없는 삭제 전용 구독 하나를 두고, 알림의 기본키(col, id)로 해당 모음에서 뺀다.
    // (RLS가 켜진 표는 삭제 알림에 기본키만 담기는데, 이 표의 기본키가 col+id라 충분하다)
    let delCh = null;
    function watchDeletes() {
      if (delCh) return;
      delCh = sb.channel("ops:_del")
        .on("postgres_changes", { event: "DELETE", schema: "public", table: T }, p => {
          const o = p.old || {}; const h = hubs[o.col];
          if (h && o.id != null && h.map.delete(o.id)) h.emit();
        })
        .subscribe(s => connUpdate("_del", s));
    }
    // 화면을 5분 넘게 가려 두었다가(휴대폰 잠금·다른 탭) 돌아오면 놓친 변경을 다시 불러온다
    let hiddenAt = 0;
    try {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) { hiddenAt = Date.now(); return; }
        if (hiddenAt && Date.now() - hiddenAt > 5 * 60e3) { Object.values(hubs).forEach(h => h.load()); wheres.forEach(w => w.load().catch(() => {})); }
        hiddenAt = 0;
      });
    } catch (e) {}
    function hub(c) {
      if (hubs[c]) return hubs[c];
      watchDeletes();
      const h = hubs[c] = { map: new Map(), fns: new Set(), ready: false, errs: new Set() };
      const emit = () => { const list = Array.from(h.map.values()); h.fns.forEach(fn => { try { fn(list); } catch (e) {} }); };
      h.emit = emit;
      const load = h.load = () => fetchAll(c).then(list => { h.map = new Map(list.map(x => [x.id, x])); h.ready = true; emit(); }).catch(e => h.errs.forEach(f => f(e)));
      h.ch = sb.channel("ops:" + c)
        .on("postgres_changes", { event: "*", schema: "public", table: T, filter: "col=eq." + c }, p => {
          if (p.eventType === "DELETE") { const id = p.old && p.old.id; if (id) h.map.delete(id); }
          else if (p.new) h.map.set(p.new.id, row(p.new));
          emit();
        })
        .subscribe(s => { connUpdate(c, s); if (s === "SUBSCRIBED") load(); if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") h.errs.forEach(f => f(new Error("실시간 연결이 끊겼습니다(" + s + ")"))); });
      return h;
    }
    // 내 저장은 실시간 알림을 기다리지 않고 화면에 바로 반영
    // [web] 한 값으로 걸러 보는 구독(예: 청소 기록의 날짜). 서버에서 그 값만 내려받아, 기록이 몇 달 쌓여도 첫 화면이 느려지지 않는다
    const wheres = new Set;
    const local = (c, id, v) => {
      const h = hubs[c];
      if (h) { if (v == null) h.map.delete(id); else h.map.set(id, Object.assign({ id }, v)); h.emit(); }
      wheres.forEach(w => { if (w.c !== c) return; if (v != null && v[w.field] === w.value) { w.map.set(id, Object.assign({ id }, v)); w.emit(); } else if (w.map.delete(id)) w.emit(); });
    };
    const backend = {
      kind: "db",
      async add(c, data) { const id = newId(); const { error } = await sb.from(T).insert({ col: c, id, data }); if (error) throw fail(error); local(c, id, data); return id; },
      async set(c, id, data) { const { error } = await sb.from(T).upsert({ col: c, id, data }); if (error) throw fail(error); local(c, id, data); },
      async update(c, id, patch) {
        const { error } = await sb.rpc("ops_patch", { p_col: c, p_id: id, p_patch: patch }); if (error) throw fail(error);
        const h = hubs[c]; if (h && h.map.has(id)) local(c, id, Object.assign({}, h.map.get(id), patch));
      },
      // 바꾼 칸만 서버에서 합친다(동시 수정 손실 방지). 함수가 아직 없는 DB면 code PGRST202로 실패 → 호출한 쪽이 set으로 대신한다
      async merge(c, id, patch) {
        const { error } = await sb.rpc("ops_merge", { p_col: c, p_id: id, p_patch: patch, p_log_max: 20 }); if (error) throw fail(error);
        const h = hubs[c], old = (h && h.map.get(id)) || {};
        const p = Object.assign({}, patch); if (Array.isArray(p.log)) p.log = p.log.concat(old.log || []).slice(0, 20);
        local(c, id, Object.assign({}, old, p));
      },
      async remove(c, id) { const { error } = await sb.from(T).delete().eq("col", c).eq("id", id); if (error) throw fail(error, "삭제"); local(c, id, null); },
      async get(c, id) { const { data, error } = await sb.from(T).select("id,data").eq("col", c).eq("id", id).maybeSingle(); if (error) throw fail(error, "불러오기"); return data ? row(data) : null; },
      async all(c) { return fetchAll(c); },
      watch(c, fn, onErr) {
        const h = hub(c); h.fns.add(fn); if (onErr) h.errs.add(onErr);
        if (h.ready) setTimeout(() => fn(Array.from(h.map.values())), 0);
        return () => { h.fns.delete(fn); if (onErr) h.errs.delete(onErr); };
      },
      watchWhere(c, field, value, fn, onErr) {
        if (!/^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(field) || typeof value !== "string") return this.watch(c, list => fn(list.filter(x => x[field] === value)), onErr);
        const key = c + "|" + field + "=" + value;
        const w = { c, field, value, map: new Map(), alive: true };
        w.emit = () => { if (w.alive) { try { fn(Array.from(w.map.values())); } catch (e) {} } };
        w.load = async () => {
          const out = [];
          for (let from = 0; ; from += 1000) {
            const { data, error } = await sb.from(T).select("id,data").eq("col", c).eq("data->>" + field, value).range(from, from + 999);
            if (error) throw fail(error, "불러오기");
            out.push(...data.map(row));
            if (data.length < 1000) break;
          }
          w.map = new Map(out.map(x => [x.id, x])); w.emit();
        };
        w.ch = sb.channel("ops:" + key + ":" + Math.random().toString(36).slice(2, 8))
          .on("postgres_changes", { event: "*", schema: "public", table: T, filter: "col=eq." + c }, p => {
            if (p.eventType === "DELETE") { const id = p.old && p.old.id; if (id && w.map.delete(id)) w.emit(); return; }
            if (!p.new) return;
            const x = row(p.new);
            if (x[field] === value) { w.map.set(x.id, x); w.emit(); } else if (w.map.delete(x.id)) w.emit();
          })
          .subscribe(s => { connUpdate(key, s); if (s === "SUBSCRIBED") w.load().catch(fallback); if ((s === "CHANNEL_ERROR" || s === "TIMED_OUT") && onErr) onErr(new Error("실시간 연결이 끊겼습니다(" + s + ")")); });
        wheres.add(w);
        const stop = () => { w.alive = false; wheres.delete(w); delete chState[key]; try { sb.removeChannel(w.ch); } catch (e) {} };
        // 서버에서 걸러 받기가 실패하면(예: 필터 미지원) 예전 방식(전체를 받아 화면에서 거르기)으로 바꿔 계속 보이게 한다
        let off = null;
        function fallback(e) { if (off) return; stop(); try { console.warn("watchWhere fallback", e && e.message); } catch (x) {} off = backend.watch(c, list => fn(list.filter(x => x[field] === value)), onErr); }
        return () => { stop(); if (off) off(); };
      }
    };
    return backend;
  }

  if (!OPS.Store) throw new Error("store.js를 먼저 불러와야 합니다.");
  const origInit = OPS.Store.init.bind(OPS.Store);
  OPS.Store.init = async function () {
    if (OPS.SB && OPS.Auth) { this.backend = makeSupabaseBackend(OPS.SB); return this.backend.kind; }
    return origInit();
  };
  OPS.Store.makeSupabaseBackend = makeSupabaseBackend;
})(typeof window !== "undefined" ? window : globalThis);
