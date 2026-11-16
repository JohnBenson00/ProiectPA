/**
 * The booking API as a plain route table. It has no dependency on Express or Node,
 * so the same handlers run in the Node server and, for the static demo, in the browser.
 */
import { all, get, run, tx } from './sql.js';
import { nowLocal, todayLocal, addDays, checkPassword, makeToken, readToken, bookingCode, PASSENGER_TYPES } from './util.js';
import { LAYOUTS } from './layouts.js';
import { HOLD_MINUTES, autoPick, availability, freeCount, planReseat, trainSeats, trainWagons, unavailableSet } from './seats.js';

export class HttpError extends Error { constructor(public status: number, message: string, public extra?: object) { super(message); } }

type Role = 'ADMIN' | 'CONDUCTOR';
type Staff = { id: number; role: Role; name: string; exp: number };
export interface ApiRequest {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: any;
  headers: { authorization?: string };
  staff?: Staff;
}
type Handler = (req: ApiRequest) => unknown;
const STAFF: Role[] = ['ADMIN', 'CONDUCTOR'];
const ADMIN: Role[] = ['ADMIN'];
const table: Array<{ method: string; re: RegExp; keys: string[]; roles: Role[] | null; fn: Handler }> = [];
function add(method: string, path: string, roles: Role[] | null, fn: Handler) {
  const keys: string[] = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_m, k: string) => { keys.push(k); return '([^/]+)'; }) + '$');
  table.push({ method, re, keys, roles, fn });
}

/** Dispatch one API call. Returns an HTTP-like status and a JSON-serialisable body. */
export function handle(method: string, path: string, query: Record<string, string | undefined>, body: unknown, authorization?: string): { status: number; body: unknown } {
  try {
    for (const r of table) {
      if (r.method !== method.toUpperCase()) continue;
      const m = r.re.exec(path);
      if (!m) continue;
      const req: ApiRequest = {
        params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])),
        query, body: body ?? {}, headers: { authorization },
      };
      if (r.roles) {
        const s = readToken<Staff>(String(authorization ?? '').replace(/^Bearer /, ''));
        if (!s || s.exp < Date.now()) throw new HttpError(401, 'Please log in');
        if (!r.roles.includes(s.role)) throw new HttpError(403, 'Not allowed for your role');
        req.staff = s;
      }
      return { status: 200, body: r.fn(req) ?? {} };
    }
    throw new HttpError(404, 'Not found');
  } catch (err: any) {
    if (err instanceof HttpError) return { status: err.status, body: { error: err.message, ...err.extra } };
    if (String(err?.message).includes('UNIQUE')) return { status: 409, body: { error: 'That seat was just booked by someone else.' } };
    console.error(err);
    return { status: 500, body: { error: 'Server error' } };
  }
}

type Trip = { id: number; route_id: number; train_id: number; departure: string; status: string };
type Route = { id: number; code: string; name: string; from_station: number; to_station: number; duration_min: number; base_price: number; stops: string; description: string };
type Train = { id: number; code: string; name: string; kind: string; description: string; color: string; locomotive: string };


const routeOut = (r: Route) => ({ ...r, stops: JSON.parse(r.stops) });
const trainOut = (t: Train, withLayouts = false) => {
  const wagons = trainWagons(t.id);
  return {
    ...t,
    wagons: wagons.map((w) => (withLayouts ? { ...w, layoutData: LAYOUTS[w.layout] } : w)),
    capacity: wagons.reduce((s, w) => s + w.capacity, 0),
  };
};
const getTrip = (id: number) => {
  const t = get<Trip>(`SELECT * FROM trips WHERE id = ?`, id);
  if (!t) throw new HttpError(404, 'Trip not found');
  return t;
};
const arrival = (departure: string, minutes: number) => {
  const d = new Date(departure + ':00Z');
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 16);
};
const tripSummary = (t: Trip) => {
  const route = get<Route>(`SELECT * FROM routes WHERE id = ?`, t.route_id)!;
  const train = get<Train>(`SELECT * FROM trains WHERE id = ?`, t.train_id)!;
  const wagons = trainWagons(t.train_id);
  const fc = freeCount(t.id, t.train_id);
  const bookableWagons = wagons.filter((w) => w.bookable);
  const minFactor = Math.min(...bookableWagons.map((w) => LAYOUTS[w.layout].priceFactor));
  return {
    id: t.id, departure: t.departure, arrival: arrival(t.departure, route.duration_min), status: t.status,
    departed: t.departure < nowLocal(),
    route: routeOut(route),
    train: { id: train.id, code: train.code, name: train.name, kind: train.kind, color: train.color },
    wagons: wagons.map((w) => ({ number: w.number, layout: w.layout, kind: w.kind, classLabel: w.classLabel, amenities: w.amenities, bookable: w.bookable })),
    ...fc,
    priceFrom: Math.round(route.base_price * minFactor),
  };
};
const priceOf = (route: Route, layoutCode: string, type: string) => {
  const pt = PASSENGER_TYPES.find((p) => p.code === type);
  if (!pt) throw new HttpError(400, `Unknown passenger type ${type}`);
  return Math.round(route.base_price * LAYOUTS[layoutCode].priceFactor * pt.factor * 100) / 100;
};

