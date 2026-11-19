import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Clock, Info, Minus, Plus, X } from 'lucide-react';
import { api, ApiError, fmtDate, fmtDuration, fmtMoney, fmtTime, sessionId } from '../api';
import type { Availability, Cell, PassengerType, SeatState, TripDetail, Wagon } from '../types';
import { TrainMap } from '../components/TrainMap';
import { RouteStops } from '../components/RouteStops';
import { SEAT_ATTRS } from '../amenities';
import { useLang, useT } from '../i18n';

interface Sel { key: string; type: string }
const PREFS = ['WINDOW', 'AISLE', 'FORWARD', 'TABLE', 'QUIET', 'COMPARTMENT', 'BERTH_LOWER', 'BERTH_UPPER', 'PANORAMIC', 'FAMILY', 'ACCESSIBLE', 'NEAR_DINING'];
const BOOKABLE = new Set(['SEAT', 'BERTH', 'WHEELCHAIR']);

export function Book() {
  const t = useT();
  const { lang } = useLang();
  const nav = useNavigate();
  const { id } = useParams();
  const session = useMemo(sessionId, []);
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [types, setTypes] = useState<PassengerType[]>([]);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [count, setCount] = useState(1);
  const [sel, setSel] = useState<Sel[]>([]);
  const [prefs, setPrefs] = useState<string[]>([]);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [showStops, setShowStops] = useState(false);
  const [emailOn, setEmailOn] = useState(false);
  const [active, setActive] = useState(1);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<{ text: string; kind?: 'info' | 'warn' } | null>(null);
  const [step, setStep] = useState<'seats' | 'details' | 'pay'>('seats');
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [card, setCard] = useState({ number: '4242 4242 4242 4242', exp: '12/28', cvc: '123' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toastTimer = useRef<number>();

  const say = useCallback((text: string, kind: 'info' | 'warn' = 'info') => {
    setToast({ text, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  useEffect(() => {
    api<TripDetail>(`/api/trips/${id}`).then((tr) => {
      setTrip(tr);
      setActive(tr.train.wagons.find((w) => w.bookable)?.number ?? 1);
    }).catch((e) => setError(e.message));
    api('/api/meta').then((m) => { setTypes(m.passengerTypes); setEmailOn(!!m.emailEnabled); });
  }, [id]);

  // seat index: key -> {cell, wagon}
  const index = useMemo(() => {
    const m = new Map<string, { cell: Cell; wagon: Wagon }>();
    trip?.train.wagons.forEach((w) => w.layoutData?.bookable && w.layoutData.cells.forEach((c) => {
      if (BOOKABLE.has(c.type)) m.set(`${w.id}:${c.label}`, { cell: c, wagon: w });
    }));
    return m;
  }, [trip]);

  const refresh = useCallback(async () => {
    const a = await api<Availability>(`/api/trips/${id}/availability?session=${session}`);
    setAvail(a);
    return a;
  }, [id, session]);

  // live availability (polling)
  useEffect(() => {
    refresh();
    const iv = window.setInterval(refresh, 4000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(iv); window.clearInterval(clock); };
  }, [refresh]);

  // keep the server-side hold in sync with the selection
  const selKeys = sel.map((s) => s.key).join(',');
  useEffect(() => {
    if (!trip) return;
    const h = window.setTimeout(async () => {
      try {
        const r = await api<{ held: string[]; conflicts: string[]; expiresAt: number | null }>(`/api/trips/${id}/hold`, { method: 'PUT', body: { session, seatKeys: sel.map((s) => s.key) } });
        setExpiresAt(r.expiresAt);
        if (r.conflicts.length) {
          setSel((p) => p.filter((s) => !r.conflicts.includes(s.key)));
          say(t('Sorry, seat {s} was just taken by someone else.', { s: r.conflicts.map(seatName).join(', ') }), 'warn');
        }
        refresh();
      } catch (e) {
        if (e instanceof ApiError) say(t(e.message), 'warn');
      }
    }, 250);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKeys, trip]);

  // hold expiry
  useEffect(() => {
    if (expiresAt && now > expiresAt && sel.length) {
      setSel([]);
      setStep('seats');
      setExpiresAt(null);
      say(t('Your seat reservation expired. Please select your seats again.'), 'warn');
    }
  }, [now, expiresAt, sel.length, say, t]);

  if (error) return <div className="page"><p className="error">{error}</p><Link to="/">{t('Back')}</Link></div>;
  if (!trip || !avail) return <div className="page"><div className="skeleton" style={{ height: 400 }} /></div>;

  const sold = new Set(avail.sold), held = new Set(avail.held), blocked = new Set(avail.blocked);
  const selected = new Set(sel.map((s) => s.key));
  const stateOf = (k: string): SeatState =>
    selected.has(k) ? 'selected' : sold.has(k) ? 'sold' : blocked.has(k) ? 'blocked' : held.has(k) ? 'held' : 'free';

  function seatName(key: string) {
    const s = index.get(key);
    return s ? `${t('W')}${s.wagon.number}/${s.cell.label}` : key;
  }

  const diningNumbers = trip.train.wagons.filter((w) => w.kind === 'DINING').map((w) => w.number);
  const nearDining = (w: Wagon) => diningNumbers.some((n) => Math.abs(n - w.number) <= 1);
  const allAttrs = new Set<string>();
  index.forEach(({ cell }) => cell.attrs?.forEach((a) => allAttrs.add(a)));
  const availablePrefs = PREFS.filter((p) => (p === 'NEAR_DINING' ? diningNumbers.length > 0 : allAttrs.has(p)));
  const matches = (c: Cell, w: Wagon) => prefs.every((p) => (p === 'NEAR_DINING' ? nearDining(w) : c.attrs?.includes(p)));

  const priceOf = (key: string, type: string) => {
    const s = index.get(key);
    return s ? trip.prices[s.wagon.layout]?.[type] ?? 0 : 0;
  };
  const total = sel.reduce((sum, s) => sum + priceOf(s.key, s.type), 0);

  const stats: Record<number, { free: number; capacity: number; mine: number }> = {};
  trip.train.wagons.forEach((w) => { stats[w.id] = { free: 0, capacity: w.capacity, mine: 0 }; });
  index.forEach((_, k) => {
    const w = index.get(k)!.wagon;
    const st = stateOf(k);
    if (st === 'free') stats[w.id].free++;
    if (st === 'selected') stats[w.id].mine++;
  });

  const toggle = (cell: Cell, key: string) => {
    if (step !== 'seats') return;
    if (selected.has(key)) { setSel((p) => p.filter((s) => s.key !== key)); return; }
    if (sel.length >= count) {
      if (count === 1) { setSel([{ key, type: sel[0]?.type ?? 'ADULT' }]); return; }
      say(t('You already selected {n} seats. Add a passenger or remove a seat first.', { n: count }), 'warn');
      return;
    }
    setSel((p) => [...p, { key, type: 'ADULT' }]);
    if (cell.type === 'WHEELCHAIR') say(t('Wheelchair space selected. Please also select a seat for your companion – seats 11–14 next to this area are best.'));
  };

  const wholeCompartment = (key: string) => {
    const s = index.get(key);
    if (!s) return;
    const inComp = [...index.entries()].filter(([, v]) => v.wagon.id === s.wagon.id && v.cell.group === s.cell.group);
    const keys = inComp.filter(([k]) => stateOf(k) === 'free').map(([k]) => k);
    const mineInComp = inComp.filter(([k]) => selected.has(k)).length;
    const next = [...sel, ...keys.map((k) => ({ key: k, type: 'ADULT' }))];
    if (next.length > 12) { say(t('At most 12 places per booking.'), 'warn'); return; }
    setSel(next);
    setCount(Math.max(count, next.length));
    say(t('The whole compartment is now selected ({n} berths).', { n: keys.length + mineInComp }));
  };

  const autoPick = async () => {
    setBusy(true);
    try {
      const r = await api<{ seatKeys: string[]; reasons: string[]; wagonNumber: number }>(`/api/trips/${id}/auto-pick`, { method: 'POST', body: { count, prefs, session } });
      setSel(r.seatKeys.map((k, i) => ({ key: k, type: sel[i]?.type ?? 'ADULT' })));
      setActive(r.wagonNumber);
      const why = r.reasons.map((x) => t(SEAT_ATTRS[x] ?? `pick_${x}`)).join(', ');
      say(`${t('We found {n} seats in wagon {w}', { n: count, w: r.wagonNumber })}${why ? ` – ${why}` : ''}.`);
    } catch (e) {
      say(t((e as Error).message), 'warn');
    } finally { setBusy(false); }
  };

  const changeCount = (n: number) => {
    const c = Math.max(1, Math.min(12, n));
    setCount(c);
    if (sel.length > c) setSel((p) => p.slice(0, c));
  };

  const pay = async () => {
    setBusy(true);
    try {
      const r = await api<{ code: string; email: string }>(`/api/bookings`, { method: 'POST', body: { session, tripId: trip.id, seats: sel.map((s) => ({ seatKey: s.key, type: s.type })), contact } });
      try {
        const mine = JSON.parse(localStorage.getItem('myBookings') ?? '[]');
        localStorage.setItem('myBookings', JSON.stringify([{ code: r.code, email: r.email, departure: trip.departure, route: trip.route.name }, ...mine].slice(0, 20)));
      } catch { /* storage unavailable */ }
      nav(`/ticket/${r.code}?email=${encodeURIComponent(r.email)}&new=1`);
    } catch (e) {
      setStep('seats');
      say(t((e as Error).message), 'warn');
      refresh();
    } finally { setBusy(false); }
  };

  const remaining = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : null;
  const ready = sel.length === count && sel.length > 0;
  const detailsOk = contact.name.trim().length > 1 && /^\S+@\S+\.\S+$/.test(contact.email);

  const describe = (c: Cell, k: string, w: Wagon) => {
    const st = stateOf(k);
    const attrs = (c.attrs ?? []).filter((a) => SEAT_ATTRS[a]).map((a) => t(SEAT_ATTRS[a]));
    return (
      <>
        <span className="tip-title">
          {t(c.type === 'BERTH' ? 'Berth' : c.type === 'WHEELCHAIR' ? 'Wheelchair space' : 'Seat')} {c.label}
          <span className="tip-right">{st === 'free' || st === 'selected' ? fmtMoney(trip.prices[w.layout]?.ADULT ?? 0) : t(`seat_${st}`)}</span>
        </span>
        {attrs.length > 0 && <span className="tip-attrs">{attrs.join(', ')}</span>}
      </>
    );
  };

  const stops = trip.route.stops;
  const from = stops[0]?.name ?? trip.route.name;
  const to = stops[stops.length - 1]?.name ?? '';
  const between = Math.max(0, stops.length - 2);
  const mmss = remaining !== null ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : '';
  const stepIndex = { seats: 0, details: 1, pay: 2 }[step];

  return (
    <div className="booking">
      <div className="journey">
        <div className="journey-inner">
          <div className="journey-main">
            <Link to={`/?route=${trip.route.id}&date=${trip.departure.slice(0, 10)}`} className="back-link">← {t('All departures')}</Link>
            <p className="journey-route">
              <span className="j-time">{fmtTime(trip.departure)}</span> {from}
              <span className="j-arrow" aria-hidden>→</span>
              <span className="j-time">{fmtTime(trip.arrival)}</span> {to}
            </p>
            <p className="journey-meta">
              {fmtDate(trip.departure, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              <span className="sep">·</span>{trip.route.code} <Link to={`/trains/${trip.train.id}`}>{trip.train.name}</Link>
              <span className="sep">·</span>{fmtDuration(trip.route.duration_min)}
              <span className="sep">·</span>
              <button className="link-btn stops-toggle" aria-expanded={showStops} aria-controls="journey-stops" onClick={() => setShowStops((v) => !v)}>
                {between ? t('{n} intermediate stops', { n: between }) : t('direct')} {showStops ? '▴' : '▾'}
              </button>
            </p>
          </div>
          <ol className="steps" aria-label={t('Steps')}>
            {(['seats', 'details', 'pay', 'ticket'] as const).map((s, i) => (
              <li key={s} className={i === stepIndex ? 'is-active' : i < stepIndex ? 'is-done' : ''} aria-current={i === stepIndex ? 'step' : undefined}>
                <span className="step-no">{i + 1}</span><span className="step-text">{t(`step_${s}`)}</span>
              </li>
            ))}
          </ol>
        </div>
        {showStops && (
          <div className="journey-stops" id="journey-stops">
            <RouteStops stops={stops} departure={trip.departure} label={`${t('Route and stops')}: ${trip.route.name}`} />
          </div>
        )}
      </div>

      <div className="booking-grid">
        <main className="booking-main">
          {step === 'seats' && (
            <div className="panel">
              <div className="seat-toolbar">
                <div className="tb-group">
                  <span className="tb-label" id="pax-label">{t('Passengers')}</span>
                  <div className="stepper" role="group" aria-labelledby="pax-label">
                    <button onClick={() => changeCount(count - 1)} disabled={count <= 1} aria-label={t('Fewer passengers')}><Minus size={14} /></button>
                    <output aria-live="polite">{count}</output>
                    <button onClick={() => changeCount(count + 1)} disabled={count >= 12} aria-label={t('More passengers')}><Plus size={14} /></button>
                  </div>
                </div>
                <fieldset className="tb-group tb-group--grow">
                  <legend className="tb-label tb-label--desktop">{t('Seat preferences')}</legend>
                  <button type="button" className="prefs-toggle" aria-expanded={prefsOpen} onClick={() => setPrefsOpen((o) => !o)}>
                    {t('Seat preferences')}{prefs.length > 0 && ` (${prefs.length})`} <span aria-hidden>{prefsOpen ? '▴' : '▾'}</span>
                  </button>
                  <div className={`checks${prefsOpen ? ' is-open' : ''}`}>
                    {availablePrefs.map((p) => (
                      <label key={p} className="check-inline">
                        <input type="checkbox" checked={prefs.includes(p)}
                          onChange={() => setPrefs((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))} />
                        {t(SEAT_ATTRS[p])}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="tb-group tb-group--end">
                  <button className="btn" onClick={autoPick} disabled={busy} title={prefs.length ? t('Uses your preferences') : t('Keeps your group together')}>{t('Auto-assign seats')}</button>
                </div>
              </div>

              <TrainMap
                train={trip.train}
                active={active}
                setActive={setActive}
                stateOf={stateOf}
                onSeat={toggle}
                dimmed={prefs.length ? (c, w) => !matches(c, w) : undefined}
                describe={describe}
                stats={stats}
                legend={['free', 'selected', 'sold', 'held', 'blocked']}
                wagonExtra={(w) => w.bookable && (
                  <>
                    <dt>{t('Fares')}</dt>
                    <dd className="fares">
                      {types.map((pt) => <span key={pt.code}>{t(pt.label)} <b>{fmtMoney(trip.prices[w.layout]?.[pt.code] ?? 0)}</b></span>)}
                    </dd>
                  </>
                )}
              />
            </div>
          )}

          {step === 'details' && (
            <form className="panel form" onSubmit={(e) => { e.preventDefault(); if (detailsOk) setStep('pay'); }}>
              <h2 className="panel-title">{t('Contact details')}</h2>
              <p className="muted small">{emailOn
                ? t('We send the tickets to this email. You can also find them later with the booking code.')
                : t('With your booking code and this email you can open your tickets at any time.')}</p>
              <label>{t('Full name')}<input required autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></label>
              <div className="form-row">
                <label>{t('Email')}<input required type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></label>
                <label>{t('Phone (optional)')}<input type="tel" autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></label>
              </div>
              <label className="check"><input type="checkbox" required /> {t('I agree to the terms and to the processing of my data for this booking (GDPR).')}</label>
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setStep('seats')}>{t('Back')}</button>
                <button type="submit" className="btn btn--primary" disabled={!detailsOk}>{t('Continue to payment')}</button>
              </div>
            </form>
          )}

          {step === 'pay' && (
            <form className="panel form" onSubmit={(e) => { e.preventDefault(); pay(); }}>
              <h2 className="panel-title">{t('Payment')}</h2>
              <p className="notice"><Info size={15} aria-hidden /> {t('Demo mode: no real payment is made. Any card number works.')}</p>
              <label>{t('Card number')}<input inputMode="numeric" autoComplete="cc-number" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} /></label>
              <div className="form-row">
                <label>{t('Expiry')}<input autoComplete="cc-exp" value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} /></label>
                <label>CVC<input inputMode="numeric" autoComplete="cc-csc" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} /></label>
              </div>
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setStep('details')}>{t('Back')}</button>
                <button type="submit" className="btn btn--primary" disabled={busy}>{t('Pay')} {fmtMoney(total)}</button>
              </div>
            </form>
          )}
        </main>

        <aside className="summary" aria-label={t('Your reservation')}>
          <div className="summary-head">
            <h2>{t('Your reservation')}</h2>
            <span className="muted">{sel.length}/{count} {t('places selected')}</span>
          </div>
          {remaining !== null && sel.length > 0 && (
            <p className={`hold${remaining < 120 ? ' is-low' : ''}`} role="timer" aria-live="off">
              <Clock size={13} aria-hidden /> {t('Seats held for')} <span className="tabular">{mmss}</span>
            </p>
          )}
          {sel.length > 0 && (
            <div className="sel-cols" aria-hidden>
              <span>{t('Place')}</span><span>{t('Fare type')}</span><span>{t('Price')}</span><span />
            </div>
          )}
          {sel.length === 0 ? (
            <p className="summary-empty">{t('Select seats on the plan or use automatic assignment.')}</p>
          ) : (
            <ul className="sel-list" aria-label={t('Selected places')}>
              {sel.map((s, i) => {
                const info = index.get(s.key);
                if (!info) return null;
                const sameComp = (k: string) => { const o = index.get(k); return !!o && o.wagon.id === info.wagon.id && o.cell.group === info.cell.group; };
                const firstOfComp = sel.findIndex((x) => sameComp(x.key)) === i;
                const compHasFree = [...index.keys()].some((k) => sameComp(k) && stateOf(k) === 'free');
                const compKind = (info.wagon.kind === 'SLEEPER' || info.wagon.kind === 'COUCHETTE') && firstOfComp && compHasFree;
                const attrs = (info.cell.attrs ?? []).filter((a) => SEAT_ATTRS[a] && a !== 'COMPARTMENT').slice(0, 2).map((a) => t(SEAT_ATTRS[a])).join(', ');
                return (
                  <li key={s.key}>
                    <button className="sel-place" onClick={() => setActive(info.wagon.number)} title={t('Show on map')}>
                      <span className="sel-coach">{t('W')}{info.wagon.number}</span>
                      <span className="sel-seat">{info.cell.label}</span>
                      {attrs && <span className="sel-attrs">{attrs}</span>}
                    </button>
                    <select aria-label={t('Passenger type for seat {s}', { s: info.cell.label! })} value={s.type} disabled={step !== 'seats'}
                      onChange={(e) => setSel((p) => p.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}>
                      {types.map((pt) => <option key={pt.code} value={pt.code}>{t(pt.label)}</option>)}
                    </select>
                    <span className="sel-price tabular">{fmtMoney(priceOf(s.key, s.type))}</span>
                    {step === 'seats'
                      ? <button className="sel-remove" onClick={() => setSel((p) => p.filter((x) => x.key !== s.key))} aria-label={t('Remove seat {s}', { s: info.cell.label! })}><X size={14} /></button>
                      : <span />}
                    {compKind && step === 'seats' && (
                      <button className="link-btn sel-comp" onClick={() => wholeCompartment(s.key)}>{t('Book the whole compartment')}</button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="summary-total">
            <span>{t('Total')}{sel.length > 0 && <span className="muted"> · {sel.length} {t(sel.length === 1 ? 'passenger' : 'passengers')}</span>}</span>
            <b className="tabular">{fmtMoney(total)}</b>
          </div>
          {step === 'seats' && (
            <button className="btn btn--primary btn--block" disabled={!ready} onClick={() => setStep('details')}>
              {ready ? t('Continue') : t('Select {n} more', { n: count - sel.length })}
            </button>
          )}
          <p className="summary-note">{t('Prices per person, VAT included. Children under 6 travel free without a seat.')}</p>
        </aside>
      </div>

      {step === 'seats' && (
        <div className="mobile-bar">
          <div>
            <b className="tabular">{fmtMoney(total)}</b>
            <span className="muted">{sel.length}/{count} {t('places selected')}{remaining !== null && sel.length > 0 ? ` · ${t('held')} ${mmss}` : ''}</span>
          </div>
          <button className="btn btn--primary" disabled={!ready} onClick={() => setStep('details')}>
            {ready ? t('Continue') : t('Select {n} more', { n: count - sel.length })}
          </button>
        </div>
      )}

      <div className="status-line" role="status" aria-live="polite">
        {toast && <div className={`toast toast--${toast.kind}`}>{toast.text}</div>}
      </div>
    </div>
  );
}
