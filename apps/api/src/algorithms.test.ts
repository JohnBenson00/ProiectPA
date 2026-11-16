/** Tests for the booking algorithms. Run: npm test (uses a throwaway database). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

import { openDatabase } from './node-db.js';
import { seed } from './core/seed.js';
import { autoPick, trainSeats, trainWagons, planReseat } from './core/seats.js';
import { makeToken, readToken } from './core/util.js';
import { all } from './core/sql.js';
import { handle } from './core/routes.js';

openDatabase(path.join(os.tmpdir(), `trains-test-${process.pid}.db`));
// tests run against a throwaway demo database
seed(true);

test('auto-pick keeps a party of 4 together in one group', () => {
  const r = autoPick(2, () => true, 4, [])!;
  assert.equal(r.seatKeys.length, 4);
  const seats = trainSeats(2).filter((s) => r.seatKeys.includes(s.key));
  assert.equal(new Set(seats.map((s) => s.group)).size, 1);
});

test('auto-pick honours the window preference for a single traveller', () => {
  const r = autoPick(2, () => true, 1, ['WINDOW'])!;
  const seat = trainSeats(2).find((s) => s.key === r.seatKeys[0])!;
  assert.ok(seat.cell.attrs?.includes('WINDOW'));
});

test('auto-pick never returns a taken seat, and returns null when the train is full', () => {
  const all2 = trainSeats(2).map((s) => s.key);
  const free = new Set(all2.slice(0, 5));
  const r = autoPick(2, free, 3, [])!;
  assert.ok(r.seatKeys.every((k) => free.has(k)));
  assert.equal(autoPick(2, new Set(), 1, []), null);
});

test('auto-pick does not propose wheelchair spaces unless asked', () => {
  const r = autoPick(1, () => true, 2, [], trainWagons(1)[2].id)!;
  const types = trainSeats(1).filter((s) => r.seatKeys.includes(s.key)).map((s) => s.cell.type);
  assert.ok(!types.includes('WHEELCHAIR'));
  const r2 = autoPick(1, () => true, 1, ['ACCESSIBLE'], trainWagons(1)[2].id)!;
  assert.ok(trainSeats(1).find((s) => s.key === r2.seatKeys[0])!.cell.attrs!.includes('ACCESSIBLE'));
});

test('every bookable seat label is unique within its wagon', () => {
  for (const id of [1, 2, 3]) {
    const keys = trainSeats(id).map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length);
  }
});

test('ticket tokens are tamper-proof', () => {
  const tok = makeToken({ t: 5, r: 9 });
  assert.deepEqual(readToken(tok), { t: 5, r: 9 });
  assert.equal(readToken(tok.slice(0, -1) + (tok.endsWith('A') ? 'B' : 'A')), null);
  assert.equal(readToken('garbage'), null);
});

test('re-seating moves every passenger when a trip changes train', () => {
  const trip = all<{ id: number }>(`SELECT t.id FROM trips t WHERE t.train_id = 2 AND EXISTS (SELECT 1 FROM tickets k WHERE k.trip_id = t.id) LIMIT 1`)[0];
  const plan = planReseat(trip.id, 3);
  const n = all(`SELECT id FROM tickets WHERE trip_id = ? AND status != 'CANCELLED'`, trip.id).length;
  assert.equal(plan.kept + plan.moves.length, n);
  const targets = plan.moves.map((m) => m.to).filter(Boolean);
  assert.equal(new Set(targets).size, targets.length, 'no two passengers on the same seat');
});

test('API: a seat cannot be held or sold twice', () => {
  const trip = all<{ id: number; departure: string }>(`SELECT id, departure FROM trips WHERE train_id = 2 ORDER BY departure DESC LIMIT 1`)[0];
  const free = trainSeats(2).map((x) => x.key).find((k) => !all(`SELECT 1 FROM tickets WHERE trip_id = ? AND seat_key = ?`, trip.id, k).length)!;
  const a = handle('PUT', `/api/trips/${trip.id}/hold`, {}, { session: 'A', seatKeys: [free] });
  assert.deepEqual((a.body as any).held, [free]);
  const b = handle('PUT', `/api/trips/${trip.id}/hold`, {}, { session: 'B', seatKeys: [free] });
  assert.deepEqual((b.body as any).conflicts, [free]);
  const ok = handle('POST', '/api/bookings', {}, { session: 'A', tripId: trip.id, seats: [{ seatKey: free, type: 'ADULT' }], contact: { name: 'Test', email: 't@example.com' } });
  assert.equal(ok.status, 200);
  const again = handle('POST', '/api/bookings', {}, { session: 'B', tripId: trip.id, seats: [{ seatKey: free, type: 'ADULT' }], contact: { name: 'X', email: 'x@example.com' } });
  assert.equal(again.status, 409);
});

test('API: staff routes require the right role', () => {
  assert.equal(handle('GET', '/api/admin/stats', {}, undefined).status, 401);
  const login = handle('POST', '/api/auth/login', {}, { username: 'conductor', password: 'conductor123' }).body as any;
  assert.equal(handle('GET', '/api/admin/stats', {}, undefined, `Bearer ${login.token}`).status, 200);
  assert.equal(handle('POST', '/api/admin/trips', {}, {}, `Bearer ${login.token}`).status, 403);
});

test('rolling timetable: idempotent, and never re-creates a cancelled departure', async () => {
  const { extendSchedule } = await import('./core/schedule.js');
  const { run: exec } = await import('./core/sql.js');
  const before = all(`SELECT id FROM trips`).length;
  assert.equal(extendSchedule(30), 0, 'running again creates nothing');
  const t = all<{ id: number }>(`SELECT id FROM trips WHERE route_id = 1 ORDER BY departure DESC LIMIT 1`)[0];
  exec(`UPDATE trips SET status = 'CANCELLED' WHERE id = ?`, t.id);
  assert.equal(extendSchedule(30), 0, 'the cancelled slot stays cancelled');
  assert.ok(extendSchedule(40) > 0, 'a longer horizon adds new days');
  assert.ok(all(`SELECT id FROM trips`).length > before);
});

test('staff accounts: create, role change and deletion take effect immediately', () => {
  const admin = (handle('POST', '/api/auth/login', {}, { username: 'admin', password: 'admin123' }).body as any).token;
  const A = `Bearer ${admin}`;
  assert.equal(handle('POST', '/api/admin/users', {}, { username: 'maria', password: 'short', role: 'CONDUCTOR', name: 'Maria' }, A).status, 400);
  const created = handle('POST', '/api/admin/users', {}, { username: 'maria', password: 'long-enough-1', role: 'CONDUCTOR', name: 'Maria' }, A);
  assert.equal(created.status, 200);
  const id = (created.body as any).id;
  const m = `Bearer ${(handle('POST', '/api/auth/login', {}, { username: 'maria', password: 'long-enough-1' }).body as any).token}`;
  assert.equal(handle('GET', '/api/admin/users', {}, undefined, m).status, 403);
  assert.equal(handle('PATCH', `/api/admin/users/${id}`, {}, { role: 'ADMIN' }, A).status, 200);
  assert.equal(handle('GET', '/api/admin/users', {}, undefined, m).status, 200, 'promotion applies to the existing session');
  assert.equal(handle('DELETE', `/api/admin/users/${id}`, {}, undefined, A).status, 200);
  assert.equal(handle('GET', '/api/admin/stats', {}, undefined, m).status, 401, 'deleted account is logged out');
  const me = (handle('GET', '/api/admin/users', {}, undefined, A).body as any[]).find((u) => u.username === 'admin');
  assert.equal(handle('DELETE', `/api/admin/users/${me.id}`, {}, undefined, A).status, 409, 'cannot delete yourself');
});
