import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Ban, RefreshCw } from 'lucide-react';
import { api, fmtTime } from '../../api';
import type { Availability, SeatState, TripDetail } from '../../types';
import { TrainMap } from '../../components/TrainMap';
import { SEAT_ATTRS } from '../../amenities';
import { useT } from '../../i18n';

interface Occ {
  tickets: Array<{ seatKey: string; status: string; passengerType: string; code: string; name: string; email: string; phone: string; scannedAt: string | null; scannedBy: string | null }>;
  blocked: Array<{ seatKey: string; reason: string }>;
}

export function Occupancy({ isAdmin }: { isAdmin: boolean }) {
  const t = useT();
  const { id } = useParams();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [occ, setOcc] = useState<Occ | null>(null);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [active, setActive] = useState(1);
  const [picked, setPicked] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(() => {
    api(`/api/admin/trips/${id}/occupancy`).then(setOcc);
    api(`/api/trips/${id}/availability`).then(setAvail);
  }, [id]);
  useEffect(() => {
    api<TripDetail>(`/api/trips/${id}`).then((tr) => { setTrip(tr); setActive(tr.train.wagons.find((w) => w.bookable)?.number ?? 1); });
    load();
    const iv = window.setInterval(load, 5000);
    return () => window.clearInterval(iv);
  }, [id, load]);

  if (!trip || !occ || !avail) return <div className="skeleton" style={{ height: 400 }} />;
  const byKey = new Map(occ.tickets.map((x) => [x.seatKey, x]));
  const blocked = new Map(occ.blocked.map((b) => [b.seatKey, b.reason]));
  const held = new Set(avail.held);
  const stateOf = (k: string): SeatState => {
    if (k === picked) return 'selected';
    const tk = byKey.get(k);
    if (tk) return tk.status === 'USED' ? 'used' : 'sold';
    if (blocked.has(k)) return 'blocked';
    if (held.has(k)) return 'held';
    return 'free';
  };
  const stats: Record<number, { free: number; capacity: number }> = {};
  for (const w of trip.train.wagons) {
    const keys = (w.layoutData?.bookable ? w.layoutData.cells.filter((c) => ['SEAT', 'BERTH', 'WHEELCHAIR'].includes(c.type)) : []).map((c) => `${w.id}:${c.label}`);
    stats[w.id] = { capacity: keys.length, free: keys.filter((k) => !byKey.has(k) && !blocked.has(k)).length };
  }
  const used = occ.tickets.filter((x) => x.status === 'USED').length;
  const [pw, pl] = picked ? picked.split(':') : [];
  const pickedWagon = trip.train.wagons.find((w) => String(w.id) === pw);
  const pickedCell = pickedWagon?.layoutData?.cells.find((c) => c.label === pl);
  const pickedTicket = picked ? byKey.get(picked) : undefined;

  const block = async (on: boolean) => {
    await api(`/api/admin/trips/${id}/block`, { method: 'POST', body: { seatKeys: [picked], blocked: on, reason } });
    setReason('');
    load();
  };

  return (
    <div>
      <Link to="/admin" className="muted small">← {t('Departures')}</Link>
      <h1>{trip.route.code} · {fmtTime(trip.departure)} · {trip.departure.slice(0, 10)} <span className="muted small">{trip.train.name}</span></h1>
      <div className="stat-row">
        <div className="stat card"><span className="muted small">{t('Sold')}</span><b>{occ.tickets.length}/{trip.capacity}</b></div>
        <div className="stat card"><span className="muted small">{t('Boarded')}</span><b>{used}</b></div>
        <div className="stat card"><span className="muted small">{t('Not yet boarded')}</span><b>{occ.tickets.length - used}</b></div>
        <div className="stat card"><span className="muted small">{t('Blocked')}</span><b>{occ.blocked.length}</b></div>
        <button className="btn" onClick={load}><RefreshCw size={14} aria-hidden /> {t('Refresh')}</button>
      </div>
      <div className="book-grid">
        <main className="book-main">
          <TrainMap
            train={trip.train}
            active={active}
            setActive={setActive}
            stateOf={stateOf}
            onSeat={(_, k) => setPicked((p) => (p === k ? null : k))}
            selectAny
            stats={stats}
            legend={['free', 'sold', 'used', 'held', 'blocked', 'selected']}
            describe={(c, k) => {
              const tk = byKey.get(k);
              return <><strong>{c.label}</strong>{tk ? <span>{tk.name} · {tk.code}</span> : <span>{t(`seat_${stateOf(k)}`)}</span>}</>;
            }}
          />
        </main>
        <aside className="book-aside card">
          <h2>{t('Seat details')}</h2>
          {!picked && <p className="muted small">{t('Click any seat to see who booked it, or to block it.')}</p>}
          {picked && pickedCell && (
            <>
              <p><b>{t('Wagon')} {pickedWagon?.number} · {pickedCell.label}</b><br />
                <span className="muted small">{(pickedCell.attrs ?? []).filter((a) => SEAT_ATTRS[a]).map((a) => t(SEAT_ATTRS[a])).join(' · ')}</span></p>
              {pickedTicket ? (
                <dl className="dl">
                  <dt>{t('Passenger')}</dt><dd>{pickedTicket.name}</dd>
                  <dt>{t('Booking code')}</dt><dd><code>{pickedTicket.code}</code></dd>
                  <dt>{t('Email')}</dt><dd>{pickedTicket.email}</dd>
                  {pickedTicket.phone && <><dt>{t('Phone')}</dt><dd>{pickedTicket.phone}</dd></>}
                  <dt>{t('Type')}</dt><dd>{t(pickedTicket.passengerType)}</dd>
                  <dt>{t('Status')}</dt><dd>{pickedTicket.status === 'USED' ? `${t('Boarded')} ${pickedTicket.scannedAt?.slice(11)} (${pickedTicket.scannedBy})` : t('Not yet boarded')}</dd>
                </dl>
              ) : isAdmin ? (
                blocked.has(picked) ? (
                  <>
                    <p className="small">{t('Blocked')}: {blocked.get(picked) || '–'}</p>
                    <button className="btn" onClick={() => block(false)}>{t('Unblock seat')}</button>
                  </>
                ) : (
                  <>
                    <label className="small">{t('Reason (optional)')}<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('e.g. broken seat, counter sale')} /></label>
                    <button className="btn btn--danger" onClick={() => block(true)}><Ban size={14} aria-hidden /> {t('Block seat')}</button>
                  </>
                )
              ) : <p className="small">{t(`seat_${stateOf(picked) === 'selected' ? 'free' : stateOf(picked)}`)}</p>}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