// ============================ public API ============================

add('GET', '/api/meta', null, () => ({
  routes: all<Route>(`SELECT * FROM routes ORDER BY id`).map(routeOut),
  passengerTypes: PASSENGER_TYPES,
  layouts: Object.values(LAYOUTS).map(({ cells, ...l }) => l),
  holdMinutes: HOLD_MINUTES,
  today: todayLocal(),
  now: nowLocal(),
}));

add('GET', '/api/calendar', null, (req) => {
  const routeId = Number(req.query.route) || 1;
  const from = String(req.query.from ?? todayLocal());
  const days = Math.min(Number(req.query.days) || 14, 60);
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const trips = all<Trip>(`SELECT * FROM trips WHERE route_id = ? AND substr(departure,1,10) = ? AND status = 'SCHEDULED'`, routeId, date);
    let cap = 0, free = 0;
    for (const t of trips) { const f = freeCount(t.id, t.train_id); cap += f.capacity; free += f.free; }
    out.push({ date, trips: trips.length, capacity: cap, free });
  }
  return out;
});

add('GET', '/api/trips', null, (req) => {
  const date = String(req.query.date ?? todayLocal());
  const routeId = Number(req.query.route) || null;
  const trips = all<Trip>(
    `SELECT * FROM trips WHERE substr(departure,1,10) = ? ${routeId ? 'AND route_id = ?' : ''} ORDER BY departure`,
    ...(routeId ? [date, routeId] : [date]));
  const list = trips.map(tripSummary);
  // "least crowded" suggestion among upcoming trips
  const upcoming = list.filter((t) => !t.departed && t.status === 'SCHEDULED' && t.free > 0);
  const best = upcoming.reduce<(typeof list)[number] | null>((b, t) => (!b || t.free / t.capacity > b.free / b.capacity ? t : b), null);
  return list.map((t) => ({ ...t, leastCrowded: upcoming.length > 1 && best?.id === t.id }));
});

add('GET', '/api/trips/:id', null, (req) => {
  const t = getTrip(Number(req.params.id));
  const route = get<Route>(`SELECT * FROM routes WHERE id = ?`, t.route_id)!;
  const train = get<Train>(`SELECT * FROM trains WHERE id = ?`, t.train_id)!;
  const prices: Record<string, Record<string, number>> = {};
  for (const w of trainWagons(t.train_id)) if (w.bookable) {
    prices[w.layout] = Object.fromEntries(PASSENGER_TYPES.map((p) => [p.code, priceOf(route, w.layout, p.code)]));
  }
  return { ...tripSummary(t), train: trainOut(train, true), prices };
});

add('GET', '/api/trips/:id/availability', null, (req) => availability(Number(req.params.id), String(req.query.session ?? '')));

