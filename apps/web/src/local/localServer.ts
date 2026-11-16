/**
 * Static demo mode (GitHub Pages): the real API route table runs inside the browser
 * on SQLite compiled to WebAssembly. Every visitor gets their own database, saved in
 * IndexedDB so bookings survive a reload.
 */
import initSqlJs, { type Database, type Statement } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { setDriver, initSchema, get } from '../../../api/src/core/sql';
import { seed } from '../../../api/src/core/seed';
import { handle } from '../../../api/src/core/routes';
import { todayLocal, addDays } from '../../../api/src/core/util';

const STORE = 'rasnov-trains';
const KEY = 'db-v2';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(STORE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function load(): Promise<{ bytes: Uint8Array; seededOn: string } | null> {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const q = db.transaction('kv').objectStore('kv').get(KEY);
      q.onsuccess = () => resolve(q.result ?? null);
      q.onerror = () => resolve(null);
    });
  } catch { return null; }
}
async function save(value: { bytes: Uint8Array; seededOn: string }) {
  try {
    const db = await idb();
    db.transaction('kv', 'readwrite').objectStore('kv').put(value, KEY);
  } catch { /* private mode: keep working in memory */ }
}

let db: Database;
let seededOn = '';
const cache = new Map<string, Statement>();
const st = (sql: string) => {
  let s = cache.get(sql);
  if (!s) { s = db.prepare(sql); cache.set(sql, s); }
  return s;
};
const bind = (p: unknown[]) => p.map((v) => (v === undefined ? null : v)) as any[];
function clearCache() { cache.forEach((s) => { try { s.free(); } catch { /* already freed */ } }); cache.clear(); }

async function init() {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = await load();
  // a saved demo database older than a week is replaced so the timetable stays current
  const fresh = saved && saved.seededOn >= addDays(todayLocal(), -7);
  db = fresh ? new SQL.Database(saved!.bytes) : new SQL.Database();
  seededOn = fresh ? saved!.seededOn : todayLocal();
  setDriver({
    all: (sql, p) => {
      const s = st(sql); s.bind(bind(p));
      const rows: any[] = [];
      while (s.step()) rows.push(s.getAsObject());
      s.reset();
      return rows;
    },
    get: (sql, p) => {
      const s = st(sql); s.bind(bind(p));
      const row = s.step() ? s.getAsObject() : undefined;
      s.reset();
      return row;
    },
    run: (sql, p) => {
      const s = st(sql); s.run(bind(p));
      const changes = db.getRowsModified();
      const id = Number(db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] ?? 0);
      return { changes, lastInsertRowid: id };
    },
    exec: (sql) => { clearCache(); db.exec(sql); },
  });
  initSchema();
  if (!fresh || !get(`SELECT id FROM stations LIMIT 1`)) {
    seed(true);
    persist(0);
  }
}

let timer: number | undefined;
function persist(delay = 400) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    clearCache(); // sql.js frees prepared statements on export
    save({ bytes: db.export(), seededOn });
  }, delay);
}

let ready: Promise<void> | null = null;

export async function localRequest(method: string, path: string, body: unknown, authorization?: string) {
  await (ready ??= init());
  const url = new URL(path, 'http://local');
  const query = Object.fromEntries(url.searchParams.entries());
  const res = handle(method, url.pathname, query, body, authorization);
  if (method !== 'GET') persist();
  // round-trip through JSON so the UI never shares objects with the database layer
  return { status: res.status, body: JSON.parse(JSON.stringify(res.body)) };
}
