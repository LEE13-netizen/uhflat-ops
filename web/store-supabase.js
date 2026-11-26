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
    function hub(c) {
      if (hubs[c]) return hubs[c];
      const h = hubs[c] = { map: new Map(), fns: new Set(), ready: false, errs: new Set() };
      const emit = () => { const list = Array.from(h.map.values()); h.fns.forEach(fn => { try { fn(list); } catch (e) {} }); };
      h.emit = emit;
      const load = () => fetchAll(c).then(list => { h.map = new Map(list.map(x => [x.id, x])); h.ready = true; emit(); }).catch(e => h.errs.forEach(f => f(e)));
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
    const local = (c, id, v) => { const h = hubs[c]; if (!h) return; if (v == null) h.map.delete(id); else h.map.set(id, Object.assign({ id }, v)); h.emit(); };
    return {
      kind: "db",
      async add(c, data) { const id = newId(); const { error } = await sb.from(T).insert({ col: c, id, data }); if (error) throw fail(error); local(c, id, data); return id; },
      async set(c, id, data) { const { error } = await sb.from(T).upsert({ col: c, id, data }); if (error) throw fail(error); local(c, id, data); },
      async update(c, id, patch) {
        const { error } = await sb.rpc("ops_patch", { p_col: c, p_id: id, p_patch: patch }); if (error) throw fail(error);
        const h = hubs[c]; if (h && h.map.has(id)) local(c, id, Object.assign({}, h.map.get(id), patch));
      },
      async remove(c, id) { const { error } = await sb.from(T).delete().eq("col", c).eq("id", id); if (error) throw fail(error, "삭제"); local(c, id, null); },
      async get(c, id) { const { data, error } = await sb.from(T).select("id,data").eq("col", c).eq("id", id).maybeSingle(); if (error) throw fail(error, "불러오기"); return data ? row(data) : null; },
      async all(c) { return fetchAll(c); },
      watch(c, fn, onErr) {
        const h = hub(c); h.fns.add(fn); if (onErr) h.errs.add(onErr);
        if (h.ready) setTimeout(() => fn(Array.from(h.map.values())), 0);
        return () => { h.fns.delete(fn); if (onErr) h.errs.delete(onErr); };
      },
      watchWhere(c, field, value, fn, onErr) { return this.watch(c, list => fn(list.filter(x => x[field] === value)), onErr); }
    };
  }

  if (!OPS.Store) throw new Error("store.js를 먼저 불러와야 합니다.");
  const origInit = OPS.Store.init.bind(OPS.Store);
  OPS.Store.init = async function () {
    if (OPS.SB && OPS.Auth) { this.backend = makeSupabaseBackend(OPS.SB); return this.backend.kind; }
    return origInit();
  };
  OPS.Store.makeSupabaseBackend = makeSupabaseBackend;
})(typeof window !== "undefined" ? window : globalThis);