/** Replace this session's holds on a trip with the given seats. Returns the seats that could not be held. */
add('PUT', '/api/trips/:id/hold', null, (req) => {
  const trip = getTrip(Number(req.params.id));
  const { session, seatKeys } = req.body as { session: string; seatKeys: string[] };
  if (!session || !Array.isArray(seatKeys)) throw new HttpError(400, 'session and seatKeys required');
  if (seatKeys.length > 12) throw new HttpError(400, 'At most 12 seats per booking');
  if (trip.status !== 'SCHEDULED' || trip.departure < nowLocal()) throw new HttpError(409, 'This departure can no longer be booked');
  const valid = new Set(trainSeats(trip.train_id).map((s) => s.key));
  return tx(() => {
    const now = Date.now();
    run(`DELETE FROM holds WHERE expires_at <= ?`, now);
    const prev = get<{ e: number | null }>(`SELECT MIN(expires_at) e FROM holds WHERE trip_id = ? AND session = ?`, trip.id, session)!.e;
    run(`DELETE FROM holds WHERE trip_id = ? AND session = ?`, trip.id, session);
    const taken = unavailableSet(trip.id, session);
    const expiresAt = prev ?? now + HOLD_MINUTES * 60_000;
    const held: string[] = [], conflicts: string[] = [];
    for (const k of seatKeys) {
      if (!valid.has(k) || taken.has(k)) { conflicts.push(k); continue; }
      run(`INSERT INTO holds (trip_id, seat_key, session, expires_at) VALUES (?,?,?,?)`, trip.id, k, session, expiresAt);
      held.push(k);
    }
    return { held, conflicts, expiresAt: held.length ? expiresAt : null };
  });
});

add('POST', '/api/trips/:id/auto-pick', null, (req) => {
  const trip = getTrip(Number(req.params.id));
  const { count, prefs = [], session, wagonId } = req.body as { count: number; prefs: string[]; session: string; wagonId?: number };
  const taken = unavailableSet(trip.id, session);
  const result = autoPick(trip.train_id, (k) => !taken.has(k), Number(count), prefs, wagonId || undefined);
  if (!result) throw new HttpError(409, 'Not enough free seats together for this party');
  return result;
});

add('POST', '/api/bookings', null, (req) => {
  const { session, tripId, seats, contact } = req.body as {
    session: string; tripId: number; seats: Array<{ seatKey: string; type: string }>; contact: { name: string; email: string; phone?: string };
  };
  const trip = getTrip(Number(tripId));
  if (!contact?.name?.trim() || !/^\S+@\S+\.\S+$/.test(contact?.email ?? '')) throw new HttpError(400, 'Name and a valid email are required');
  if (!Array.isArray(seats) || !seats.length) throw new HttpError(400, 'Select at least one seat');
  if (trip.status !== 'SCHEDULED' || trip.departure < nowLocal()) throw new HttpError(409, 'This departure can no longer be booked');
  const route = get<Route>(`SELECT * FROM routes WHERE id = ?`, trip.route_id)!;
  const seatMap = new Map(trainSeats(trip.train_id).map((s) => [s.key, s]));
  return tx(() => {
    const now = Date.now();
    const mine = new Set(all<{ seat_key: string }>(`SELECT seat_key FROM holds WHERE trip_id = ? AND session = ? AND expires_at > ?`, trip.id, session, now).map((r) => r.seat_key));
    const lost = seats.filter((s) => !mine.has(s.seatKey)).map((s) => s.seatKey);
    if (lost.length) throw new HttpError(409, 'Your seat reservation expired or some seats were taken. Please choose again.', { lost });
    const code = bookingCode();
    const lines = seats.map((s) => {
      const seat = seatMap.get(s.seatKey)!;
      return { ...s, seat, price: priceOf(route, seat.layout.code, s.type) };
    });
    const total = Math.round(lines.reduce((sum, l) => sum + l.price, 0) * 100) / 100;
    const b = run(`INSERT INTO bookings (code, trip_id, name, email, phone, total, status, created_at) VALUES (?,?,?,?,?,?, 'PAID', ?)`,
      code, trip.id, contact.name.trim(), contact.email.trim().toLowerCase(), contact.phone ?? '', total, nowLocal());
    for (const l of lines)
      run(`INSERT INTO tickets (booking_id, trip_id, seat_key, wagon_id, seat_label, passenger_type, price) VALUES (?,?,?,?,?,?,?)`,
        Number(b.lastInsertRowid), trip.id, l.seatKey, l.seat.wagonId, l.seat.cell.label!, l.type, l.price);
    run(`DELETE FROM holds WHERE trip_id = ? AND session = ?`, trip.id, session);
    return { code, email: contact.email.trim().toLowerCase(), total };
  });
});

