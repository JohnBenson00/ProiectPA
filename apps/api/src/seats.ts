import { all, get } from './db.js';
import { LAYOUTS, bookableCells, capacity, type Cell, type Layout } from './layouts.js';

export const HOLD_MINUTES = 10;

export const seatKey = (wagonId: number, label: string) => `${wagonId}:${label}`;

export interface WagonRow { id: number; layout: string; name: string; amenities: string; description: string; position: number }

export function trainWagons(trainId: number) {
  const rows = all<WagonRow>(
    `SELECT w.*, tw.position FROM train_wagons tw JOIN wagons w ON w.id = tw.wagon_id WHERE tw.train_id = ? ORDER BY tw.position`,
    trainId,
  );
  return rows.map((w, i) => {
    const layout = LAYOUTS[w.layout];
    return {
      id: w.id,
      number: i + 1,
      name: w.name,
      layout: w.layout,
      kind: layout.kind,
      classLabel: layout.classLabel,
      bookable: layout.bookable,
      capacity: capacity(layout),
      amenities: JSON.parse(w.amenities) as string[],
      description: w.description || layout.description,
    };
  });
}
export type TrainWagon = ReturnType<typeof trainWagons>[number];

export function trainCapacity(trainId: number) {
  return trainWagons(trainId).reduce((s, w) => s + w.capacity, 0);
}

/** Every bookable seat of a train, with its wagon and layout info. */
export function trainSeats(trainId: number) {
  const out: Array<{ key: string; wagonId: number; wagonNumber: number; layout: Layout; cell: Cell; group: string }> = [];
  for (const w of trainWagons(trainId)) {
    const layout = LAYOUTS[w.layout];
    for (const cell of bookableCells(layout)) {
      out.push({ key: seatKey(w.id, cell.label!), wagonId: w.id, wagonNumber: w.number, layout, cell, group: `${w.id}/${cell.group ?? cell.label}` });
    }
  }
  return out;
}

export function availability(tripId: number, session?: string) {
  const now = Date.now();
  const sold = all<{ seat_key: string; status: string }>(`SELECT seat_key, status FROM tickets WHERE trip_id = ? AND status != 'CANCELLED'`, tripId);
  const holds = all<{ seat_key: string; session: string; expires_at: number }>(`SELECT * FROM holds WHERE trip_id = ? AND expires_at > ?`, tripId, now);
  const blocked = all<{ seat_key: string }>(`SELECT seat_key FROM blocked WHERE trip_id = ?`, tripId);
  const mine = holds.filter((h) => session && h.session === session);
  return {
    sold: sold.map((s) => s.seat_key),
    used: sold.filter((s) => s.status === 'USED').map((s) => s.seat_key),
    held: holds.filter((h) => !session || h.session !== session).map((h) => h.seat_key),
    mine: mine.map((h) => h.seat_key),
    blocked: blocked.map((b) => b.seat_key),
    expiresAt: mine.length ? Math.min(...mine.map((h) => h.expires_at)) : null,
  };
}

export function unavailableSet(tripId: number, session?: string) {
  const a = availability(tripId, session);
  return new Set([...a.sold, ...a.held, ...a.blocked]);
}

export function freeCount(tripId: number, trainId: number) {
  const cap = trainCapacity(trainId);
  const taken = get<{ c: number }>(`SELECT COUNT(*) c FROM tickets WHERE trip_id = ? AND status != 'CANCELLED'`, tripId)!.c;
  const blocked = get<{ c: number }>(`SELECT COUNT(*) c FROM blocked WHERE trip_id = ?`, tripId)!.c;
  return { capacity: cap, free: Math.max(0, cap - taken - blocked), sold: taken };
}

// ---------------------------------------------------------------------------
// Auto-pick algorithm: find the best N seats that keep the party together.
// ---------------------------------------------------------------------------

