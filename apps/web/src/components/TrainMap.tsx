import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const vertical = width < 720;
  const layout = wagon.layoutData!;
  const scale = vertical ? Math.max(36, Math.min(58, (width - 40) / (layout.width + 1))) : undefined;
  const idx = train.wagons.indexOf(wagon);

  return (
    <div className="train-map" ref={ref}>
      <div className="direction"><ArrowLeft size={14} aria-hidden /> {t('Direction of travel')}</div>
      <TrainStrip
        color={train.color}
        locoName={train.locomotive}
        active={wagon.number}
        onSelect={setActive}
        wagons={train.wagons.map((w) => ({ ...w, free: stats?.[w.id]?.free, capacity: stats?.[w.id]?.capacity ?? w.capacity, mine: stats?.[w.id]?.mine }))}
      />

      <div className="wagon-head">
        <button className="icon-btn" onClick={() => setActive(train.wagons[idx - 1].number)} disabled={idx === 0} aria-label={t('Previous wagon')}>
          <ChevronLeft size={18} />
        </button>
        <div className="wagon-title">
          <h3>
            {t('Wagon')} {wagon.number}
            {wagon.classLabel && <span className="badge">{t('class')} {wagon.classLabel}</span>}
          </h3>
          <span className="muted">{t(wagon.name)}</span>
        </div>
        <button className="icon-btn" onClick={() => setActive(train.wagons[idx + 1].number)} disabled={idx === train.wagons.length - 1} aria-label={t('Next wagon')}>
          <ChevronRight size={18} />
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

      {layout.bookable && (
        <div className="legend" aria-label={t('Legend')}>
          {legend.map((s) => (
            <span key={s} className="legend-item"><span className={`legend-swatch seat--${s}`} />{t(`seat_${s}`)}</span>
          ))}
          <span className="legend-item"><span className="legend-swatch legend-back" />{t('Backrest (seat faces away from it)')}</span>
        </div>
      )}

      <div className="wagon-info">
        <p>{t(wagon.description)}</p>
        <AmenityList codes={wagon.amenities} withLabel />
        {!layout.bookable && <p className="note">{t('This wagon has no reservable seats. It is open to all passengers of the train.')}</p>}
        {wagonExtra?.(wagon)}
      </div>
    </div>
  );
}
