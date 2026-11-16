import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { api, fmtTime } from '../../api';
import type { TripSummary } from '../../types';
import { useT } from '../../i18n';

interface ScanResult {
  result: 'OK' | 'USED' | 'WRONG_TRIP' | 'CANCELLED' | 'INVALID';
  message: string;
  tickets?: Array<{ name: string; seatLabel: string; wagonNumber: number; passengerType: string; result: string; message: string; departure: string; route: string }>;
}

export function Scanner() {
  const t = useT();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [tripId, setTripId] = useState('');
  const [manual, setManual] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<Array<ScanResult & { at: string }>>([]);
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState('');
  const qr = useRef<Html5Qrcode | null>(null);
  const last = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const tripRef = useRef(tripId);
  tripRef.current = tripId;

  useEffect(() => {
    api('/api/meta').then((m) => api<TripSummary[]>(`/api/admin/trips?date=${m.today}`)).then((list) => {
      setTrips(list);
      const now = new Date().toTimeString().slice(0, 5);
      const next = list.find((x) => x.status === 'SCHEDULED' && x.departure.slice(11) >= now);
      if (next) setTripId(String(next.id));
    });
    return () => { qr.current?.isScanning && qr.current.stop().catch(() => {}); };
  }, []);

  const check = async (input: string) => {
    if (!input.trim()) return;
    try {
      const r = await api<ScanResult>('/api/admin/scan', { method: 'POST', body: { input, tripId: tripRef.current ? Number(tripRef.current) : null } });
      setResult(r);
      setHistory((h) => [{ ...r, at: new Date().toTimeString().slice(0, 8) }, ...h].slice(0, 15));
      try { navigator.vibrate?.(r.result === 'OK' ? 80 : [80, 60, 80]); } catch { /* not supported */ }
    } catch (e) {
      setResult({ result: 'INVALID', message: (e as Error).message });
    }
  };

  const startCam = async () => {
    setCamErr('');
    try {
      qr.current ??= new Html5Qrcode('qr-reader');
      await qr.current.start({ facingMode: 'environment' }, { fps: 10, qrbox: 230 }, (text) => {
        const now = Date.now();
        if (text === last.current.text && now - last.current.at < 4000) return; // same code still in view
        last.current = { text, at: now };
        check(text);
      }, () => {});
      setCamOn(true);
    } catch (e) {
      setCamErr(t('Camera not available. Allow camera access or type the booking code below.'));
    }
  };
  const stopCam = async () => { await qr.current?.stop().catch(() => {}); setCamOn(false); };

  const Icon = result?.result === 'OK' ? CheckCircle2 : result?.result === 'USED' || result?.result === 'WRONG_TRIP' ? AlertTriangle : XCircle;

  return (
    <div className="scanner">
      <div className="card">
        <label>{t('Boarding for departure')}
          <select value={tripId} onChange={(e) => setTripId(e.target.value)}>
            <option value="">{t('Any departure today')}</option>
            {trips.map((x) => <option key={x.id} value={x.id}>{fmtTime(x.departure)} · {x.route.code} · {x.train.name}</option>)}
          </select>
        </label>
        <div id="qr-reader" className={`qr-reader${camOn ? ' is-on' : ''}`} />
        {camErr && <p className="error small">{camErr}</p>}
        <button className="btn btn--primary btn--block" onClick={camOn ? stopCam : startCam}>
          {camOn ? <><CameraOff size={18} aria-hidden /> {t('Stop camera')}</> : <><Camera size={18} aria-hidden /> {t('Scan with camera')}</>}
        </button>
        <form className="manual" onSubmit={(e) => { e.preventDefault(); check(manual); setManual(''); }}>
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t('Booking code or ticket code')} aria-label={t('Booking code or ticket code')} />
          <button className="btn">{t('Check')}</button>
        </form>
      </div>

      {result && (
        <div className={`scan-result scan-result--${result.result}`} role="alert">
          <Icon size={48} aria-hidden />
          <h2>{t(`scan_${result.result}`)}</h2>
          {!result.tickets && <p>{t(result.message)}</p>}
          {result.tickets && result.tickets.length > 1 && <p>{t('{ok}/{n} passengers boarded', { ok: result.tickets.filter((x) => x.result === 'OK').length, n: result.tickets.length })}</p>}
          {result.tickets?.map((tk, i) => (
            <p key={i} className="scan-ticket">
              <b>{t('Wagon')} {tk.wagonNumber} · {tk.seatLabel}</b> · {tk.name} · {t(tk.passengerType)}
              {tk.result !== 'OK' && <><br /><span className="small">{t(`scan_${tk.result}`)}{tk.result === 'WRONG_TRIP' ? `: ${tk.route}, ${tk.departure.replace('T', ' ')}` : ''}{tk.result === 'USED' ? ` (${tk.message.replace(/^Already used at /, '').replace(/\.$/, '')})` : ''}</span></>}
            </p>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="card">
          <h3>{t('Last scans')}</h3>
          <ul className="history">
            {history.map((h, i) => (
              <li key={i}><span className={`dot dot--${h.result}`} /> {h.at} · {t(`scan_${h.result}`)} {h.tickets?.[0] ? `· ${h.tickets[0].name} (${t('W')}${h.tickets[0].wagonNumber}/${h.tickets[0].seatLabel})` : ''}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