export const PREFS = ['WINDOW', 'AISLE', 'FORWARD', 'TABLE', 'QUIET', 'ACCESSIBLE', 'BERTH_LOWER', 'BERTH_UPPER', 'PANORAMIC', 'FAMILY', 'COMPARTMENT', 'NEAR_DINING'] as const;

type Seat = ReturnType<typeof trainSeats>[number];

export interface PickResult { seatKeys: string[]; score: number; reasons: string[]; wagonNumber: number }

export function autoPick(trainId: number, free: Set<string> | ((key: string) => boolean), count: number, prefs: string[], onlyWagonId?: number): PickResult | null {
  if (count < 1) return null;
  const isFree = typeof free === 'function' ? free : (k: string) => free.has(k);
  const wagons = trainWagons(trainId);
  const diningPositions = wagons.filter((w) => w.kind === 'DINING').map((w) => w.number);
  const seats = trainSeats(trainId).filter((s) => !onlyWagonId || s.wagonId === onlyWagonId);

  const prefScore = (s: Seat) => {
    let sc = 0;
    for (const p of prefs) {
      if (p === 'NEAR_DINING') {
        const d = Math.min(...diningPositions.map((n) => Math.abs(n - s.wagonNumber)), 99);
        sc += d <= 1 ? 4 : 0;
      } else if (s.cell.attrs?.includes(p)) sc += 4; // a wish outweighs the orphan-seat penalty
    }
    // accessible spaces are only proposed when explicitly asked for
    if (!prefs.includes('ACCESSIBLE') && s.cell.type === 'WHEELCHAIR') sc -= 50;
    return sc;
  };

  // wagon load factor (spread passengers over the train)
  const load = new Map<number, number>();
  for (const w of wagons) {
    const ws = seats.filter((s) => s.wagonId === w.id);
    if (ws.length) load.set(w.id, ws.filter((s) => !isFree(s.key)).length / ws.length);
  }

  // groups in physical order within each wagon
  const groupsByWagon = new Map<number, Map<string, Seat[]>>();
  for (const s of seats) {
    if (!groupsByWagon.has(s.wagonId)) groupsByWagon.set(s.wagonId, new Map());
    const g = groupsByWagon.get(s.wagonId)!;
    if (!g.has(s.group)) g.set(s.group, []);
    g.get(s.group)!.push(s);
  }

  let best = null as PickResult | null;
  const consider = (picked: Seat[], groupsUsed: number, groupFreeAfter: number[]) => {
    const reasons: string[] = [];
    let score = 0;
    if (groupsUsed === 1) { score += 12; reasons.push(count > 1 ? 'together' : 'single'); }
    else score -= 4 * (groupsUsed - 1);
    const rows = new Set(picked.map((p) => p.cell.x.toFixed(2)));
    if (count > 1 && rows.size === 1) { score += 4; reasons.push('same row'); }
    score += picked.reduce((s, p) => s + prefScore(p), 0);
    // avoid leaving a single orphan seat in a group
    score -= 3 * groupFreeAfter.filter((n) => n === 1).length;
    score += (1 - (load.get(picked[0].wagonId) ?? 0)) * 3;
    const matched = prefs.filter((p) => picked.every((s) => p === 'NEAR_DINING' ? prefScore(s) > 0 : s.cell.attrs?.includes(p)));
    reasons.push(...matched);
    // deterministic tie-break: earlier wagons / lower numbers
    score -= picked[0].wagonNumber * 0.01;
    if (!best || score > best.score) best = { seatKeys: picked.map((p) => p.key), score, reasons, wagonNumber: picked[0].wagonNumber };
  };

  const bestN = (cands: Seat[], n: number) =>
    [...cands]
      .sort((a, b) => prefScore(b) - prefScore(a) || a.cell.x - b.cell.x || a.cell.y - b.cell.y)
      .slice(0, n);

  for (const [, groups] of groupsByWagon) {
    const list = [...groups.values()].map((g) => g.filter((s) => isFree(s.key)));
    // sliding window over consecutive groups (1 group, then 2 neighbouring groups, ...)
    for (let size = 1; size <= Math.min(list.length, 6); size++) {
      for (let i = 0; i + size <= list.length; i++) {
        const window = list.slice(i, i + size);
        const cands = window.flat();
        if (cands.length < count) continue;
        if (size > 1 && window.slice(0, -1).some((g) => g.length === 0)) continue;
        const picked = bestN(cands, count);
        const used = window.filter((g) => g.some((s) => picked.includes(s)));
        if (used.length < size) continue; // a smaller window already covers this
        consider(picked, used.length, window.map((g) => g.filter((s) => !picked.includes(s)).length));
      }
    }
  }
  if (best) return best;

  // fallback: the train is fragmented, take the best free seats anywhere
  const free2 = seats.filter((s) => isFree(s.key));
  if (free2.length < count) return null;
  const picked = bestN(free2, count);
  return { seatKeys: picked.map((p) => p.key), score: 0, reasons: ['split'], wagonNumber: picked[0].wagonNumber };
}

