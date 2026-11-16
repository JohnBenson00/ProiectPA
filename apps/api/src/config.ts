/**
 * Server configuration, all from environment variables (see deploy/.env.example).
 * Defaults are safe for development; production is selected with NODE_ENV=production.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const bool = (v: string | undefined, def: boolean) => (v === undefined || v === '' ? def : /^(1|true|yes|on)$/i.test(v));

export const production = env.NODE_ENV === 'production';
export const dataDir = path.resolve(env.DATA_DIR ?? path.join(here, '..', 'data'));
fs.mkdirSync(dataDir, { recursive: true });

export const cfg = {
  port: Number(env.PORT ?? 3001),
  host: env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
  dbPath: env.DB_PATH ?? path.join(dataDir, 'trains.db'),
  /** public address, used in emails, e.g. https://trains.hymemory.xyz */
  publicUrl: (env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 3001}`).replace(/\/$/, ''),
  /** demo installation: demo logins + fake bookings. Off in production unless asked for. */
  demo: bool(env.DEMO, !production),
  /** how many days ahead departures are generated */
  scheduleDays: Number(env.SCHEDULE_DAYS ?? 60),
  /** proxy hops in front of the app (Caddy, Cloudflare Tunnel, nginx) */
  trustProxy: Number(env.TRUST_PROXY ?? (production ? 1 : 0)),
  backupDir: env.BACKUP_DIR ?? path.join(dataDir, 'backups'),
  backupKeep: Number(env.BACKUP_KEEP ?? 14),
  /** SMTP for confirmation emails, e.g. smtps://user:pass@mail.example.com:465 */
  smtpUrl: env.SMTP_URL ?? '',
  mailFrom: env.MAIL_FROM ?? 'Râșnov Trains <no-reply@localhost>',
  adminPassword: env.ADMIN_PASSWORD ?? '',
};

/**
 * Secret used to sign tickets and staff sessions. Taken from TICKET_SECRET, otherwise
 * generated once and stored in the data folder, so it survives restarts and updates.
 */
export function loadSecret(): string {
  if (env.TICKET_SECRET) return env.TICKET_SECRET;
  const file = path.join(dataDir, 'secret.key');
  if (!fs.existsSync(file)) fs.writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8').trim();
}
