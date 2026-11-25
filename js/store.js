/* 저장소 창구. 화면과 엔진은 이 창구만 쓴다.
   공유 DB가 열리면 공유 DB, 아니면 이 기기 저장(localStorage)으로 동작한다.
   나중에 외부 서버로 바꿀 때도 이 파일만 고친다. */
(function (G) {
  const OPS = G.OPS = G.OPS || {};

  function makeLocalBackend(storage) {
    const KEY = c => "opsFrame:v1:" + c;
    const cache = {};
    const listeners = {};
    const load = c => {
      if (!cache[c]) {
        let o = {};
        try { o = JSON.parse(storage.getItem(KEY(c)) || "{}") || {}; } catch (e) { o = {}; }
        cache[c] = o;
      }
      return cache[c];
    };
    const persist = c => {
      try { storage.setItem(KEY(c), JSON.stringify(cache[c] || {})); }
      catch (e) { throw new Error("이 기기의 저장 공간이 부족합니다."); }
    };
    const list = c => Object.keys(load(c)).map(id => Object.assign({ id }, load(c)[id]));
    const emit = c => (listeners[c] || new Set()).forEach(fn => { try { fn(list(c)); } catch (e) {} });
    const newId = () => "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    return {
      kind: "local",
      async add(c, data) { const id = newId(); load(c)[id] = JSON.parse(JSON.stringify(data)); persist(c); emit(c); return id; },
      async set(c, id, data) { load(c)[id] = JSON.parse(JSON.stringify(data)); persist(c); emit(c); },
      async update(c, id, patch) {
        const cur = load(c)[id];
        if (!cur) throw new Error("기록을 찾지 못했습니다: " + id);
        load(c)[id] = Object.assign({}, cur, JSON.parse(JSON.stringify(patch))); persist(c); emit(c);
      },
      async get(c, id) { const v = load(c)[id]; return v ? Object.assign({ id }, v) : null; },
      async remove(c, id) { delete load(c)[id]; persist(c); emit(c); },
      async all(c) { return list(c); },
      watch(c, fn) {
        (listeners[c] = listeners[c] || new Set()).add(fn);
        setTimeout(() => fn(list(c)), 0);
        return () => listeners[c].delete(fn);
      },
      watchWhere(c, field, value, fn) { return this.watch(c, list => fn(list.filter(x => x[field] === value))); },
      _reload(c) { delete cache[c]; emit(c); }
    };
  }

  function makeDbBackend(db) {
    const col = c => db.collection(c);
    return {
      kind: "db",
      async add(c, data) { const ref = await col(c).add(data); return ref.id; },
      async set(c, id, data) { await col(c).doc(id).set(data); },
      async update(c, id, patch) { await col(c).doc(id).update(patch); },
      async remove(c, id) { await col(c).doc(id).delete(); },
      async get(c, id) {
        const s = await col(c).doc(id).get();
        return s && s.exists ? Object.assign({ id: s.id || id }, s.data()) : null;
      },
      async all(c) {
        const s = await col(c).get();
        return s.docs.map(d => Object.assign({ id: d.id }, d.data()));
      },
      watchWhere(c, field, value, fn, onErr) {
        return col(c).where(field, "==", value).onSnapshot(
          s => fn(s.docs.map(d => Object.assign({ id: d.id }, d.data()))),
          e => { if (onErr) onErr(e); }
        );
      },
      watch(c, fn, onErr) {
        return col(c).onSnapshot(
          s => fn(s.docs.map(d => Object.assign({ id: d.id }, d.data()))),
          e => { if (onErr) onErr(e); }
        );
      }
    };
  }

  // 웹 배포용: Supabase 표 하나(ops_docs: col, id, data)에 모든 모음을 담는다. 실시간은 Realtime 구독.
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
        .subscribe(s => { if (s === "SUBSCRIBED") load(); if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") h.errs.forEach(f => f(new Error("실시간 연결이 끊겼습니다(" + s + ")"))); });
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

  OPS.Store = {
    backend: null,
    // 웹(Supabase 로그인)이면 Supabase, 아니면 공유 DB를 10초까지 기다리고, 안 되면 이 기기 저장으로 시작한다.
    async init() {
      if (G.OPS && G.OPS.SB && G.OPS.Auth) { this.backend = makeSupabaseBackend(G.OPS.SB); return this.backend.kind; }
      let db = null;
      try {
        const c = G.claude;
        if (c && typeof c.use === "function") {
          db = await Promise.race([c.use("db"), new Promise(r => setTimeout(() => r(null), 10000))]);
        }
      } catch (e) { db = null; }
      let storage = null;
      try { storage = G.localStorage; storage.getItem("x"); } catch (e) { storage = null; }
      if (!storage) {
        const mem = {};
        storage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
      }
      this.backend = db ? makeDbBackend(db) : makeLocalBackend(storage);
      return this.backend.kind;
    },
    useBackend(b) { this.backend = b; return b.kind; },
    makeLocalBackend,
    add(c, d) { return this.backend.add(c, d); },
    set(c, id, d) { return this.backend.set(c, id, d); },
    update(c, id, p) { return this.backend.update(c, id, p); },
    get(c, id) { return this.backend.get(c, id); },
    remove(c, id) { return this.backend.remove(c, id); },
    all(c) { return this.backend.all(c); },
    watch(c, fn, onErr) { return this.backend.watch(c, fn, onErr); },
    watchWhere(c, field, value, fn, onErr) { return this.backend.watchWhere(c, field, value, fn, onErr); }
  };
})(typeof window !== "undefined" ? window : globalThis);
