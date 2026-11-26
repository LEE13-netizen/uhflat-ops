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
      // 바꾼 칸만 합치기(없으면 만들기). log는 새 기록을 앞에 덧붙인다 — 서버 함수 ops_merge와 같은 규칙
      async merge(c, id, patch) {
        const cur = load(c)[id] || {}, p = JSON.parse(JSON.stringify(patch));
        if (Array.isArray(p.log)) p.log = p.log.concat(cur.log || []).slice(0, 20);
        load(c)[id] = Object.assign({}, cur, p); persist(c); emit(c);
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

  OPS.Store = {
    backend: null,
    // 공유 DB를 10초까지 기다리고, 안 되면 이 기기 저장으로 시작한다.
    async init() {
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
    // [web] 바꾼 칸만 합치기. 백엔드에 없으면(예전 아티팩트 DB) 이 칸이 없는 것처럼 undefined → svc.js가 set으로 저장
    get merge() { const b = this.backend; return b && b.merge ? (c, id, p) => b.merge(c, id, p) : undefined; },
    get(c, id) { return this.backend.get(c, id); },
    remove(c, id) { return this.backend.remove(c, id); },
    all(c) { return this.backend.all(c); },
    watch(c, fn, onErr) { return this.backend.watch(c, fn, onErr); },
    watchWhere(c, field, value, fn, onErr) { return this.backend.watchWhere(c, field, value, fn, onErr); }
  };
})(typeof window !== "undefined" ? window : globalThis);
