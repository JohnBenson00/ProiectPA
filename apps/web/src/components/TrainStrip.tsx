import { AMENITIES, mainAmenity } from '../amenities';
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

/** Coach sequence (side view): locomotive first, direction of travel to the left. */
export function TrainStrip({ wagons, active, onSelect, compact, highlight, locoName }: Props) {
  const t = useT();
  return (
    <div className={`coaches${compact ? ' coaches--compact' : ''}`} role={onSelect ? 'tablist' : 'list'} aria-label={t('Train composition')}>
      <div className="coach-loco" title={locoName ?? t('Locomotive')} role="listitem" aria-label={t('Locomotive')} />
      {wagons.map((w) => {
        const main = mainAmenity(w.kind, w.amenities);
        const Icon = AMENITIES[main]?.icon;
        const known = w.free !== undefined && w.capacity !== undefined;
        const ratio = known && w.capacity ? w.free! / w.capacity : 1;
        const full = w.bookable && known && w.free === 0;
        const cls = `coach${w.classLabel === '1' ? ' coach--first' : ''}${!w.bookable ? ' coach--na' : ''}${full ? ' coach--full' : ''}${active === w.number ? ' is-active' : ''}${highlight === w.number ? ' is-highlight' : ''}`;
        const typeLabel = t(w.name ?? AMENITIES[main]?.label ?? '');
        const label = `${t('Wagon')} ${w.number}${w.classLabel ? `, ${t('class')} ${w.classLabel}` : ''}, ${typeLabel}${
          !w.bookable ? `, ${t('not bookable')}` : known ? `, ${w.free} ${t('free seats')}` : ''}`;
        const body = (
          <>
            <span className="coach-head">
              <span className="coach-no">{w.number}</span>
              {w.classLabel && <span className="coach-cls" aria-hidden>{w.classLabel}</span>}
            </span>
            {Icon && <Icon size={compact ? 12 : 15} className="coach-icon" strokeWidth={1.7} aria-hidden />}
            {!compact && (
              <span className="coach-free">
                {!w.bookable ? t('no seats') : known ? `${w.free} ${t('free')}` : w.capacity !== undefined ? `${w.capacity} ${t('places')}` : ''}
              </span>
            )}
            {!compact && w.bookable && known && (
              <span className="coach-occ" aria-hidden><span style={{ width: `${(1 - ratio) * 100}%` }} /></span>
            )}
            {!!w.mine && <span className="coach-mine" aria-hidden>{w.mine}</span>}
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
