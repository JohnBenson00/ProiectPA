/** node:sqlite driver for the database facade. */
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setDriver, initSchema } from './core/sql.js';
import { setSecret } from './core/util.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function openDatabase(file = process.env.DB_PATH ?? path.join(here, '..', 'trains.db')) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
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
  if (process.env.TICKET_SECRET) setSecret(process.env.TICKET_SECRET);
  initSchema();
  return db;
}
