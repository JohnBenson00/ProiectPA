/**
 * Production server: API (shared route table) + the built web app, one Node process.
 * Configuration: environment variables, see config.ts and deploy/.env.example.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cfg, loadSecret, production, dataDir } from './config.js';
import { openDatabase } from './node-db.js';
import { seed } from './core/seed.js';
import { handle } from './core/routes.js';
import { get, run } from './core/sql.js';
import { setSecret, hashPassword, todayLocal } from './core/util.js';
import { setConfig, hooks } from './core/runtime.js';
import { extendSchedule } from './core/schedule.js';
import { emailEnabled, sendBookingMail } from './mail.js';
import { backup } from './backup.js';

// ---------- database + first run ----------
setSecret(loadSecret());
const db = openDatabase(cfg.dbPath);
setConfig({ demo: cfg.demo, emailEnabled, scheduleDays: cfg.scheduleDays });
seed(false, { demoUsers: cfg.demo, demoBookings: cfg.demo, days: cfg.scheduleDays });

if (!get(`SELECT id FROM users LIMIT 1`)) {
  // real installation: one administrator with a strong password, no public demo accounts
  const password = cfg.adminPassword || Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  run(`INSERT INTO users (username, password_hash, role, name) VALUES (?,?,?,?)`, 'admin', hashPassword(password), 'ADMIN', 'Administrator');
  if (!cfg.adminPassword) {
    const file = path.join(dataDir, 'initial-admin-password.txt');
    fs.writeFileSync(file, `username: admin\npassword: ${password}\n`, { mode: 0o600 });
    console.log(`\n  First start: created user "admin" with password ${password}\n  (also saved in ${file}; change it after logging in)\n`);
  }
}

hooks.bookingCreated = (code) => sendBookingMail(code, 'created');
hooks.bookingCancelled = (code) => sendBookingMail(code, 'cancelled');

// ---------- background jobs ----------
const jobs = () => {
  try {
    const n = extendSchedule(cfg.scheduleDays);
    if (n) console.log(`[schedule] generated ${n} departures`);
    run(`DELETE FROM holds WHERE expires_at <= ?`, Date.now());
    backup(db, `trains-${todayLocal()}.db`, cfg.backupDir, cfg.backupKeep, true);
  } catch (e) { console.error('[jobs]', e); }
};
jobs();
const jobTimer = setInterval(jobs, 60 * 60_000);

// ---------- http ----------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', cfg.trustProxy);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob:", "media-src 'self' blob:",
    "connect-src 'self'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
  ].join('; '));
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});

/** Fixed-window rate limit per client IP and bucket. */
function limit(bucket: string, max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${bucket}:${req.ip}`;
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++h.n > max) {
      res.setHeader('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    }
    next();
  };
}
app.use('/api', limit('api', 600, 60_000));
app.post('/api/auth/login', limit('login', 10, 10 * 60_000));
app.post('/api/admin/me/password', limit('password', 10, 10 * 60_000));
app.post('/api/bookings', limit('booking', 20, 10 * 60_000));
app.put('/api/trips/:id/hold', limit('hold', 120, 60_000));

app.use(express.json({ limit: '100kb' }));
app.all('/api/*', (req, res) => {
  const t0 = Date.now();
  const r = handle(req.method, req.path, req.query as Record<string, string>, req.body, req.headers.authorization);
  res.setHeader('Cache-Control', 'no-store');
  res.status(r.status).json(r.body);
  if (req.method !== 'GET' || r.status >= 500) console.log(`${req.method} ${req.path} ${r.status} ${Date.now() - t0}ms`);
});

const webDist = process.env.WEB_DIST ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  // hashed assets never change; index.html must always be fresh
  app.use('/assets', express.static(path.join(webDist, 'assets'), { immutable: true, maxAge: '365d', fallthrough: false }));
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(webDist, 'index.html')); });
} else if (production) {
  console.warn(`Web app not found at ${webDist} – run "npm run build" first.`);
}

const server = app.listen(cfg.port, cfg.host, () => {
  console.log(`Râșnov Trains on http://${cfg.host}:${cfg.port} (${production ? 'production' : 'development'}${cfg.demo ? ', demo data' : ''}${emailEnabled ? ', email on' : ', email off'})`);
  console.log(`Public URL: ${cfg.publicUrl} · data: ${dataDir}`);
});

function shutdown(sig: string) {
  console.log(`${sig}: shutting down`);
  clearInterval(jobTimer);
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
