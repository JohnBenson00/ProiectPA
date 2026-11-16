/**
 * Rolling timetable: recurring rules ("route 3, daily, 08:15 and 12:15") are expanded
 * into concrete departures a few weeks ahead. The server runs this every hour, so the
 * timetable never runs out. Each generated slot is remembered, so a departure the staff
 * cancelled or moved is never re-created.
 */
import { all, run, tx, get } from './sql.js';
import { addDays, todayLocal } from './util.js';

export interface ScheduleRule {
  id: number; route_id: number; train_id: number; days: string; times: string; valid_from: string; valid_to: string | null;
}

export function addRule(routeId: number, trainId: number, days: number[], times: string[], from: string, to: string | null) {
  const r = run(`INSERT INTO schedule_rules (route_id, train_id, days, times, valid_from, valid_to, created_at) VALUES (?,?,?,?,?,?,?)`,
    routeId, trainId, JSON.stringify(days), JSON.stringify(times), from, to, todayLocal());
  return r.lastInsertRowid;
}

/** Create the departures of every active rule from `from` until `days` days ahead. Idempotent. */
export function extendSchedule(days = 60, from = addDays(todayLocal(), -1)) {
  const until = addDays(todayLocal(), days);
  const rules = all<ScheduleRule>(`SELECT * FROM schedule_rules WHERE valid_to IS NULL OR valid_to >= ?`, from);
  let created = 0;
  tx(() => {
    for (const rule of rules) {
      const dows: number[] = JSON.parse(rule.days);
      const times: string[] = JSON.parse(rule.times);
      const start = rule.valid_from > from ? rule.valid_from : from;
      const end = rule.valid_to && rule.valid_to < until ? rule.valid_to : until;
      for (let d = start; d <= end; d = addDays(d, 1)) {
        if (!dows.includes(new Date(d + 'T12:00:00Z').getUTCDay())) continue;
        for (const t of times) {
          const departure = `${d}T${t}`;
          if (get(`SELECT 1 FROM generated_slots WHERE rule_id = ? AND departure = ?`, rule.id, departure)) continue;
          run(`INSERT INTO generated_slots (rule_id, departure) VALUES (?,?)`, rule.id, departure);
          // a departure on that route and time may already exist (created by hand)
          if (get(`SELECT 1 FROM trips WHERE route_id = ? AND departure = ? AND status != 'CANCELLED'`, rule.route_id, departure)) continue;
          run(`INSERT INTO trips (route_id, train_id, departure) VALUES (?,?,?)`, rule.route_id, rule.train_id, departure);
          created++;
        }
      }
    }
  });
  return created;
}
