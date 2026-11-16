import { TrainFront } from 'lucide-react';
import { AMENITIES, AmenityList, mainAmenity } from '../amenities';
import { useT } from '../i18n';

export interface StripWagon {
  number: number; kind: string; classLabel: string; amenities: string[]; bookable: boolean;
  free?: number; capacity?: number; mine?: number; name?: string;
}

interface Props {
  wagons: StripWagon[];
  color: string;
  active?: number;
  onSelect?: (n: number) => void;
  compact?: boolean;
  highlight?: number;
  locoName?: string;
}

/** The whole train seen from the side: locomotive first (direction of travel is to the left). */
export function TrainStrip({ wagons, color, active, onSelect, compact, highlight, locoName }: Props) {
  const t = useT();
  return (
    <div className={`strip${compact ? ' strip--compact' : ''}`} role={onSelect ? 'tablist' : 'list'} aria-label={t('Train composition')}>
      <div className="strip-loco" style={{ ['--c' as string]: color }} title={locoName ?? t('Locomotive')} role="listitem">
        <TrainFront size={compact ? 14 : 22} aria-hidden />
        {!compact && <span className="sr-only">{t('Locomotive')}</span>}
      </div>
      {wagons.map((w) => {
        const main = mainAmenity(w.kind, w.amenities);
        const Icon = AMENITIES[main]?.icon;
        const ratio = w.capacity ? (w.free ?? 0) / w.capacity : 0;
        const level = !w.bookable ? 'na' : w.free === undefined ? 'high' : ratio === 0 ? 'full' : ratio < 0.25 ? 'low' : ratio < 0.6 ? 'mid' : 'high';
        const cls = `strip-wagon strip-wagon--${level}${active === w.number ? ' is-active' : ''}${highlight === w.number ? ' is-highlight' : ''}`;
        const label = `${t('Wagon')} ${w.number}${w.classLabel ? `, ${t('class')} ${w.classLabel}` : ''}, ${t(w.name ?? AMENITIES[main]?.label ?? '')}${
          !w.bookable ? `, ${t('not bookable')}` : w.free !== undefined && w.capacity ? `, ${w.free}/${w.capacity} ${t('free')}` : ''}`;
        const body = (
          <>
            <span className="strip-top">
              <b>{w.number}</b>
              {w.classLabel && <span className="strip-class">{w.classLabel}</span>}
            </span>
            {Icon && <Icon size={compact ? 13 : 20} className="strip-icon" style={{ color: AMENITIES[main].color }} aria-hidden />}
            {!compact && <AmenityList codes={w.amenities.filter((a) => a !== main)} size={12} max={4} />}
            {!compact && w.bookable && w.free !== undefined && w.capacity !== undefined && (
              <span className="strip-occ" aria-hidden>
                <span style={{ width: `${(1 - ratio) * 100}%` }} />
              </span>
            )}
            {!compact && (
              <span className="strip-free">{w.bookable ? (w.capacity === undefined ? '' : w.free === undefined ? `${w.capacity} ${t('places')}` : `${w.free}/${w.capacity}`) : t('no seats')}</span>
            )}
            {!!w.mine && <span className="strip-mine" aria-label={`${w.mine} ${t('selected')}`}>{w.mine}</span>}
          </>
        );
        return onSelect ? (
          <button key={w.number} className={cls} onClick={() => onSelect(w.number)} role="tab" aria-selected={active === w.number} aria-label={label} title={label}>
            {body}
          </button>
        ) : (
          <div key={w.number} className={cls} role="listitem" aria-label={label} title={label}>{body}</div>
        );
      })}
    </div>
  );
}
