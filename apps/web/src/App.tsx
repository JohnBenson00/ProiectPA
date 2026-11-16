import { lazy, Suspense } from 'react';
import { NavLink, Route, Routes, Link } from 'react-router-dom';
import { Ticket, TrainFront, Shield } from 'lucide-react';
import { Home } from './pages/Home';
import { Book } from './pages/Book';
import { TicketPage, ManageBooking } from './pages/Ticket';
import { Trains, TrainInfo } from './pages/Trains';
import { useLang, useT } from './i18n';

const Admin = lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m.Admin })));

export function App() {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <>
      <a href="#main" className="skip">{t('Skip to content')}</a>
      <header className="topbar no-print">
        <Link to="/" className="brand" aria-label="Râșnov Trains">
          <img src="/favicon.svg" width={28} height={28} alt="" />
          <span>Râșnov <b>Trains</b></span>
        </Link>
        <nav className="topnav" aria-label={t('Main')}>
          <NavLink to="/" end>{t('Departures')}</NavLink>
          <NavLink to="/trains"><TrainFront size={15} aria-hidden /> {t('Trains')}</NavLink>
          <NavLink to="/booking"><Ticket size={15} aria-hidden /> {t('My tickets')}</NavLink>
          <NavLink to="/admin"><Shield size={15} aria-hidden /> {t('Staff')}</NavLink>
        </nav>
        <div className="lang" role="group" aria-label={t('Language')}>
          {(['ro', 'en'] as const).map((l) => (
            <button key={l} aria-pressed={lang === l} className={lang === l ? 'is-on' : ''} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
          ))}
        </div>
      </header>
      <div id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/book/:id" element={<Book />} />
          <Route path="/ticket/:code" element={<TicketPage />} />
          <Route path="/booking" element={<ManageBooking />} />
          <Route path="/trains" element={<Trains />} />
          <Route path="/trains/:id" element={<TrainInfo />} />
          <Route path="/admin/*" element={<Suspense fallback={<div className="page"><div className="skeleton" /></div>}><Admin /></Suspense>} />
          <Route path="*" element={<div className="page"><h1>404</h1><Link to="/">{t('Departures')}</Link></div>} />
        </Routes>
      </div>
      <footer className="footer no-print">
        <span>Râșnov Trains · {t('Student project prototype – prices and payments are fictional.')}</span>
      </footer>
    </>
  );
}