const bookingOut = (code: string, email?: string, staff = false) => {
  const b = get<any>(`SELECT * FROM bookings WHERE code = ?`, code.toUpperCase());
  if (!b || (!staff && b.email !== String(email ?? '').trim().toLowerCase())) throw new HttpError(404, 'Booking not found. Check the code and the email address.');
  const trip = getTrip(b.trip_id);
  const wagons = trainWagons(trip.train_id);
  const tickets = all<any>(`SELECT * FROM tickets WHERE booking_id = ? ORDER BY id`, b.id).map((t) => {
    const w = wagons.find((x) => x.id === t.wagon_id);
    const cell = w ? LAYOUTS[w.layout].cells.find((c) => c.label === t.seat_label) : undefined;
    return {
      id: t.id, seatKey: t.seat_key, seatLabel: t.seat_label, wagonNumber: w?.number ?? null, wagonName: w?.name, wagonId: t.wagon_id,
      seatType: cell?.type, attrs: cell?.attrs ?? [], passengerType: t.passenger_type, price: t.price, status: t.status, scannedAt: t.scanned_at,
      token: makeToken({ t: t.id, r: trip.id }),
    };
  });
  return { code: b.code, name: b.name, email: b.email, phone: b.phone, total: b.total, status: b.status, createdAt: b.created_at, trip: tripSummary(trip), tickets };
};

add('GET', '/api/bookings/:code', null, (req) => bookingOut(String(req.params.code), String(req.query.email ?? '')));

add('POST', '/api/bookings/:code/cancel', null, (req) => {
  const b = bookingOut(String(req.params.code), req.body.email);
  if (b.trip.departed) throw new HttpError(409, 'The train has already departed');
  tx(() => {
    run(`UPDATE bookings SET status = 'CANCELLED' WHERE code = ?`, b.code);
    run(`UPDATE tickets SET status = 'CANCELLED' WHERE booking_id = (SELECT id FROM bookings WHERE code = ?) AND status = 'VALID'`, b.code);
  });
  return bookingOut(b.code, b.email);
});

add('GET', '/api/trains', null, () => all<Train>(`SELECT * FROM trains ORDER BY id`).map((t) => trainOut(t)));
add('GET', '/api/trains/:id', null, (req) => {
  const t = get<Train>(`SELECT * FROM trains WHERE id = ?`, Number(req.params.id));
  if (!t) throw new HttpError(404, 'Train not found');
  const routes = all<Route>(`SELECT DISTINCT r.* FROM routes r JOIN trips t ON t.route_id = r.id WHERE t.train_id = ?`, t.id).map(routeOut);
  return { ...trainOut(t, true), routes };
});

// ============================ staff API ============================


add('POST', '/api/auth/login', null, (req) => {
  const u = get<any>(`SELECT * FROM users WHERE username = ?`, String(req.body.username ?? ''));
  if (!u || !checkPassword(String(req.body.password ?? ''), u.password_hash)) throw new HttpError(401, 'Wrong username or password');
  const user = { id: u.id, role: u.role, name: u.name };
  return { token: makeToken({ ...user, exp: Date.now() + 12 * 3600_000 }), user };
});

add('GET', '/api/admin/trips', STAFF, (req) => {
  const date = String(req.query.date ?? todayLocal());
  return all<Trip>(`SELECT * FROM trips WHERE substr(departure,1,10) = ? ORDER BY departure`, date).map((t) => {
    const used = get<{ c: number }>(`SELECT COUNT(*) c FROM tickets WHERE trip_id = ? AND status = 'USED'`, t.id)!.c;
    return { ...tripSummary(t), boarded: used };
  });
});

