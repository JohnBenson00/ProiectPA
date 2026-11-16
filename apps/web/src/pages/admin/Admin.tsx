import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { CalendarClock, LayoutDashboard, LogOut, ScanLine, TrainFront } from 'lucide-react';
import { api, getStaffToken } from '../../api';
import { useT } from '../../i18n';
import { Departures } from './Departures';
import { Occupancy } from './Occupancy';
import { Scanner } from './Scanner';
import { Schedule } from './Schedule';
import { Fleet } from './Fleet';

export interface StaffUser { id: number; role: 'ADMIN' | 'CONDUCTOR'; name: string }

export function useStaff(): StaffUser | null {
  try { return JSON.parse(localStorage.getItem('staffUser') ?? 'null'); } catch { return null; }
}

function Login({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="page page--narrow">
      <form className="card form" onSubmit={async (e) => {
        e.preventDefault();
        try {
          const r = await api('/api/auth/login', { method: 'POST', body: { username: u, password: p } });
          localStorage.setItem('staffToken', r.token);
          localStorage.setItem('staffUser', JSON.stringify(r.user));
          onDone();
        } catch (x) { setErr(t((x as Error).message)); }
      }}>
        <h1>{t('Staff login')}</h1>
        <label>{t('Username')}<input autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} required /></label>
        <label>{t('Password')}<input type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} required /></label>
        {err && <p className="error">{err}</p>}
        <button className="btn btn--primary">{t('Log in')}</button>
        <p className="muted small">Demo: <code>admin / admin123</code> · <code>conductor / conductor123</code></p>
      </form>
    </div>
  );
}

export function Admin() {
  const t = useT();
  const nav = useNavigate();
  const [, force] = useState(0);
  const user = useStaff();
  useEffect(() => {
    const onUnauthorized = () => { localStorage.removeItem('staffToken'); force((x) => x + 1); };
    window.addEventListener('staff-unauthorized', onUnauthorized);
    return () => window.removeEventListener('staff-unauthorized', onUnauthorized);
  }, []);
  if (!getStaffToken() || !user) return <Login onDone={() => force((x) => x + 1)} />;
  const isAdmin = user.role === 'ADMIN';
  const tab = (to: string, icon: ReactNode, label: string) => (
    <NavLink to={to} end className={({ isActive }) => `admin-tab${isActive ? ' is-active' : ''}`}>{icon} {t(label)}</NavLink>
  );
  return (
    <div className="page page--wide">
      <div className="admin-bar">
        <nav className="admin-tabs" aria-label={t('Admin sections')}>
          {tab('/admin', <LayoutDashboard size={16} aria-hidden />, 'Departures')}
          {tab('/admin/scan', <ScanLine size={16} aria-hidden />, 'Scanner')}
          {isAdmin && tab('/admin/schedule', <CalendarClock size={16} aria-hidden />, 'Schedule')}
          {isAdmin && tab('/admin/fleet', <TrainFront size={16} aria-hidden />, 'Fleet')}
        </nav>
        <span className="muted small">{user.name} ({t(user.role)})</span>
        <button className="btn btn--small" onClick={() => { localStorage.removeItem('staffToken'); localStorage.removeItem('staffUser'); nav('/admin'); force((x) => x + 1); }}>
          <LogOut size={14} aria-hidden /> {t('Log out')}
        </button>
      </div>
      <Routes>
        <Route index element={<Departures isAdmin={isAdmin} />} />
        <Route path="trip/:id" element={<Occupancy isAdmin={isAdmin} />} />
        <Route path="scan" element={<Scanner />} />
        {isAdmin && <Route path="schedule" element={<Schedule />} />}
        {isAdmin && <Route path="fleet" element={<Fleet />} />}
        <Route path="*" element={<p>{t('Not found')} – <Link to="/admin">{t('Departures')}</Link></p>} />
      </Routes>
    </div>
  );
}
