/** CLI: npm run seed  → recreate the database with demo data (development only). */
import { cfg, loadSecret } from './config.js';
import { openDatabase } from './node-db.js';
import { seed } from './core/seed.js';
import { get } from './core/sql.js';
import { setSecret } from './core/util.js';

setSecret(loadSecret());
openDatabase(cfg.dbPath);
seed(process.argv.includes('--reset'), { days: cfg.scheduleDays });
const c = get<{ t: number; k: number }>(`SELECT (SELECT COUNT(*) FROM trips) t, (SELECT COUNT(*) FROM tickets) k`)!;
console.log(`Seeded: ${c.t} trips, ${c.k} demo tickets.`);
