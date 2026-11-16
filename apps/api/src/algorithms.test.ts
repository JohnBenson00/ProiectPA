/** Tests for the booking algorithms. Run: npm test (uses a throwaway database). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(os.tmpdir(), `trains-test-${process.pid}.db`);
const { seed } = await import('./seed.js');
const { autoPick, trainSeats, trainWagons, planReseat } = await import('./seats.js');
const { makeToken, readToken, all } = await import('./db.js');
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