// ---------------------------------------------------------------------------
// Re-seating algorithm: when a trip changes train, move existing tickets to the
// most similar free seats in the new composition, keeping bookings together.
// ---------------------------------------------------------------------------
export function planReseat(tripId: number, newTrainId: number) {
  const tickets = all<{ id: number; booking_id: number; seat_key: string; wagon_id: number; seat_label: string }>(
    `SELECT id, booking_id, seat_key, wagon_id, seat_label FROM tickets WHERE trip_id = ? AND status != 'CANCELLED' ORDER BY booking_id, id`, tripId);
  const newSeats = trainSeats(newTrainId);
  const byKey = new Map(newSeats.map((s) => [s.key, s]));
  const oldLayoutOf = (wagonId: number) => {
    const w = get<{ layout: string }>(`SELECT layout FROM wagons WHERE id = ?`, wagonId);
    return w ? LAYOUTS[w.layout] : undefined;
  };
  const taken = new Set<string>();
  const keep: number[] = [];
  // tickets whose seat still exists stay where they are
  for (const t of tickets) if (byKey.has(t.seat_key)) { taken.add(t.seat_key); keep.push(t.id); }
  const moves: Array<{ ticketId: number; from: string; to: string | null; wagonId?: number; label?: string }> = [];
  const bookingWagon = new Map<number, number>();
  for (const t of tickets) {
    if (keep.includes(t.id)) continue;
    const oldLayout = oldLayoutOf(t.wagon_id);
    const oldCell = oldLayout?.cells.find((c) => c.label === t.seat_label);
    let bestSeat: (typeof newSeats)[number] | null = null;
    let bestScore = -Infinity;
    for (const s of newSeats) {
      if (taken.has(s.key)) continue;
      let sc = 0;
      if (oldLayout && s.layout.kind === oldLayout.kind) sc += 6;
      if (oldLayout && s.layout.classLabel === oldLayout.classLabel) sc += 3;
      if (s.cell.label === t.seat_label) sc += 2;
      for (const a of oldCell?.attrs ?? []) if (s.cell.attrs?.includes(a)) sc += 1;
      if (bookingWagon.get(t.booking_id) === s.wagonId) sc += 5;
      if (sc > bestScore) { bestScore = sc; bestSeat = s; }
    }
    if (bestSeat) {
      taken.add(bestSeat.key);
      bookingWagon.set(t.booking_id, bestSeat.wagonId);
      moves.push({ ticketId: t.id, from: t.seat_key, to: bestSeat.key, wagonId: bestSeat.wagonId, label: bestSeat.cell.label });
    } else moves.push({ ticketId: t.id, from: t.seat_key, to: null });
  }
  return { kept: keep.length, moves, unplaced: moves.filter((m) => !m.to).length };
}
