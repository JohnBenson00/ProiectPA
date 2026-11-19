import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { CheckCircle2, Printer, XCircle } from 'lucide-react';
import { api, fmtDate, fmtMoney, fmtTime } from '../api';
import type { Booking, Ticket as T } from '../types';
import { TrainStrip } from '../components/TrainStrip';
import { RouteStops } from '../components/RouteStops';
import { SEAT_ATTRS } from '../amenities';
import { useLang, useT } from '../i18n';

function Qr({ text, size = 180 }: { text: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(text, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' }).then(setSrc); }, [text, size]);
  return src ? <img src={src} width={size} height={size} alt="QR" className="qr" /> : <div className="qr skeleton" style={{ width: size, height: size }} />;
}

export function TicketPage() {
  const t = useT();
  const { lang } = useLang();
  const { code } = useParams();
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const [b, setB] = useState<Booking | null>(null);
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    api<Booking>(`/api/bookings/${code}?email=${encodeURIComponent(email)}`).then(setB).catch((e) => setError(e.message));
  }, [code, email]);

  if (error) return <div className="page"><p className="error">{t(error)}</p><Link to="/booking">{t('Find a booking')}</Link></div>;
  if (!b) return <div className="page"><div className="skeleton" style={{ height: 300 }} /></div>;

  const cancel = async () => {
    try { setB(await api<Booking>(`/api/bookings/${b.code}/cancel`, { method: 'POST', body: { email: b.email } })); }
    catch (e) { setError((e as Error).message); }
  };

  const statusBadge = (tk: T) =>
    tk.status === 'USED' ? <span className="badge badge--green">{t('Boarded')}</span>
      : tk.status === 'CANCELLED' ? <span className="badge badge--red">{t('Cancelled')}</span>
        : <span className="badge badge--blue">{t('Valid')}</span>;

  return (
    <div className="page">
      {params.get('new') && (
        <div className="success-banner" role="status">
          <CheckCircle2 size={22} aria-hidden />
          <div>
            <strong>{t('Payment successful – have a nice trip!')}</strong>
            <span>{t('Show the QR code to the conductor when boarding. Save this page to your home screen to open it offline.')}</span>
          </div>
        </div>
      )}
      <header className="ticket-head">
        <div>
          <span className="muted small">{t('Booking code')}</span>
          <h1 className="code">{b.code}</h1>
          <p>
            <b>{b.trip.route.name}</b><br />
            {fmtDate(b.trip.departure, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {fmtTime(b.trip.departure)} → {fmtTime(b.trip.arrival)}<br />
            {b.trip.train.name} · {b.tickets.length} {t('passengers')} · {t('Total')} {fmtMoney(b.total)}
          </p>
        </div>
        <div className="ticket-actions no-print">
          <button className="btn" onClick={() => window.print()}><Printer size={16} aria-hidden /> {t('Print / PDF')}</button>
          {b.status !== 'CANCELLED' && !b.trip.departed && (
            confirmCancel
              ? <button className="btn btn--danger" onClick={cancel}><XCircle size={16} aria-hidden /> {t('Yes, cancel all tickets')}</button>
              : <button className="btn" onClick={() => setConfirmCancel(true)}>{t('Cancel booking')}</button>
          )}
        </div>
      </header>

      <section className="card ticket-route">
        <h2>{t('Route and stops')}</h2>
        <RouteStops stops={b.trip.route.stops} departure={b.trip.departure} label={`${t('Route and stops')}: ${b.trip.route.name}`} />
      </section>

      <section className="card find-wagon">
        <h2>{t('Find your wagon')}</h2>
        <p className="muted small">{t('The locomotive is at the front. Your wagons are highlighted – count from the locomotive.')}</p>
        <TrainStrip color={b.trip.train.color} wagons={b.trip.wagons} highlight={b.tickets[0]?.wagonNumber ?? undefined} />
      </section>

      <div className="ticket-grid">
        {b.tickets.map((tk, i) => (
          <article key={tk.id} className={`ticket${tk.status !== 'VALID' ? ' is-inactive' : ''}`}>
            <div className="ticket-top" style={{ background: b.trip.train.color }}>
              <span>{t('Ticket')} {i + 1}/{b.tickets.length}</span>
              <span>{b.trip.route.code}</span>
            </div>
            <div className="ticket-body">
              <Qr text={`RTT:${tk.token}`} />
              <div className="ticket-seat">
                <div><span className="muted small">{t('Wagon')}</span><b>{tk.wagonNumber}</b></div>
                <div><span className="muted small">{t(tk.seatType === 'BERTH' ? 'Berth' : 'Seat')}</span><b>{tk.seatLabel}</b></div>
                <div><span className="muted small">{t('Time')}</span><b>{fmtTime(b.trip.departure)}</b></div>
              </div>
              <p className="small">{t(tk.passengerType === 'ADULT' ? 'Adult' : tk.passengerType === 'CHILD' ? 'Child (6-14)' : tk.passengerType === 'STUDENT' ? 'Student' : 'Senior (65+)')} · {fmtMoney(tk.price)}</p>
              <p className="small muted">{tk.attrs.filter((a) => SEAT_ATTRS[a]).map((a) => t(SEAT_ATTRS[a])).join(' · ')}</p>
              {statusBadge(tk)}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function ManageBooking() {
  const t = useT();
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  let mine: Array<{ code: string; email: string; departure: string; route: string }> = [];
  try { mine = JSON.parse(localStorage.getItem('myBookings') ?? '[]'); } catch { /* ignore */ }
  return (
    <div className="page page--narrow">
      <h1>{t('My tickets')}</h1>
      {mine.length > 0 && (
        <ul className="my-list">
          {mine.map((m) => (
            <li key={m.code}><Link to={`/ticket/${m.code}?email=${encodeURIComponent(m.email)}`}><b>{m.code}</b> · {m.route} · {m.departure.replace('T', ' ')}</Link></li>
          ))}
        </ul>
      )}
      <form className="card form" onSubmit={(e) => { e.preventDefault(); nav(`/ticket/${code.trim().toUpperCase()}?email=${encodeURIComponent(email.trim())}`); }}>
        <h2>{t('Find a booking')}</h2>
        <label>{t('Booking code')}<input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD2345" maxLength={8} /></label>
        <label>{t('Email')}<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <button className="btn btn--primary">{t('Show tickets')}</button>
      </form>
    </div>
  );
}
