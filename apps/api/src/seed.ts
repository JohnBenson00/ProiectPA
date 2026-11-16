/** CLI: npm run seed  → recreate the database with demo data. */
import { openDatabase } from './node-db.js';
import { seed } from './core/seed.js';
import { get } from './core/sql.js';

openDatabase();
seed(process.argv.includes('--reset'));
const c = get<{ t: number; k: number }>(`SELECT (SELECT COUNT(*) FROM trips) t, (SELECT COUNT(*) FROM tickets) k`)!;
console.log(`Seeded: ${c.t} trips, ${c.k} demo tickets.`);
