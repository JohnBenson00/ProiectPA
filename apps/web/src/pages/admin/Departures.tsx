import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtMoney, fmtTime } from '../../api';
import type { Train, TripSummary } from '../../types';
import { useT } from '../../i18n';

interface Stats { todayTrips: number; todaySold: number; todayBoarded: number; revenue30: number; days: Array<{ date: string; sold: number }> }

export function Departures({ isAdmin }: { isAdmin: boolean }) {
  const t = useT();
  const [date, setDate] = useState('');
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [trains, setTrains] = useState<Train[]>([]);
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState<number | null>(null);

  useEffect(() => {
    api('/api/meta').then((m) => setDate((d) => d || m.today));
    api<Stats>('/api/admin/stats').then(setStats).catch(() => {});
    api<Train[]>('/api/trains').then(setTrains);
  }, []);
  const load = useCallback(() => { if (date) api<TripSummary[]>(`/api/admin/trips?date=${date}`).then(setTrips).catch((e) => setMsg(e.message)); }, [date]);
  useEffect(load, [load]);

  const cancel = async (id: number) => {
    await api(`/api/admin/trips/${id}`, { method: 'PATCH', body: { status: 'CANCELLED' } });
    setConfirm(null);
    setMsg(t('Trip cancelled. All its tickets were cancelled.'));
    load();
  };
  const changeTrain = async (trip: TripSummary, trainId: number) => {
    try {
      const preview = await api(`/api/admin/trips/${trip.id}/reseat-preview?trainId=${trainId}`);
      const ok = window.confirm(t('{k} passengers keep their seat, {m} will be moved to similar seats, {u} do not fit. Continue?', { k: preview.kept, m: preview.moves.length - preview.unplaced, u: preview.unplaced }));
      if (!ok) return;
      await api(`/api/admin/trips/${trip.id}`, { method: 'PATCH', body: { trainId } });
      setMsg(t('Train changed and passengers re-seated.'));
      load();
    } catch (e) { setMsg((e as Error).message); }
  };

  const maxSold = Math.max(1, ...(stats?.days.map((d) => d.sold) ?? [1]));
  return (
    <div>
      {stats && (
        <div className="stat-row">
          <div className="stat card"><span className="muted small">{t('Departures today')}</span><b>{stats.todayTrips}</b></div>
          <div className="stat card"><span className="muted small">{t('Tickets today')}</span><b>{stats.todaySold}</b></div>
          <div className="stat card"><span className="muted small">{t('Boarded today')}</span><b>{stats.todayBoarded}</b></div>
          <div className="stat card"><span className="muted small">{t('Online sales, 30 days')}</span><b>{fmtMoney(stats.revenue30)}</b></div>
          <div className="stat card stat--chart" aria-label={t('Tickets per day')}>
            <span className="muted small">{t('Tickets per day')}</span>
            <div className="bars">
              {stats.days.map((d) => (
                <span key={d.date} className="bar-wrap" title={`${d.date}: ${d.sold}`}>
                  <span className="bar" style={{ height: `${(d.sold / maxSold) * 100}%` }} />
                  <span className="bar-label">{d.date.slice(8)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="toolbar">
        <label className="inline">{t('Date')} <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        {msg && <span className="note" role="status">{msg}</span>}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>{t('Time')}</th><th>{t('Route')}</th><th>{t('Train')}</th><th>{t('Occupancy')}</th><th>{t('Boarded')}</th><th>{t('Status')}</th><th /></tr>
          </thead>
          <tbody>
            {trips.map((tr) => {
              const occ = tr.capacity ? tr.sold / tr.capacity : 0;
              return (
                <tr key={tr.id} className={tr.status === 'CANCELLED' ? 'is-cancelled' : ''}>
                  <td><b>{fmtTime(tr.departure)}</b></td>
                  <td>{tr.route.code} <span className="muted small">{tr.route.name}</span></td>
                  <td>
                    {isAdmin && tr.status === 'SCHEDULED' && !tr.departed ? (
                      <select value={tr.train.id} onChange={(e) => changeTrain(tr, Number(e.target.value))} aria-label={t('Train')}>
                        {trains.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    ) : tr.train.name}
                  </td>
                  <td>
                    <div className="occ"><span style={{ width: `${occ * 100}%`, background: occ > 0.85 ? '#dc2626' : occ > 0.5 ? '#f59e0b' : '#16a34a' }} /></div>
                    <span className="small">{tr.sold}/{tr.capacity}</span>
                  </td>
                  <td>{tr.boarded}</td>
                  <td>{tr.status === 'CANCELLED' ? <span className="badge badge--red">{t('Cancelled')}</span> : tr.departed ? <span className="badge">{t('Departed')}</span> : <span className="badge badge--blue">{t('Scheduled')}</span>}</td>
                  <td className="actions">
                    <Link className="btn btn--small" to={`/admin/trip/${tr.id}`}>{t('Seat map')}</Link>
                    {isAdmin && tr.status === 'SCHEDULED' && (
                      confirm === tr.id
                        ? <button className="btn btn--small btn--danger" onClick={() => cancel(tr.id)}>{t('Confirm cancel')}</button>
                        : <button className="btn btn--small" onClick={() => setConfirm(tr.id)}>{t('Cancel')}</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {trips.length === 0 && <p className="empty">{t('No departures on this day.')}</p>}
      </div>
    </div>
  );
}
