import { SCHEMA, exec, tx, run, get, all } from './sql.js';
import { hashPassword, todayLocal, addDays, bookingCode, PASSENGER_TYPES } from './util.js';
import { LAYOUTS } from './layouts.js';
import { trainSeats } from './seats.js';
import { addRule, extendSchedule } from './schedule.js';

export interface SeedOptions {
  /** demo accounts admin/admin123 and conductor/conductor123 */
  demoUsers?: boolean;
  /** fake bookings so seat maps look busy */
  demoBookings?: boolean;
  /** days of departures to generate */
  days?: number;
}

export function seed(reset = false, opts: SeedOptions = {}) {
  const { demoUsers = true, demoBookings = true, days = 30 } = opts;
  if (reset) {
    exec(`DROP TABLE IF EXISTS tickets; DROP TABLE IF EXISTS bookings; DROP TABLE IF EXISTS holds; DROP TABLE IF EXISTS blocked;
      DROP TABLE IF EXISTS trips; DROP TABLE IF EXISTS train_wagons; DROP TABLE IF EXISTS wagons; DROP TABLE IF EXISTS trains;
      DROP TABLE IF EXISTS routes; DROP TABLE IF EXISTS stations; DROP TABLE IF EXISTS users;`);
    exec(SCHEMA);
  }
  if (get(`SELECT id FROM stations LIMIT 1`)) return false;

  tx(() => {
    const stations = ['Valea Cetății (Râșnov)', 'Cetatea Râșnov', 'Brașov', 'Cristian', 'Bran', 'Constanța'];
    stations.forEach((s, i) => run(`INSERT INTO stations (id, name) VALUES (?, ?)`, i + 1, s));

    const routes: Array<[string, string, number, number, number, number, Array<[string, number]>, string]> = [
      ['T1', 'Valea Cetății → Cetatea Râșnov', 1, 2, 12, 15, [['Valea Cetății', 0], ['Cetatea Râșnov', 12]], 'Panoramic shuttle up to the citadel.'],
      ['T2', 'Cetatea Râșnov → Valea Cetății', 2, 1, 12, 15, [['Cetatea Râșnov', 0], ['Valea Cetății', 12]], 'Panoramic shuttle back down to the valley.'],
      ['IR 1741', 'Brașov → Râșnov → Bran', 3, 5, 55, 25, [['Brașov', 0], ['Cristian', 18], ['Valea Cetății (Râșnov)', 30], ['Bran', 55]], 'InterRegio through the Bârsa land.'],
      ['IR 1742', 'Bran → Râșnov → Brașov', 5, 3, 55, 25, [['Bran', 0], ['Valea Cetății (Râșnov)', 25], ['Cristian', 37], ['Brașov', 55]], 'InterRegio back to Brașov.'],
      ['N 471', 'Râșnov → Constanța', 1, 6, 510, 90, [['Valea Cetății (Râșnov)', 0], ['Brașov', 30], ['București Nord', 200], ['Constanța', 510]], 'Overnight train to the seaside, with sleeping cars.'],
    ];
    routes.forEach((r, i) =>
      run(`INSERT INTO routes (id, code, name, from_station, to_station, duration_min, base_price, stops, description) VALUES (?,?,?,?,?,?,?,?,?)`,
        i + 1, r[0], r[1], r[2], r[3], r[4], r[5], JSON.stringify(r[6].map(([name, min]) => ({ name, min }))), r[7]));

    const trains: Array<[string, string, string, string, string, string, string[]]> = [
      ['TR-01', 'Cetățuia', 'Panoramic shuttle', 'Our panoramic tourist train that climbs from the valley to the Râșnov citadel. Glass roof, audio guide in 4 languages.', '#b45309', 'Diesel tourist locomotive "Bârsa"', ['PN', 'PN', 'MP']],
      ['IR-17', 'Expresul Bârsei', 'InterRegio', 'Comfortable regional train with 1st class compartments, a quiet saloon and a restaurant car.', '#1d4ed8', 'Electric locomotive EA 060', ['C1', 'S2', 'S2Q', 'WR', 'S2', 'MP']],
      ['N-47', 'Dacia Night Express', 'Night train', 'Overnight train with sleeping cars and couchettes. Breakfast served in the morning.', '#6d28d9', 'Electric locomotive EA 475', ['WL', 'WL', 'CU', 'CU', 'WR', 'S2']],
    ];
    let wagonId = 1;
    trains.forEach(([code, name, kind, desc, color, loco, layouts], i) => {
      const trainId = i + 1;
      run(`INSERT INTO trains (id, code, name, kind, description, color, locomotive) VALUES (?,?,?,?,?,?,?)`, trainId, code, name, kind, desc, color, loco);
      layouts.forEach((l, pos) => {
        const L = LAYOUTS[l];
        run(`INSERT INTO wagons (id, layout, name, amenities, description) VALUES (?,?,?,?,?)`, wagonId, l, L.name, JSON.stringify(L.defaultAmenities), '');
        run(`INSERT INTO train_wagons (train_id, wagon_id, position) VALUES (?,?,?)`, trainId, wagonId, pos + 1);
        wagonId++;
      });
    });

    if (demoUsers) {
      run(`INSERT INTO users (username, password_hash, role, name) VALUES (?,?,?,?)`, 'admin', hashPassword('admin123'), 'ADMIN', 'Administrator');
      run(`INSERT INTO users (username, password_hash, role, name) VALUES (?,?,?,?)`, 'conductor', hashPassword('conductor123'), 'CONDUCTOR', 'Ion Conductor');
    }

    // timetable: recurring rules, expanded into departures below
    const today = todayLocal();
    const schedule: Array<[number, number, string[]]> = [
      [1, 1, ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']],
      [2, 1, ['10:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30', '17:30', '18:30']],
      [3, 2, ['08:15', '12:15', '16:15']],
      [4, 2, ['10:20', '14:20', '18:20']],
      [5, 3, ['22:10']],
    ];
    for (const [routeId, trainId, times] of schedule) addRule(routeId, trainId, [0, 1, 2, 3, 4, 5, 6], times, addDays(today, -1), null);
  });
  extendSchedule(days, addDays(todayLocal(), -1));
  if (!demoBookings) return true;

  // demo bookings so the seat maps look realistic (deterministic pseudo-random)
  let s = 42;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const names = ['Ana Popescu', 'Mihai Ionescu', 'Elena Dumitru', 'Andrei Stan', 'Ioana Marin', 'Radu Georgescu', 'Maria Tudor', 'Lukas Weber', 'Emma Smith', 'Kovács Péter'];
  const trips = all<{ id: number; train_id: number; departure: string }>(`SELECT id, train_id, departure FROM trips WHERE departure < ?`, addDays(todayLocal(), 15));
  const seatCache = new Map<number, ReturnType<typeof trainSeats>>();
  tx(() => {
    const insB = { run: (...p: unknown[]) => run(`INSERT INTO bookings (code, trip_id, name, email, phone, total, status, created_at) VALUES (?,?,?,?,?,?, 'PAID', ?)`, ...p) };
    const insT = { run: (...p: unknown[]) => run(`INSERT INTO tickets (booking_id, trip_id, seat_key, wagon_id, seat_label, passenger_type, price, status) VALUES (?,?,?,?,?,?,?, 'VALID')`, ...p) };
    for (const trip of trips) {
      if (!seatCache.has(trip.train_id)) seatCache.set(trip.train_id, trainSeats(trip.train_id));
      const seats = seatCache.get(trip.train_id)!;
      const daysAhead = (Date.parse(trip.departure.slice(0, 10)) - Date.parse(todayLocal())) / 86400000;
      const fill = Math.max(0.05, 0.75 - daysAhead * 0.05) * (0.5 + rnd());
      // book whole groups to look natural
      const groups = new Map<string, typeof seats>();
      for (const st of seats) { if (!groups.has(st.group)) groups.set(st.group, []); groups.get(st.group)!.push(st); }
      for (const g of groups.values()) {
        if (rnd() > fill) continue;
        const n = Math.min(g.length, 1 + Math.floor(rnd() * g.length));
        const name = names[Math.floor(rnd() * names.length)];
        const b = insB.run(bookingCode(), trip.id, name, name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com', '', 0, trip.departure.slice(0, 10));
        for (const st of g.slice(0, n)) {
          const pt = PASSENGER_TYPES[rnd() < 0.7 ? 0 : 1 + Math.floor(rnd() * 3)];
          insT.run(Number(b.lastInsertRowid), trip.id, st.key, st.wagonId, st.cell.label!, pt.code, 0);
        }
      }
    }
  });
  return true;
}

