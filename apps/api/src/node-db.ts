/** node:sqlite driver for the database facade. */
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { setDriver, initSchema } from './core/sql.js';

export function openDatabase(file: string) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  const cache = new Map<string, StatementSync>();
  const st = (sql: string) => {
    let s = cache.get(sql);
    if (!s) { s = db.prepare(sql); cache.set(sql, s); }
    return s;
  };
  setDriver({
    all: (sql, p) => st(sql).all(...(p as any[])),
    get: (sql, p) => st(sql).get(...(p as any[])),
    run: (sql, p) => {
      const r = st(sql).run(...(p as any[]));
      return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
    },
    exec: (sql) => { cache.clear(); db.exec(sql); },
  });
  initSchema();
  return db;
}
