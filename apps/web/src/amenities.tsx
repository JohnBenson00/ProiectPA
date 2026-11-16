import {
  Accessibility, Armchair, Baby, Bed, BedDouble, Bike, Coffee, Dog, Flame, Headphones, Luggage, Mountain,
  PlugZap, Snowflake, Toilet, Users, UtensilsCrossed, VolumeX, Wifi, type LucideIcon,
} from 'lucide-react';
import { useT } from './i18n';

export const AMENITIES: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  SLEEPING: { icon: Bed, label: 'Sleeping compartments', color: '#6d28d9' },
  COUCHETTE: { icon: BedDouble, label: 'Couchettes', color: '#7c3aed' },
  DINING: { icon: UtensilsCrossed, label: 'Restaurant', color: '#b45309' },
  BAR: { icon: Coffee, label: 'Bar & snacks', color: '#92400e' },
  FIRST_CLASS: { icon: Armchair, label: '1st class', color: '#a16207' },
  PANORAMIC: { icon: Mountain, label: 'Panoramic windows', color: '#0f766e' },
  AUDIO_GUIDE: { icon: Headphones, label: 'Audio guide', color: '#0e7490' },
  WHEELCHAIR: { icon: Accessibility, label: 'Wheelchair spaces', color: '#1d4ed8' },
  WC_ACCESSIBLE: { icon: Toilet, label: 'Accessible toilet', color: '#1d4ed8' },
  WC: { icon: Toilet, label: 'Toilet', color: '#475569' },
  STROLLER: { icon: Baby, label: 'Stroller space', color: '#db2777' },
  FAMILY: { icon: Users, label: 'Family zone', color: '#db2777' },
  BIKE: { icon: Bike, label: 'Bicycles', color: '#15803d' },
  PETS: { icon: Dog, label: 'Pets allowed', color: '#65a30d' },
  QUIET: { icon: VolumeX, label: 'Quiet zone', color: '#334155' },
  AC: { icon: Snowflake, label: 'Air conditioning', color: '#0284c7' },
  HEATING: { icon: Flame, label: 'Heating', color: '#dc2626' },
  POWER: { icon: PlugZap, label: 'Power sockets', color: '#ca8a04' },
  WIFI: { icon: Wifi, label: 'Wi-Fi', color: '#2563eb' },
  LUGGAGE: { icon: Luggage, label: 'Luggage racks', color: '#57534e' },
};

export const SEAT_ATTRS: Record<string, string> = {
  WINDOW: 'Window', AISLE: 'Aisle', MIDDLE: 'Middle', FORWARD: 'Facing forward', BACKWARD: 'Facing backward',
  TABLE: 'Table', QUIET: 'Quiet zone', NEAR_WC: 'Near toilet', COMPARTMENT: 'Compartment',
  BERTH_LOWER: 'Lower berth', BERTH_MIDDLE: 'Middle berth', BERTH_UPPER: 'Upper berth',
  ACCESSIBLE: 'Accessible', PANORAMIC: 'Panoramic', SOLO: 'Single seat', FAMILY: 'Family zone', NEAR_DINING: 'Near restaurant',
};

/** The amenity that best describes a wagon (used as its main icon). */
export function mainAmenity(kind: string, amenities: string[]): string {
  const byKind: Record<string, string> = { SLEEPER: 'SLEEPING', COUCHETTE: 'COUCHETTE', DINING: 'DINING', PANORAMIC: 'PANORAMIC', MULTI: 'WHEELCHAIR', COMPARTMENT: 'FIRST_CLASS' };
  return byKind[kind] ?? (amenities.includes('QUIET') ? 'QUIET' : 'WIFI');
}

export function AmenityIcon({ code, size = 16, withLabel = false }: { code: string; size?: number; withLabel?: boolean }) {
  const t = useT();
  const a = AMENITIES[code];
  if (!a) return null;
  const Icon = a.icon;
  return (
    <span className={withLabel ? 'amenity amenity--label' : 'amenity'} title={t(a.label)} style={{ ['--a' as string]: a.color }}>
      <Icon size={size} aria-hidden />
      {withLabel ? <span>{t(a.label)}</span> : <span className="sr-only">{t(a.label)}</span>}
    </span>
  );
}

export function AmenityList({ codes, size = 16, withLabel = false, max }: { codes: string[]; size?: number; withLabel?: boolean; max?: number }) {
  const shown = max ? codes.slice(0, max) : codes;
  return (
    <span className="amenity-list">
      {shown.map((c) => <AmenityIcon key={c} code={c} size={size} withLabel={withLabel} />)}
      {max && codes.length > max ? <span className="amenity-more">+{codes.length - max}</span> : null}
    </span>
  );
}
