/** Consistent SQLite backups (VACUUM INTO) with simple rotation. */
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

export function backup(db: DatabaseSync, name: string, dir: string, keep: number, skipIfExists = false): string | null {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  if (skipIfExists && fs.existsSync(file)) return null;
  if (fs.existsSync(file)) fs.unlinkSync(file);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const old = fs.readdirSync(dir).filter((f) => /^trains-.*\.db$/.test(f)).sort();
  for (const f of old.slice(0, Math.max(0, old.length - keep))) fs.unlinkSync(path.join(dir, f));
  console.log(`[backup] ${file}`);
  return file;
}
