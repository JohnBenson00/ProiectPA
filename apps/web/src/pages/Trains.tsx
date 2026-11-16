import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Armchair, TrainFront } from 'lucide-react';
import { api } from '../api';
import type { Route, Train } from '../types';
import { TrainStrip } from '../components/TrainStrip';
import { WagonPlan } from '../components/WagonPlan';
import { useWidth } from '../components/TrainMap';
import { AMENITIES, AmenityList } from '../amenities';
import { useT } from '../i18n';

export function Trains() {
  const t = useT();
  const [trains, setTrains] = useState<Train[]>([]);
  useEffect(() => { api<Train[]>('/api/trains').then(setTrains); }, []);
  return (
    <div className="page">
      <h1>{t('Our trains')}</h1>
      <p className="muted">{t('Every train is drawn wagon by wagon, so you know exactly where the restaurant, the sleeping cars or the bike space are.')}</p>
      <div className="train-cards">
        {trains.map((tr) => (
          <Link key={tr.id} to={`/trains/${tr.id}`} className="card train-card">
            <h2><span className="train-dot" style={{ background: tr.color }} /> {tr.name} <span className="muted small">{tr.code} · {t(tr.kind)}</span></h2>
            <p>{t(tr.description)}</p>
            <TrainStrip color={tr.color} wagons={tr.wagons} />
            <p className="muted small"><Armchair size={14} aria-hidden /> {tr.capacity} {t('places')} · {tr.wagons.length} {t('wagons')}</p>
          </Link>
        ))}
      </div>
      <section className="card">
        <h2>{t('Icon legend')}</h2>
        <div className="legend-grid">
          {Object.keys(AMENITIES).map((k) => <AmenityList key={k} codes={[k]} withLabel />)}
        </div>
      </section>
    </div>
  );
}

export function TrainInfo() {
  const t = useT();
  const { id } = useParams();
  const [tr, setTr] = useState<(Train & { routes: Route[] }) | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  useEffect(() => { api(`/api/trains/${id}`).then(setTr); }, [id]);
  if (!tr) return <div className="page"><div className="skeleton" style={{ height: 300 }} /></div>;
  const amen = [...new Set(tr.wagons.flatMap((w) => w.amenities))];
  const scale = Math.min(26, (width - 24) / 34);
  return (
    <div className="page" ref={ref}>
      <Link to="/trains" className="muted small">← {t('All trains')}</Link>
      <h1><span className="train-dot" style={{ background: tr.color }} /> {tr.name} <span className="muted small">{tr.code}</span></h1>
      <p>{t(tr.description)}</p>
      <div className="facts">
        <div><span className="muted small">{t('Type')}</span><b>{t(tr.kind)}</b></div>
        <div><span className="muted small">{t('Locomotive')}</span><b><TrainFront size={14} aria-hidden /> {tr.locomotive}</b></div>
        <div><span className="muted small">{t('Capacity')}</span><b>{tr.capacity} {t('places')}</b></div>
        <div><span className="muted small">{t('Routes')}</span><b>{tr.routes.map((r) => r.code).join(', ')}</b></div>
      </div>
      <h2>{t('On board')}</h2>
      <AmenityList codes={amen} withLabel />
      <h2>{t('Composition')}</h2>
      <TrainStrip color={tr.color} wagons={tr.wagons} />
      <div className="wagon-gallery">
        {tr.wagons.map((w) => (
          <section key={w.id} className="card">
            <h3>{t('Wagon')} {w.number} · {t(w.name)} {w.classLabel && <span className="badge">{t('class')} {w.classLabel}</span>}</h3>
            <p className="muted small">{t(w.description)} {w.bookable ? `· ${w.capacity} ${t('places')}` : ''}</p>
            <AmenityList codes={w.amenities} size={14} withLabel />
            <div className="plan-scroll">
              <WagonPlan layout={w.layoutData!} wagonId={w.id} wagonNumber={w.number} stateOf={() => 'free'} scale={scale} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