add('GET', '/api/admin/stats', STAFF, () => {
  const today = todayLocal();
  const q = (sql: string, ...p: any[]) => get<{ v: number }>(sql, ...p)!.v ?? 0;
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 3)).map((d) => ({
    date: d,
    sold: q(`SELECT COUNT(*) v FROM tickets t JOIN trips r ON r.id = t.trip_id WHERE substr(r.departure,1,10) = ? AND t.status != 'CANCELLED'`, d),
  }));
  return {
    todayTrips: q(`SELECT COUNT(*) v FROM trips WHERE substr(departure,1,10) = ? AND status = 'SCHEDULED'`, today),
    todaySold: days[3].sold,
    todayBoarded: q(`SELECT COUNT(*) v FROM tickets t JOIN trips r ON r.id = t.trip_id WHERE substr(r.departure,1,10) = ? AND t.status = 'USED'`, today),
    revenue30: q(`SELECT SUM(total) v FROM bookings WHERE status = 'PAID' AND created_at >= ?`, addDays(today, -30)),
    days,
  };
});

add('POST', '/api/admin/trips', ADMIN, (req) => {
  const { routeId, trainId, departure } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(departure ?? '')) throw new HttpError(400, 'Departure must be YYYY-MM-DDTHH:MM');
  try {
    const r = run(`INSERT INTO trips (route_id, train_id, departure) VALUES (?,?,?)`, Number(routeId), Number(trainId), departure);
    return { id: Number(r.lastInsertRowid) };
  } catch {
    throw new HttpError(409, 'A trip on this route already departs at that time');
  }
});

/** Generate trips from a recurring rule (days of week + times between two dates). Idempotent. */
add('POST', '/api/admin/schedule', ADMIN, (req) => {
  const { routeId, trainId, from, to, days, times } = req.body as { routeId: number; trainId: number; from: string; to: string; days: number[]; times: string[] };
  if (!from || !to || to < from) throw new HttpError(400, 'Invalid date range');
  if (!times?.length || times.some((t) => !/^\d{2}:\d{2}$/.test(t))) throw new HttpError(400, 'Times must be HH:MM');
  let created = 0, skipped = 0;
  tx(() => {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const dow = new Date(d + 'T12:00:00Z').getUTCDay(); // 0 = Sunday
      if (!days.includes(dow)) continue;
      for (const t of times) {
        const exists = get(`SELECT id FROM trips WHERE route_id = ? AND departure = ? AND status != 'CANCELLED'`, routeId, `${d}T${t}`);
        if (exists) { skipped++; continue; }
        run(`INSERT INTO trips (route_id, train_id, departure) VALUES (?,?,?)`, routeId, trainId, `${d}T${t}`);
        created++;
      }
    }
  });
  return { created, skipped };
});

add('GET', '/api/admin/trips/:id/reseat-preview', ADMIN, (req) => planReseat(Number(req.params.id), Number(req.query.trainId)));

add('PATCH', '/api/admin/trips/:id', ADMIN, (req) => {
  const trip = getTrip(Number(req.params.id));
  const { departure, trainId, status } = req.body;
  return tx(() => {
    let reseat = null;
    if (departure) run(`UPDATE trips SET departure = ? WHERE id = ?`, departure, trip.id);
    if (status) {
      run(`UPDATE trips SET status = ? WHERE id = ?`, status, trip.id);
      if (status === 'CANCELLED') {
        run(`UPDATE tickets SET status = 'CANCELLED' WHERE trip_id = ? AND status = 'VALID'`, trip.id);
        run(`UPDATE bookings SET status = 'CANCELLED' WHERE trip_id = ?`, trip.id);
      }
    }
    if (trainId && Number(trainId) !== trip.train_id) {
      reseat = planReseat(trip.id, Number(trainId));
      if (reseat.unplaced) throw new HttpError(409, `${reseat.unplaced} passengers would not fit in the new train`);
      for (const m of reseat.moves)
        run(`UPDATE tickets SET seat_key = ?, wagon_id = ?, seat_label = ? WHERE id = ?`, m.to, m.wagonId, m.label, m.ticketId);
      run(`DELETE FROM blocked WHERE trip_id = ?`, trip.id);
      run(`UPDATE trips SET train_id = ? WHERE id = ?`, Number(trainId), trip.id);
    }
    return { ok: true, reseat };
  });
});

