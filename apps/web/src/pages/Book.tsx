import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BedDouble, CreditCard, Info, Minus, Plus, Sparkles, Timer, Trash2, Wand2 } from 'lucide-react';
import { api, ApiError, fmtDate, fmtDuration, fmtMoney, fmtTime, sessionId } from '../api';
import type { Availability, Cell, PassengerType, SeatState, TripDetail, Wagon } from '../types';
import { TrainMap } from '../components/TrainMap';
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
  const [count, setCount] = useState(2);
  const [sel, setSel] = useState<Sel[]>([]);
  const [prefs, setPrefs] = useState<string[]>([]);
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
    api('/api/meta').then((m) => setTypes(m.passengerTypes));
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
    if (cell.type === 'WHEELCHAIR') say(t('Wheelchair space selected. Please also select a seat for your companion – seats 1–4 next to this area are best.'));
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
      const why = r.reasons.map((x) => t(SEAT_ATTRS[x] ?? x)).join(', ');
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
    return (
      <>
        <strong>{t(c.type === 'BERTH' ? 'Berth' : c.type === 'WHEELCHAIR' ? 'Wheelchair space' : 'Seat')} {c.label}</strong>
        <span>{t('Wagon')} {w.number}{w.classLabel ? ` · ${t('class')} ${w.classLabel}` : ''}</span>
        <span className="tip-attrs">{(c.attrs ?? []).filter((a) => SEAT_ATTRS[a]).map((a) => t(SEAT_ATTRS[a])).join(' · ')}</span>
        {st === 'free' || st === 'selected' ? <span>{fmtMoney(trip.prices[w.layout]?.ADULT ?? 0)} ({t('Adult')})</span> : <span className="tip-state">{t(`seat_${st}`)}</span>}
      </>
    );
  };

  return (
    <div className="page page--wide">
      <header className="book-head">
        <div>
          <Link to={`/?route=${trip.route.id}&date=${trip.departure.slice(0, 10)}`} className="muted small">← {t('All departures')}</Link>
          <h1>{trip.route.name}</h1>
          <p className="muted">
            {fmtDate(trip.departure, lang, { weekday: 'long', day: 'numeric', month: 'long' })} · <b>{fmtTime(trip.departure)}</b> → {fmtTime(trip.arrival)} ({fmtDuration(trip.route.duration_min)}) ·{' '}
            <Link to={`/trains/${trip.train.id}`}>{trip.train.name}</Link> <span className="small">({t(trip.train.kind)})</span>
          </p>
        </div>
        <ol className="steps" aria-label={t('Steps')}>
          {(['seats', 'details', 'pay'] as const).map((s, i) => (
            <li key={s} className={step === s ? 'is-active' : ''} aria-current={step === s ? 'step' : undefined}>{i + 1}. {t(`step_${s}`)}</li>
          ))}
          <li>4. {t('step_ticket')}</li>
        </ol>
      </header>

      <div className="book-grid">
        <main className="book-main">
          {step === 'seats' && (
            <>
              <div className="controls card">
                <div className="control">
                  <span className="control-label">{t('Passengers')}</span>
                  <div className="stepper">
                    <button className="icon-btn" onClick={() => changeCount(count - 1)} aria-label={t('Fewer passengers')}><Minus size={16} /></button>
                    <output aria-live="polite">{count}</output>
                    <button className="icon-btn" onClick={() => changeCount(count + 1)} aria-label={t('More passengers')}><Plus size={16} /></button>
                  </div>
                </div>
                <div className="control control--grow">
                  <span className="control-label">{t('My preferences')} <span className="muted small">({t('other seats are dimmed')})</span></span>
                  <div className="chips">
                    {availablePrefs.map((p) => (
                      <button key={p} className={`chip${prefs.includes(p) ? ' is-on' : ''}`} aria-pressed={prefs.includes(p)}
                        onClick={() => setPrefs((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))}>
                        {t(SEAT_ATTRS[p])}
                      </button>
                    ))}
                  </div>
                </div>
                <button className="btn btn--accent" onClick={autoPick} disabled={busy}>
                  <Wand2 size={16} aria-hidden /> {t('Pick the best seats for me')}
                </button>
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
                legend={['free', 'selected', 'held', 'sold', 'blocked']}
                wagonExtra={(w) => w.bookable && (
                  <div className="price-row">
                    {types.map((pt) => <span key={pt.code}>{t(pt.label)}: <b>{fmtMoney(trip.prices[w.layout]?.[pt.code] ?? 0)}</b></span>)}
                  </div>
                )}
              />
            </>
          )}

          {step === 'details' && (
            <form className="card form" onSubmit={(e) => { e.preventDefault(); if (detailsOk) setStep('pay'); }}>
              <h2>{t('Contact details')}</h2>
              <p className="muted small">{t('We send the tickets to this email. You can also find them later with the booking code.')}</p>
              <label>{t('Full name')}<input required autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></label>
              <label>{t('Email')}<input required type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></label>
              <label>{t('Phone (optional)')}<input type="tel" autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></label>
              <label className="check"><input type="checkbox" required /> {t('I agree to the terms and to the processing of my data for this booking (GDPR).')}</label>
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setStep('seats')}>{t('Back')}</button>
                <button type="submit" className="btn btn--primary" disabled={!detailsOk}>{t('Continue to payment')}</button>
              </div>
            </form>
          )}

          {step === 'pay' && (
            <form className="card form" onSubmit={(e) => { e.preventDefault(); pay(); }}>
              <h2><CreditCard size={20} aria-hidden /> {t('Payment')}</h2>
              <p className="demo-note"><Info size={16} aria-hidden /> {t('Demo mode: no real payment is made. Any card number works.')}</p>
              <label>{t('Card number')}<input inputMode="numeric" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} /></label>
              <div className="form-row">
                <label>{t('Expiry')}<input value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} /></label>
                <label>CVC<input inputMode="numeric" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} /></label>
              </div>
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setStep('details')}>{t('Back')}</button>
                <button type="submit" className="btn btn--primary" disabled={busy}>{t('Pay')} {fmtMoney(total)}</button>
              </div>
            </form>
          )}
        </main>

        <aside className="book-aside card" aria-label={t('Your selection')}>
          <h2>{t('Your selection')}</h2>
          <p className="muted small">{sel.length}/{count} {t('places selected')}</p>
          {remaining !== null && sel.length > 0 && (
            <p className={`timer${remaining < 120 ? ' is-low' : ''}`} role="timer" aria-live="off">
              <Timer size={16} aria-hidden /> {t('Seats held for')} {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </p>
          )}
          {sel.length === 0 && <p className="empty small">{t('Click free seats on the map, or let us pick the best ones.')}</p>}
          <ul className="sel-list">
            {sel.map((s, i) => {
              const info = index.get(s.key);
              if (!info) return null;
              const compKind = info.wagon.kind === 'SLEEPER' || info.wagon.kind === 'COUCHETTE';
              return (
                <li key={s.key}>
                  <button className="sel-seat" onClick={() => setActive(info.wagon.number)} title={t('Show on map')}>
                    <span className="sel-num">{info.cell.label}</span>
                    <span>
                      <b>{t('Wagon')} {info.wagon.number}</b>
                      <span className="small muted">{(info.cell.attrs ?? []).filter((a) => SEAT_ATTRS[a]).slice(0, 3).map((a) => t(SEAT_ATTRS[a])).join(' · ')}</span>
                    </span>
                  </button>
                  <div className="sel-row">
                    <select aria-label={t('Passenger type for seat {s}', { s: info.cell.label! })} value={s.type} disabled={step !== 'seats'}
                      onChange={(e) => setSel((p) => p.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}>
                      {types.map((pt) => <option key={pt.code} value={pt.code}>{t(pt.label)}</option>)}
                    </select>
                    <span className="sel-price">{fmtMoney(priceOf(s.key, s.type))}</span>
                    {step === 'seats' && (
                      <button className="icon-btn" onClick={() => setSel((p) => p.filter((x) => x.key !== s.key))} aria-label={t('Remove seat {s}', { s: info.cell.label! })}><Trash2 size={15} /></button>
                    )}
                  </div>
                  {compKind && step === 'seats' && (
                    <button className="link-btn small" onClick={() => wholeCompartment(s.key)}><BedDouble size={14} aria-hidden /> {t('Book the whole compartment')}</button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="total"><span>{t('Total')}</span><b>{fmtMoney(total)}</b></div>
          {step === 'seats' && (
            <button className="btn btn--primary btn--block" disabled={!ready} onClick={() => setStep('details')}>
              {ready ? t('Continue') : t('Select {n} more', { n: count - sel.length })}
            </button>
          )}
          <p className="muted small"><Sparkles size={12} aria-hidden /> {t('Prices are per person for this route. Children under 6 travel free without a seat.')}</p>
        </aside>
      </div>

      {toast && <div className={`toast toast--${toast.kind}`} role="status">{toast.text}</div>}
    </div>
  );
}
