/**
 * Tiny database facade. The booking logic only talks to these functions, so the
 * same code runs on Node (node:sqlite) and in the browser (sql.js / WebAssembly).
 */
export interface RunResult { changes: number; lastInsertRowid: number }
export interface Driver {
  all(sql: string, params: unknown[]): any[];
  get(sql: string, params: unknown[]): any;
  run(sql: string, params: unknown[]): RunResult;
  exec(sql: string): void;
}

let driver: Driver | null = null;
export function setDriver(d: Driver) { driver = d; }
function d(): Driver {
  if (!driver) throw new Error('Database driver not initialised');
  return driver;
}

export const all = <T = any>(sql: string, ...p: unknown[]) => d().all(sql, p) as T[];
export const get = <T = any>(sql: string, ...p: unknown[]) => (d().get(sql, p) ?? undefined) as T | undefined;
export const run = (sql: string, ...p: unknown[]) => d().run(sql, p);
export const exec = (sql: string) => d().exec(sql);

export function tx<T>(fn: () => T): T {
  exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    exec('COMMIT');
    return r;
  } catch (e) {
    exec('ROLLBACK');
    throw e;
  }
}

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
CREATE INDEX IF NOT EXISTS tickets_trip ON tickets(trip_id);
CREATE TABLE IF NOT EXISTS blocked (
  trip_id INTEGER NOT NULL, seat_key TEXT NOT NULL, reason TEXT DEFAULT '', PRIMARY KEY (trip_id, seat_key)
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL, name TEXT NOT NULL
);
`;
export const initSchema = () => exec(SCHEMA);
