import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { Route, Train } from '../../types';
import { useT } from '../../i18n';

const DOW = [1, 2, 3, 4, 5, 6, 0];

export function Schedule() {
  const t = useT();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [trains, setTrains] = useState<Train[]>([]);
  const [single, setSingle] = useState({ routeId: 1, trainId: 1, departure: '' });
  const [rule, setRule] = useState({ routeId: 1, trainId: 1, from: '', to: '', days: [1, 2, 3, 4, 5, 6, 0], times: '10:00, 12:00, 14:00' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api('/api/meta').then((m) => { setRoutes(m.routes); setRule((r) => ({ ...r, from: m.today, to: m.today })); });
    api<Train[]>('/api/trains').then(setTrains);
  }, []);

  const go = async (fn: () => Promise<string>) => { try { setMsg(await fn()); } catch (e) { setMsg((e as Error).message); } };
  const dayName = (d: number) => new Date(2024, 0, 7 + d).toLocaleDateString(undefined, { weekday: 'short' });

  const selects = (v: { routeId: number; trainId: number }, set: (x: { routeId: number; trainId: number }) => void) => (
    <div className="form-row">
      <label>{t('Route')}<select value={v.routeId} onChange={(e) => set({ ...v, routeId: Number(e.target.value) })}>{routes.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}</select></label>
      <label>{t('Train')}<select value={v.trainId} onChange={(e) => set({ ...v, trainId: Number(e.target.value) })}>{trains.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    </div>
  );

  return (
    <div className="two-col">
      <form className="card form" onSubmit={(e) => { e.preventDefault(); go(async () => { await api('/api/admin/trips', { method: 'POST', body: single }); return t('Departure added.'); }); }}>
        <h2>{t('Add one departure')}</h2>
        {selects(single, (x) => setSingle({ ...single, ...x }))}
        <label>{t('Date and time')}<input type="datetime-local" required value={single.departure} onChange={(e) => setSingle({ ...single, departure: e.target.value })} /></label>
        <button className="btn btn--primary">{t('Add departure')}</button>
      </form>

      <form className="card form" onSubmit={(e) => {
        e.preventDefault();
        go(async () => {
          const times = rule.times.split(/[,\s]+/).filter(Boolean);
          const r = await api('/api/admin/schedule', { method: 'POST', body: { ...rule, times } });
          return t('{c} departures created, {s} already existed.', { c: r.created, s: r.skipped });
        });
      }}>
        <h2>{t('Recurring schedule')}</h2>
        <p className="muted small">{t('Generates departures for every selected weekday between the two dates. Existing departures are skipped.')}</p>
        {selects(rule, (x) => setRule({ ...rule, ...x }))}
        <div className="form-row">
          <label>{t('From')}<input type="date" required value={rule.from} onChange={(e) => setRule({ ...rule, from: e.target.value })} /></label>
          <label>{t('To')}<input type="date" required value={rule.to} onChange={(e) => setRule({ ...rule, to: e.target.value })} /></label>
        </div>
        <fieldset className="chips">
          <legend className="small">{t('Weekdays')}</legend>
          {DOW.map((d) => (
            <label key={d} className={`chip${rule.days.includes(d) ? ' is-on' : ''}`}>
              <input type="checkbox" className="sr-only" checked={rule.days.includes(d)} onChange={() => setRule({ ...rule, days: rule.days.includes(d) ? rule.days.filter((x) => x !== d) : [...rule.days, d] })} />
              {dayName(d)}
            </label>
          ))}
        </fieldset>
        <label>{t('Departure times (HH:MM, comma separated)')}<input value={rule.times} onChange={(e) => setRule({ ...rule, times: e.target.value })} /></label>
        <button className="btn btn--primary">{t('Generate departures')}</button>
      </form>
      {msg && <p className="note" role="status">{msg}</p>}
    </div>
  );
}
