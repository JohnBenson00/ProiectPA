import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, Sparkles, Ticket } from 'lucide-react';
import { api, fmtDate, fmtDuration, fmtMoney, fmtTime } from '../api';
import type { Route, TripSummary } from '../types';
import { TrainStrip } from '../components/TrainStrip';
import { AmenityList } from '../amenities';
import { useLang, useT } from '../i18n';

interface Day { date: string; trips: number; capacity: number; free: number }

export function Home() {
  const t = useT();
  const { lang } = useLang();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [today, setToday] = useState('');
  const routeId = Number(params.get('route') ?? 1);
  const date = params.get('date') ?? today;

  useEffect(() => { api('/api/meta').then((m) => { setRoutes(m.routes); setToday(m.today); }); }, []);
  useEffect(() => { if (today) api<Day[]>(`/api/calendar?route=${routeId}&from=${today}&days=14`).then(setDays); }, [routeId, today]);
  useEffect(() => {
    if (!date) return;
    setTrips(null);
    api<TripSummary[]>(`/api/trips?route=${routeId}&date=${date}`).then(setTrips);
  }, [routeId, date]);

  const set = (k: string, v: string) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }); };
  const route = routes.find((r) => r.id === routeId);

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>{t('Tickets for the Râșnov trains')}</h1>
          <p>{t('Choose your departure, pick your exact seat on the train map and board with the QR code on your phone. No queue at the ticket office.')}</p>
        </div>
        <div className="hero-art" aria-hidden>
          <svg viewBox="0 0 220 120">
            <path d="M0 105 L60 55 L95 80 L140 30 L220 100 L220 120 L0 120Z" fill="#334155" opacity=".55" />
            <path d="M110 48 h40 v-12 h6 v-8 h6 v8 h6 v-8 h6 v8 h6 v12 h-70Z" fill="#fbbf24" />
            <rect x="122" y="22" width="10" height="16" fill="#fbbf24" />
            <rect x="18" y="92" width="34" height="16" rx="4" fill="#fbbf24" />
            <rect x="56" y="92" width="38" height="16" rx="3" fill="#fff" />
            <rect x="98" y="92" width="38" height="16" rx="3" fill="#fff" />
            <circle cx="28" cy="110" r="4" fill="#0f172a" /><circle cx="66" cy="110" r="4" fill="#0f172a" /><circle cx="86" cy="110" r="4" fill="#0f172a" />
            <circle cx="108" cy="110" r="4" fill="#0f172a" /><circle cx="128" cy="110" r="4" fill="#0f172a" />
          </svg>
        </div>
      </section>

      <section aria-labelledby="routes-h">
        <h2 id="routes-h" className="sr-only">{t('Routes')}</h2>
        <div className="route-tabs" role="tablist">
          {routes.map((r) => (
            <button key={r.id} role="tab" aria-selected={r.id === routeId} className={`route-tab${r.id === routeId ? ' is-active' : ''}`} onClick={() => set('route', String(r.id))}>
              <span className="route-code">{r.code}</span>
              <span className="route-name">{r.name}</span>
              <span className="route-meta"><Clock size={12} aria-hidden /> {fmtDuration(r.duration_min)}</span>
            </button>
          ))}
        </div>
        {route && <p className="muted route-desc">{t(route.description)} · {route.stops.map((s) => s.name).join(' → ')}</p>}
      </section>

      <section aria-label={t('Choose the day')}>
        <div className="day-strip">
          {days.map((d) => {
            const ratio = d.capacity ? d.free / d.capacity : 0;
            const level = d.trips === 0 ? 'none' : ratio < 0.15 ? 'low' : ratio < 0.5 ? 'mid' : 'high';
            return (
              <button key={d.date} className={`day day--${level}${d.date === date ? ' is-active' : ''}`} onClick={() => set('date', d.date)} aria-pressed={d.date === date}>
                <span className="day-dow">{fmtDate(d.date, lang, { weekday: 'short' })}</span>
                <span className="day-num">{fmtDate(d.date, lang, { day: 'numeric' })}</span>
                <span className="day-mon">{fmtDate(d.date, lang, { month: 'short' })}</span>
                <span className="day-dot" aria-label={t(`avail_${level}`)} />
              </button>
            );
          })}
        </div>
      </section>

      <section aria-live="polite">
        <h2 className="section-title">{t('Departures')} · {date && fmtDate(date, lang, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        {!trips && <div className="skeleton-list">{[0, 1, 2].map((i) => <div key={i} className="skeleton" />)}</div>}
        {trips && trips.length === 0 && <p className="empty">{t('No departures on this day.')}</p>}
        <div className="trip-list">
          {trips?.map((tr) => {
            const disabled = tr.departed || tr.status !== 'SCHEDULED' || tr.free === 0;
            const amen = [...new Set(tr.wagons.flatMap((w) => w.amenities))];
            return (
              <article key={tr.id} className={`trip-card${disabled ? ' is-disabled' : ''}`}>
                <div className="trip-time">
                  <strong>{fmtTime(tr.departure)}</strong>
                  <span className="muted">→ {fmtTime(tr.arrival)}</span>
                  <span className="muted small">{fmtDuration(tr.route.duration_min)}</span>
                </div>
                <div className="trip-train">
                  <div className="trip-train-name">
                    <span className="train-dot" style={{ background: tr.train.color }} />
                    <Link to={`/trains/${tr.train.id}`}>{tr.train.name}</Link>
                    <span className="muted small">{t(tr.train.kind)}</span>
                    {tr.leastCrowded && <span className="badge badge--green"><Sparkles size={12} aria-hidden /> {t('Least crowded')}</span>}
                  </div>
                  <TrainStrip compact color={tr.train.color} wagons={tr.wagons} />
                  <AmenityList codes={amen} size={14} max={9} />
                </div>
                <div className="trip-buy">
                  {tr.status === 'CANCELLED' ? <span className="badge badge--red">{t('Cancelled')}</span>
                    : tr.departed ? <span className="badge">{t('Departed')}</span>
                      : <span className={`seats-left${tr.free < 20 ? ' is-low' : ''}`}>{tr.free === 0 ? t('Sold out') : `${tr.free} ${t('seats left')}`}</span>}
                  <span className="muted small">{t('from')} <b>{fmtMoney(tr.priceFrom)}</b></span>
                  <button className="btn btn--primary" disabled={disabled} onClick={() => nav(`/book/${tr.id}`)}>
                    <Ticket size={16} aria-hidden /> {t('Choose seats')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
