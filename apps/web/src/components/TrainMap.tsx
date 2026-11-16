import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Cell, SeatState, Train, Wagon } from '../types';
import { TrainStrip } from './TrainStrip';
import { WagonPlan } from './WagonPlan';
import { AmenityList } from '../amenities';
import { useT } from '../i18n';

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(1000);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

interface Props {
  train: Train;
  active: number;
  setActive: (n: number) => void;
  stateOf: (key: string) => SeatState;
  onSeat?: (cell: Cell, key: string) => void;
  dimmed?: (cell: Cell, wagon: Wagon) => boolean;
  describe?: (cell: Cell, key: string, wagon: Wagon) => ReactNode;
  highlight?: Set<string>;
  stats?: Record<number, { free: number; capacity: number; mine?: number }>;
  legend?: SeatState[];
  wagonExtra?: (w: Wagon) => ReactNode;
  selectAny?: boolean;
}

export function TrainMap({ train, active, setActive, stateOf, onSeat, dimmed, describe, highlight, stats, legend = ['free', 'selected', 'held', 'sold'], wagonExtra, selectAny }: Props) {
  const t = useT();
  const [ref, width] = useWidth<HTMLDivElement>();
  const wagon = train.wagons.find((w) => w.number === active) ?? train.wagons[0];
  const vertical = width < 640;
  const layout = wagon.layoutData!;
  // fit the whole coach into the column on desktop; rotate it on narrow screens
  const scale = vertical
    ? Math.max(34, Math.min(42, (width - 32) / (layout.width + 1.5)))
    : Math.max(22, Math.min(31, (width - 8) / (layout.length + 1.5)));
  const idx = train.wagons.indexOf(wagon);
  const free = stats?.[wagon.id]?.free;

  return (
    <section className="train-map" ref={ref} aria-label={t('Seat plan')}>
      <div className="map-row map-row--seq">
        <div className="seq-label">
          <span className="eyebrow">{t('Train composition')}</span>
          <span className="direction">← {t('Direction of travel')}</span>
        </div>
        <TrainStrip
          color={train.color}
          locoName={train.locomotive}
          active={wagon.number}
          onSelect={setActive}
          wagons={train.wagons.map((w) => ({ ...w, free: stats?.[w.id]?.free, capacity: stats?.[w.id]?.capacity ?? w.capacity, mine: stats?.[w.id]?.mine }))}
        />
      </div>

      <div className="map-row coach-bar">
        <button className="icon-btn" onClick={() => setActive(train.wagons[idx - 1].number)} disabled={idx === 0} aria-label={t('Previous wagon')}>
          <ChevronLeft size={16} />
        </button>
        <h3 className="coach-title">
          {t('Wagon')} {wagon.number}
          <span className="coach-meta">
            {wagon.classLabel && <> · {t('Class')} {wagon.classLabel}</>} · {t(wagon.name)}
          </span>
        </h3>
        {layout.bookable && free !== undefined && <span className="coach-count">{free} {t('free seats')}</span>}
        <button className="icon-btn" onClick={() => setActive(train.wagons[idx + 1].number)} disabled={idx === train.wagons.length - 1} aria-label={t('Next wagon')}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className={`plan-scroll${vertical ? ' plan-scroll--v' : ''}`}>
        <WagonPlan
          key={wagon.id}
          layout={layout}
          wagonId={wagon.id}
          wagonNumber={wagon.number}
          vertical={vertical}
          scale={scale}
          stateOf={stateOf}
          onSeat={onSeat}
          dimmed={dimmed ? (c) => dimmed(c, wagon) : undefined}
          describe={describe ? (c, k) => describe(c, k, wagon) : undefined}
          highlight={highlight}
          selectAny={selectAny}
          ariaLabel={`${t('Seat plan')} – ${t('Wagon')} ${wagon.number}`}
        />
      </div>

      {layout.bookable ? (
        <ul className="legend" aria-label={t('Legend')}>
          {legend.map((s) => (
            <li key={s}><span className={`legend-swatch sw--${s}`} />{t(`seat_${s}`)}</li>
          ))}
          <li><span className="legend-swatch sw--back" />{t('Backrest')}</li>
        </ul>
      ) : (
        <p className="map-note">{t('This wagon has no reservable seats. It is open to all passengers of the train.')}</p>
      )}

      <div className="map-row coach-info">
        <dl className="info-dl">
          <dt>{t('Facilities')}</dt>
          <dd><AmenityList codes={wagon.amenities} withLabel /></dd>
          <dt>{t('About this coach')}</dt>
          <dd>{t(wagon.description)}</dd>
          {wagonExtra?.(wagon)}
        </dl>
      </div>
    </section>
  );
}