add('GET', '/api/admin/trips/:id/occupancy', STAFF, (req) => {
  const trip = getTrip(Number(req.params.id));
  const tickets = all<any>(`SELECT t.*, b.code, b.name, b.email, b.phone FROM tickets t JOIN bookings b ON b.id = t.booking_id WHERE t.trip_id = ? AND t.status != 'CANCELLED'`, trip.id);
  const blocked = all<any>(`SELECT * FROM blocked WHERE trip_id = ?`, trip.id);
  return {
    tickets: tickets.map((t) => ({ seatKey: t.seat_key, status: t.status, passengerType: t.passenger_type, code: t.code, name: t.name, email: t.email, phone: t.phone, scannedAt: t.scanned_at, scannedBy: t.scanned_by })),
    blocked: blocked.map((b) => ({ seatKey: b.seat_key, reason: b.reason })),
  };
});

add('POST', '/api/admin/trips/:id/block', ADMIN, (req) => {
  const trip = getTrip(Number(req.params.id));
  const { seatKeys, blocked, reason = '' } = req.body as { seatKeys: string[]; blocked: boolean; reason?: string };
  tx(() => {
    for (const k of seatKeys) {
      if (blocked) {
        if (get(`SELECT id FROM tickets WHERE trip_id = ? AND seat_key = ? AND status != 'CANCELLED'`, trip.id, k)) continue;
        run(`INSERT OR REPLACE INTO blocked (trip_id, seat_key, reason) VALUES (?,?,?)`, trip.id, k, reason);
      } else run(`DELETE FROM blocked WHERE trip_id = ? AND seat_key = ?`, trip.id, k);
    }
  });
  return { ok: true };
});

/** Ticket scanning: accepts a QR token or a booking code. */
add('POST', '/api/admin/scan', STAFF, (req) => {
  const s = req.staff!;
  const input = String(req.body.input ?? '').trim();
  const tripId = req.body.tripId ? Number(req.body.tripId) : null;
  let ticketIds: number[] = [];
  const tok = readToken<{ t: number; r: number }>(input.replace(/^RTT:/, ''));
  if (tok) ticketIds = [tok.t];
  else if (/^[A-Z0-9]{8}$/i.test(input)) {
    ticketIds = all<{ id: number }>(`SELECT t.id FROM tickets t JOIN bookings b ON b.id = t.booking_id WHERE b.code = ?`, input.toUpperCase()).map((r) => r.id);
  }
  if (!ticketIds.length) return { result: 'INVALID', message: 'Not a valid ticket (signature check failed or unknown code).' };

  const results = ticketIds.map((id) => {
    const t = get<any>(`SELECT t.*, b.name, b.code FROM tickets t JOIN bookings b ON b.id = t.booking_id WHERE t.id = ?`, id)!;
    const trip = getTrip(t.trip_id);
    const summary = tripSummary(trip);
    const w = trainWagons(trip.train_id).find((x) => x.id === t.wagon_id);
    const base = {
      name: t.name, code: t.code, seatLabel: t.seat_label, wagonNumber: w?.number, passengerType: t.passenger_type,
      departure: trip.departure, route: summary.route.name, train: summary.train.name,
    };
    if (t.status === 'CANCELLED') return { ...base, result: 'CANCELLED', message: 'This ticket was cancelled.' };
    if (tripId && trip.id !== tripId) return { ...base, result: 'WRONG_TRIP', message: `Ticket is for ${summary.route.code} at ${trip.departure.replace('T', ' ')}.` };
    if (!tripId && trip.departure.slice(0, 10) !== todayLocal()) return { ...base, result: 'WRONG_TRIP', message: `Ticket is for ${trip.departure.replace('T', ' ')}, not today.` };
    // atomic: only one scanner can flip VALID -> USED
    const upd = run(`UPDATE tickets SET status = 'USED', scanned_at = ?, scanned_by = ? WHERE id = ? AND status = 'VALID'`, nowLocal(), s.name, t.id);
    if (Number(upd.changes) === 0) {
      const again = get<any>(`SELECT scanned_at, scanned_by FROM tickets WHERE id = ?`, t.id);
      return { ...base, result: 'USED', message: `Already used at ${String(again.scanned_at).replace('T', ' ')} (${again.scanned_by}).` };
    }
    return { ...base, result: 'OK', message: 'Valid ticket. Have a nice trip!' };
  });
  const worst = ['INVALID', 'CANCELLED', 'USED', 'WRONG_TRIP', 'OK'].find((r) => results.some((x) => x.result === r))!;
  return { result: worst, tickets: results, message: results.length === 1 ? results[0].message : `${results.filter((r) => r.result === 'OK').length}/${results.length} passengers boarded.` };
});

