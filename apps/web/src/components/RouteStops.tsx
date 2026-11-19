import type { Route } from '../types';
import { useT } from '../i18n';

interface Props {
  stops: Route['stops'];
  /** departure 'YYYY-MM-DDTHH:MM': shows the clock time at every stop; without it, minutes from the start */
  departure?: string;
  /** accessible name of the list */
  label?: string;
}

/** clock time `min` minutes after `departure`, plus how many days later it is */
function at(departure: string, min: number) {
  const d = new Date(departure + ':00Z');
  d.setUTCMinutes(d.getUTCMinutes() + min);
  const days = Math.round((Date.parse(d.toISOString().slice(0, 10)) - Date.parse(departure.slice(0, 10))) / 86400000);
  return { time: d.toISOString().slice(11, 16), days };
}

/**
 * Route line in the style of railway timetables: a dot per stop, terminal stops filled.
 * Horizontal on wide screens, a vertical list on phones (CSS).
 */
export function RouteStops({ stops, departure, label }: Props) {
  const t = useT();
  if (!stops?.length) return null;
  return (
    <ol className="stops" aria-label={label ?? t('Route and stops')}>
      {stops.map((s, i) => {
        const terminal = i === 0 || i === stops.length - 1;
        const when = departure ? at(departure, s.min) : null;
        return (
          <li key={`${s.name}-${i}`} className={`stop${terminal ? ' stop--terminal' : ''}`}>
            <span className="stop-dot" aria-hidden />
            <span className="stop-time tabular">
              {when ? when.time : i === 0 ? t('departure') : `${s.min} min`}
              {when && when.days > 0 && <sup className="stop-day" title={t('next day')}>+{when.days}</sup>}
            </span>
            <span className="stop-name">{s.name}</span>
          </li>
        );
      })}
    </ol>
  );
}
