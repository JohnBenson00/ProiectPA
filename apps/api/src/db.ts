import { DatabaseSync } from 'node:sqlite';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.DB_PATH ?? path.join(here, '..', 'trains.db');
export const SECRET = process.env.TICKET_SECRET ?? 'dev-secret-change-me';

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS stations (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL,
  from_station INTEGER NOT NULL REFERENCES stations(id), to_station INTEGER NOT NULL REFERENCES stations(id),
  duration_min INTEGER NOT NULL, base_price REAL NOT NULL, stops TEXT NOT NULL DEFAULT '[]', description TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS trains (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,
  description TEXT DEFAULT '', color TEXT DEFAULT '#1d4ed8', locomotive TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS wagons (
  id INTEGER PRIMARY KEY, layout TEXT NOT NULL, name TEXT NOT NULL, amenities TEXT NOT NULL DEFAULT '[]', description TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS train_wagons (
  train_id INTEGER NOT NULL REFERENCES trains(id), wagon_id INTEGER NOT NULL UNIQUE REFERENCES wagons(id), position INTEGER NOT NULL,
  PRIMARY KEY (train_id, position)
);
CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY, route_id INTEGER NOT NULL REFERENCES routes(id), train_id INTEGER NOT NULL REFERENCES trains(id),
  departure TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'SCHEDULED'
);
CREATE INDEX IF NOT EXISTS trips_departure ON trips(departure);
CREATE UNIQUE INDEX IF NOT EXISTS trips_unique ON trips(route_id, departure) WHERE status != 'CANCELLED';
CREATE TABLE IF NOT EXISTS holds (
  trip_id INTEGER NOT NULL, seat_key TEXT NOT NULL, session TEXT NOT NULL, expires_at INTEGER NOT NULL,
  PRIMARY KEY (trip_id, seat_key)
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, trip_id INTEGER NOT NULL REFERENCES trips(id),
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT DEFAULT '', total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'PAID', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY, booking_id INTEGER NOT NULL REFERENCES bookings(id), trip_id INTEGER NOT NULL REFERENCES trips(id),
  seat_key TEXT NOT NULL, wagon_id INTEGER NOT NULL, seat_label TEXT NOT NULL, passenger_type TEXT NOT NULL,
  price REAL NOT NULL, status TEXT NOT NULL DEFAULT 'VALID', scanned_at TEXT, scanned_by TEXT
);
-- the guarantee against double booking: one active ticket per seat per trip
CREATE UNIQUE INDEX IF NOT EXISTS tickets_seat ON tickets(trip_id, seat_key) WHERE status != 'CANCELLED';
CREATE INDEX IF NOT EXISTS tickets_booking ON tickets(booking_id);
CREATE TABLE IF NOT EXISTS blocked (
  trip_id INTEGER NOT NULL, seat_key TEXT NOT NULL, reason TEXT DEFAULT '', PRIMARY KEY (trip_id, seat_key)
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL, name TEXT NOT NULL
);
`;
db.exec(SCHEMA);

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const all = <T = any>(sql: string, ...p: any[]) => db.prepare(sql).all(...p) as T[];
export const get = <T = any>(sql: string, ...p: any[]) => db.prepare(sql).get(...p) as T | undefined;
export const run = (sql: string, ...p: any[]) => db.prepare(sql).run(...p);

/** Current local time in Romania as 'YYYY-MM-DDTHH:MM'. Departures are stored in local time. */
export function nowLocal(): string {
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
  return s.replace(' ', 'T');
}
export const todayLocal = () => nowLocal().slice(0, 10);

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- passwords ----------
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;
}
export function checkPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const h = scryptSync(pw, salt, 32);
  return timingSafeEqual(h, Buffer.from(hash, 'hex'));
}

// ---------- signed tokens (tickets + staff sessions) ----------
const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sign = (payload: string) => createHmac('sha256', SECRET).update(payload).digest('base64url').slice(0, 22);

export function makeToken(data: object): string {
  const p = b64(JSON.stringify(data));
  return `${p}.${sign(p)}`;
}
export function readToken<T>(token: string): T | null {
  const [p, s] = token.trim().split('.');
  if (!p || !s) return null;
  const expected = sign(p);
  if (expected.length !== s.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;
  try {
    return JSON.parse(Buffer.from(p, 'base64url').toString()) as T;
  } catch {
    return null;
  }
}

export function bookingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export const PASSENGER_TYPES = [
  { code: 'ADULT', label: 'Adult', factor: 1 },
  { code: 'CHILD', label: 'Child (6-14)', factor: 0.5 },
  { code: 'STUDENT', label: 'Student', factor: 0.5 },
  { code: 'SENIOR', label: 'Senior (65+)', factor: 0.7 },
];