// ---------- fleet ----------
add('PATCH', '/api/admin/trains/:id', ADMIN, (req) => {
  const id = Number(req.params.id);
  const { name, description, color, wagonOrder } = req.body as { name?: string; description?: string; color?: string; wagonOrder?: number[] };
  tx(() => {
    if (name !== undefined) run(`UPDATE trains SET name = ? WHERE id = ?`, name, id);
    if (description !== undefined) run(`UPDATE trains SET description = ? WHERE id = ?`, description, id);
    if (color !== undefined) run(`UPDATE trains SET color = ? WHERE id = ?`, color, id);
    if (wagonOrder) {
      const current = all<{ wagon_id: number }>(`SELECT wagon_id FROM train_wagons WHERE train_id = ?`, id).map((r) => r.wagon_id).sort();
      if (JSON.stringify([...wagonOrder].sort()) !== JSON.stringify(current)) throw new HttpError(400, 'wagonOrder must contain exactly the wagons of this train');
      run(`DELETE FROM train_wagons WHERE train_id = ?`, id);
      wagonOrder.forEach((w, i) => run(`INSERT INTO train_wagons (train_id, wagon_id, position) VALUES (?,?,?)`, id, w, i + 1));
    }
  });
  return trainOut(get<Train>(`SELECT * FROM trains WHERE id = ?`, id)!);
});

add('POST', '/api/admin/trains/:id/wagons', ADMIN, (req) => {
  const id = Number(req.params.id);
  const layout = LAYOUTS[String(req.body.layout)];
  if (!layout) throw new HttpError(400, 'Unknown layout');
  tx(() => {
    const w = run(`INSERT INTO wagons (layout, name, amenities, description) VALUES (?,?,?,?)`, layout.code, layout.name, JSON.stringify(layout.defaultAmenities), '');
    const pos = get<{ p: number }>(`SELECT COALESCE(MAX(position),0) + 1 p FROM train_wagons WHERE train_id = ?`, id)!.p;
    run(`INSERT INTO train_wagons (train_id, wagon_id, position) VALUES (?,?,?)`, id, Number(w.lastInsertRowid), pos);
  });
  return trainOut(get<Train>(`SELECT * FROM trains WHERE id = ?`, id)!);
});

add('DELETE', '/api/admin/trains/:id/wagons/:wagonId', ADMIN, (req) => {
  const id = Number(req.params.id), wagonId = Number(req.params.wagonId);
  const busy = get<{ c: number }>(`SELECT COUNT(*) c FROM tickets t JOIN trips r ON r.id = t.trip_id WHERE t.wagon_id = ? AND t.status = 'VALID' AND r.departure >= ?`, wagonId, nowLocal())!.c;
  if (busy) throw new HttpError(409, `${busy} upcoming tickets are booked in this wagon. Move the passengers first (change the trips' train).`);
  tx(() => {
    run(`DELETE FROM train_wagons WHERE train_id = ? AND wagon_id = ?`, id, wagonId);
    const rest = all<{ wagon_id: number }>(`SELECT wagon_id FROM train_wagons WHERE train_id = ? ORDER BY position`, id);
    run(`DELETE FROM train_wagons WHERE train_id = ?`, id);
    rest.forEach((r, i) => run(`INSERT INTO train_wagons (train_id, wagon_id, position) VALUES (?,?,?)`, id, r.wagon_id, i + 1));
  });
  return trainOut(get<Train>(`SELECT * FROM trains WHERE id = ?`, id)!);
});

add('PATCH', '/api/admin/wagons/:id', ADMIN, (req) => {
  const id = Number(req.params.id);
  const { name, amenities, description } = req.body;
  if (name !== undefined) run(`UPDATE wagons SET name = ? WHERE id = ?`, name, id);
  if (amenities !== undefined) run(`UPDATE wagons SET amenities = ? WHERE id = ?`, JSON.stringify(amenities), id);
  if (description !== undefined) run(`UPDATE wagons SET description = ? WHERE id = ?`, description, id);
  return { ok: true };
});
