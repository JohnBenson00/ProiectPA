import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Accessibility } from 'lucide-react';
import type { Cell, Layout, SeatState } from '../types';
import { useT } from '../i18n';
import { SEAT_ATTRS } from '../amenities';

const BOOKABLE = new Set(['SEAT', 'BERTH', 'WHEELCHAIR']);
const CORRIDOR_KINDS = new Set(['COMPARTMENT', 'COUCHETTE', 'SLEEPER']);

export interface WagonPlanProps {
  layout: Layout;
  wagonId: number;
  wagonNumber: number;
  stateOf: (key: string) => SeatState;
  onSeat?: (cell: Cell, key: string) => void;
  dimmed?: (cell: Cell) => boolean;
  highlight?: Set<string>;
  describe?: (cell: Cell, key: string) => ReactNode;
  vertical?: boolean;
  scale?: number;
  ariaLabel?: string;
  /** staff mode: every seat can be clicked (sold, blocked...) */
  selectAny?: boolean;
}

type Box = { X: number; Y: number; W: number; H: number };
type Span = { x: number; w: number };

/** Merge x-intervals that touch, so windows follow seat rows / compartments. */
function mergeSpans(spans: Span[], gap = 0.25): Span[] {
  const sorted = [...spans].sort((a, b) => a.x - b.x);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.x <= last.x + last.w + gap) last.w = Math.max(last.w, s.x + s.w - last.x);
    else out.push({ ...s });
  }
  return out;
}

export function WagonPlan({ layout, wagonId, wagonNumber, stateOf, onSeat, dimmed, highlight, describe, vertical = false, scale, ariaLabel, selectAny }: WagonPlanProps) {
  const t = useT();
  const uid = useId().replace(/:/g, '');
  const S = scale ?? (vertical ? 44 : 30);
  const PAD = 0.75;
  const L = layout.length, Wd = layout.width;
  const width = (vertical ? Wd : L) * S + PAD * 2 * S;
  const height = (vertical ? L : Wd) * S + PAD * 2 * S;
  const box = (c: { x: number; y: number; w: number; h: number }): Box =>
    vertical
      ? { X: (PAD + Wd - c.y - c.h) * S, Y: (PAD + c.x) * S, W: c.h * S, H: c.w * S }
      : { X: (PAD + c.x) * S, Y: (PAD + c.y) * S, W: c.w * S, H: c.h * S };
  /** a straight line between two layout points */
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    const a = box({ x: x1, y: y1, w: 0, h: 0 }), b = box({ x: x2, y: y2, w: 0, h: 0 });
    return { x1: a.X, y1: a.Y, x2: b.X, y2: b.Y };
  };

  const seats = useMemo(() => layout.cells.filter((c) => BOOKABLE.has(c.type) && layout.bookable), [layout]);
  const refs = useRef(new Map<string, SVGGElement>());
  const [tip, setTip] = useState<{ cell: Cell; key: string } | null>(null);
  const keyOf = (c: Cell) => `${wagonId}:${c.label}`;

  // ---- structure derived from the layout ----
  const structure = useMemo(() => {
    const solid = layout.cells.filter((c) => c.type !== 'DOOR');
    const corridor = CORRIDOR_KINDS.has(layout.kind);
    const gap: [number, number] = corridor ? [3.75, Wd] : [1.95, 3.05];
    const minX = Math.min(...solid.map((c) => c.x));
    const maxX = Math.max(...solid.map((c) => c.x + c.w));
    const partitions = [minX - 0.08];
    if (L - maxX > 0.8) partitions.push(maxX + 0.08);
    // windows on each long side, following the seats / compartments next to the wall
    const near = (c: Cell, side: 'top' | 'bottom') => (side === 'top' ? c.y < 0.45 : c.y + c.h > Wd - 0.8);
    const winTypes = new Set(['SEAT', 'BERTH', 'CHAIR', 'TABLE', 'BAR', 'PLAY']);
    const rooms = solid.filter((c) => c.type === 'ROOM');
    const perRoom = rooms.map((r) => ({ x: r.x + 0.25, w: r.w - 0.5 }));
    // compartment coaches: one window per compartment and one opposite in the corridor; saloons: one per seat bay
    const bays = (side: 'top' | 'bottom') => mergeSpans(solid.filter((c) => winTypes.has(c.type) && near(c, side)).map((c) => ({ x: c.x, w: c.w })), 0.15);
    const top = rooms.length ? perRoom : bays('top');
    const bottom = rooms.length && corridor ? perRoom : bays('bottom');
    return { gap, partitions, top, bottom };
  }, [layout, L, Wd]);

  const move = (from: Cell, dir: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown') => {
    const a = box(from);
    const ax = a.X + a.W / 2, ay = a.Y + a.H / 2;
    let best: Cell | null = null, bestD = Infinity;
    for (const c of seats) {
      if (c === from) continue;
      const b = box(c);
      const dx = b.X + b.W / 2 - ax, dy = b.Y + b.H / 2 - ay;
      const ok = dir === 'ArrowLeft' ? dx < -2 : dir === 'ArrowRight' ? dx > 2 : dir === 'ArrowUp' ? dy < -2 : dy > 2;
      if (!ok) continue;
      const horizontal = dir === 'ArrowLeft' || dir === 'ArrowRight';
      const d = (horizontal ? Math.abs(dx) : Math.abs(dy)) + (horizontal ? Math.abs(dy) : Math.abs(dx)) * 3;
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best) refs.current.get(keyOf(best))?.focus();
  };

  const onKey = (e: KeyboardEvent, c: Cell) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSeat?.(c, keyOf(c)); }
    else if (e.key.startsWith('Arrow')) { e.preventDefault(); move(c, e.key as any); }
  };

  const levelLetter = (l?: string) => (l === 'L' ? t('L') : l === 'M' ? t('M') : l === 'U' ? t('U') : '');
  const fsLabel = Math.max(8.5, Math.min(10.5, S * 0.32));

  /** one or two lines of text centred in an area */
  const label = (b: Box, text: string, sub?: string) => (
    <>
      <text x={b.X + b.W / 2} y={b.Y + b.H / 2 - (sub ? 6 : 0)} className="plan-label" style={{ fontSize: fsLabel }} textAnchor="middle" dominantBaseline="central">{text}</text>
      {sub && <text x={b.X + b.W / 2} y={b.Y + b.H / 2 + 7} className="plan-label plan-label--sub" style={{ fontSize: fsLabel - 1 }} textAnchor="middle" dominantBaseline="central">{sub}</text>}
    </>
  );
  /** an enclosed room (WC, staff, kitchen) with its door on the aisle side */
  const room = (c: Cell, i: number, text: string, sub?: string, title?: string) => {
    const b = box(c);
    const aisleBelow = c.y + c.h / 2 < Wd / 2;
    const edge = aisleBelow ? c.y + c.h : c.y;
    const dw = Math.min(0.75, c.w * 0.5);
    const d0 = c.x + (c.w - dw) / 2;
    return (
      <g key={i}>
        <rect x={b.X} y={b.Y} width={b.W} height={b.H} className="plan-room plan-room--fill" />
        <line {...line(d0, edge, d0 + dw, edge)} className="plan-door-gap plan-door-gap--room" />
        {label(b, text, sub)}
        {title && <title>{title}</title>}
      </g>
    );
  };

  const decor = (c: Cell, i: number) => {
    const b = box(c);
    switch (c.type) {
      case 'ROOM': {
        // compartment: walls + sliding door to the corridor + number in the corridor
        const doorFrom = c.x + c.w * 0.3, doorTo = c.x + c.w * 0.7;
        const bottomY = c.y + c.h;
        const num = box({ x: c.x, y: bottomY, w: c.w, h: Wd - bottomY });
        return (
          <g key={i}>
            <rect x={b.X} y={b.Y} width={b.W} height={b.H} className="plan-room" />
            <line {...line(doorFrom, bottomY, doorTo, bottomY)} className="plan-door-gap" />
            <text x={num.X + num.W / 2} y={num.Y + num.H / 2} className="plan-room-no" textAnchor="middle" dominantBaseline="central">{c.label}</text>
          </g>
        );
      }
      case 'DOOR': {
        // an opening in the body shell with door jambs
        const top = c.y < 0;
        const wallY = top ? 0 : Wd;
        const out = top ? -0.22 : 0.22;
        return (
          <g key={i}>
            <line {...line(c.x, wallY, c.x + c.w, wallY)} className="plan-door-gap" />
            <line {...line(c.x, wallY, c.x, wallY + out)} className="plan-jamb" />
            <line {...line(c.x + c.w, wallY, c.x + c.w, wallY + out)} className="plan-jamb" />
            <line {...line(c.x + 0.08, wallY + out * 0.55, c.x + c.w - 0.08, wallY + out * 0.55)} className="plan-step" />
          </g>
        );
      }
      case 'TABLE':
        return <rect key={i} x={b.X + 1} y={b.Y + 1} width={b.W - 2} height={b.H - 2} rx={1.5} className="plan-table" />;
      case 'CHAIR':
        return <rect key={i} x={b.X + 1} y={b.Y + 1} width={b.W - 2} height={b.H - 2} rx={2} className="plan-chair" />;
      case 'SINK':
        return <circle key={i} cx={b.X + b.W / 2} cy={b.Y + b.H / 2} r={Math.min(b.W, b.H) / 2.6} className="plan-sink" />;
      case 'WC':
        return room(c, i, 'WC', undefined, t('Toilet'));
      case 'WC_ACC':
        return room(c, i, 'WC', t('accessible'), t('Accessible toilet'));
      case 'KITCHEN':
        return room(c, i, t('Kitchen'));
      case 'STAFF':
        return room(c, i, t('Staff'));
      case 'LUGGAGE':
        return <g key={i}><rect x={b.X} y={b.Y} width={b.W} height={b.H} className="plan-area" style={{ fill: `url(#hatch-${uid})` }} />{label(b, t('Luggage'))}</g>;
      case 'BIKE':
        return <g key={i}><rect x={b.X} y={b.Y} width={b.W} height={b.H} className="plan-area" />{label(b, t('Bicycles'))}</g>;
      case 'STROLLER':
        return <g key={i}><rect x={b.X} y={b.Y} width={b.W} height={b.H} className="plan-area" />{label(b, t('Strollers'))}</g>;
      case 'PLAY':
        return <g key={i}><rect x={b.X} y={b.Y} width={b.W} height={b.H} className="plan-area" />{label(b, t('Kids corner'))}</g>;
      case 'BAR':
        return <g key={i}><rect x={b.X} y={b.Y} width={b.W} height={b.H} rx={1.5} className="plan-bar" />{label(b, t('Bar'))}</g>;
      default:
        return null;
    }
  };

  const seat = (c: Cell) => {
    const key = keyOf(c);
    const st = stateOf(key);
    const b = box(c);
    const isDim = st === 'free' && dimmed?.(c);
    const clickable = !!onSeat && (selectAny || st === 'free' || st === 'selected');
    const inset = 1.5;
    const back = Math.max(3.5, 0.15 * S);
    // backrest on the side opposite to the facing direction
    let backRect: Box | null = null;
    if (c.type === 'SEAT' && c.facing) {
      const facingFront = c.facing === 'L';
      backRect = vertical
        ? { X: b.X + inset, Y: facingFront ? b.Y + b.H - inset - back : b.Y + inset, W: b.W - inset * 2, H: back }
        : { X: facingFront ? b.X + b.W - inset - back : b.X + inset, Y: b.Y + inset, W: back, H: b.H - inset * 2 };
    }
    const attrs = (c.attrs ?? []).filter((a) => SEAT_ATTRS[a]).map((a) => t(SEAT_ATTRS[a])).join(', ');
    const fs = Math.max(9, Math.min(12, S * 0.36, b.W * 0.4));
    const kind = c.type === 'BERTH' ? 'berth' : c.type === 'WHEELCHAIR' ? 'wheelchair space' : 'seat';
    // center of the number: slightly away from the backrest
    let cx = b.X + b.W / 2, cy = b.Y + b.H / 2;
    if (backRect) {
      if (vertical) cy += c.facing === 'L' ? -back / 2 : back / 2;
      else cx += c.facing === 'L' ? -back / 2 : back / 2;
    }
    return (
      <g
        key={key}
        ref={(el) => { if (el) refs.current.set(key, el); else refs.current.delete(key); }}
        className={`seat seat--${st}${isDim ? ' seat--dim' : ''}${highlight?.has(key) ? ' seat--hl' : ''}${clickable ? ' seat--click' : ''}`}
        tabIndex={clickable ? 0 : -1}
        role={onSeat ? 'button' : 'img'}
        aria-pressed={onSeat ? st === 'selected' : undefined}
        aria-label={`${t('Wagon')} ${wagonNumber}, ${t(kind)} ${c.label}, ${attrs}, ${t(`seat_${st}`)}`}
        onClick={() => clickable && onSeat?.(c, key)}
        onKeyDown={(e) => onKey(e, c)}
        onMouseEnter={() => setTip({ cell: c, key })}
        onMouseLeave={() => setTip((p) => (p?.key === key ? null : p))}
        onFocus={() => setTip({ cell: c, key })}
        onBlur={() => setTip((p) => (p?.key === key ? null : p))}
      >
        <rect x={b.X + inset} y={b.Y + inset} width={b.W - inset * 2} height={b.H - inset * 2} rx={2.5} className="seat-body"
          style={st === 'held' ? { fill: `url(#held-${uid})` } : st === 'blocked' ? { fill: `url(#blocked-${uid})` } : undefined} />
        {backRect && <rect x={backRect.X} y={backRect.Y} width={backRect.W} height={backRect.H} rx={1.5} className="seat-back" />}
        {c.type === 'BERTH' && (
          vertical
            ? <rect x={b.X + b.W * 0.2} y={b.Y + 4} width={b.W * 0.6} height={Math.min(6, b.H * 0.14)} rx={2} className="seat-pillow" />
            : <rect x={b.X + 4} y={b.Y + b.H * 0.2} width={Math.min(6, b.W * 0.14)} height={b.H * 0.6} rx={2} className="seat-pillow" />
        )}
        {c.type === 'WHEELCHAIR' && (
          <Accessibility x={b.X + b.W / 2 - 7} y={b.Y + b.H / 2 - 15} width={14} height={14} className="seat-icon" strokeWidth={1.6} aria-hidden />
        )}
        <text x={cx} y={cy + (c.type === 'WHEELCHAIR' ? 9 : 0)} className="seat-label" style={{ fontSize: fs }}
          dominantBaseline="central" textAnchor="middle">{c.label}</text>
        {c.level && (
          <text x={b.X + b.W - 4} y={b.Y + 9} className="seat-level" textAnchor="end">{levelLetter(c.level)}</text>
        )}
      </g>
    );
  };

  const shell = box({ x: 0, y: 0, w: L, h: Wd });
  const gangway = (x: number) => box({ x, y: Wd / 2 - 0.85, w: 0.32, h: 1.7 });
  const g1 = gangway(-0.32), g2 = gangway(L);
  const winH = 0.1;
  const tipBox = tip ? box(tip.cell) : null;

  return (
    <div className="wagon-plan" style={{ width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={ariaLabel}>
        <defs>
          <pattern id={`held-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" className="pat-held-a" /><rect width="2" height="6" className="pat-held-b" />
          </pattern>
          <pattern id={`blocked-${uid}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width="5" height="5" className="pat-blocked-a" /><rect width="1.5" height="5" className="pat-blocked-b" />
          </pattern>
          <pattern id={`hatch-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#f6f7f9" /><rect width="1" height="6" fill="#e1e5ea" />
          </pattern>
        </defs>
        {/* gangway connectors to the neighbouring coaches */}
        <rect x={g1.X} y={g1.Y} width={g1.W} height={g1.H} className="plan-gangway" />
        <rect x={g2.X} y={g2.Y} width={g2.W} height={g2.H} className="plan-gangway" />
        <rect x={shell.X} y={shell.Y} width={shell.W} height={shell.H} rx={S * 0.28} className="plan-shell" />
        {/* windows sit in the outer wall, aligned with seats / compartments */}
        {structure.top.map((s, i) => { const b = box({ x: s.x + 0.08, y: -winH / 2, w: s.w - 0.16, h: winH }); return <rect key={`wt${i}`} x={b.X} y={b.Y} width={b.W} height={b.H} className="plan-window" />; })}
        {structure.bottom.map((s, i) => { const b = box({ x: s.x + 0.08, y: Wd - winH / 2, w: s.w - 0.16, h: winH }); return <rect key={`wb${i}`} x={b.X} y={b.Y} width={b.W} height={b.H} className="plan-window" />; })}
        {/* vestibule partitions with a passage */}
        {structure.partitions.map((x, i) => (
          <g key={`p${i}`}>
            {structure.gap[0] > 0 && <line {...line(x, 0, x, structure.gap[0])} className="plan-wall" />}
            {structure.gap[1] < Wd && <line {...line(x, structure.gap[1], x, Wd)} className="plan-wall" />}
          </g>
        ))}
        {layout.cells.filter((c) => c.type === 'ROOM').map(decor)}
        {layout.cells.filter((c) => c.type !== 'ROOM' && !BOOKABLE.has(c.type)).map(decor)}
        {layout.bookable && layout.cells.filter((c) => BOOKABLE.has(c.type)).map(seat)}
      </svg>
      {tip && tipBox && describe && (
        <div className={`seat-tip${tipBox.Y < height / 2 ? ' seat-tip--below' : ''}`} role="tooltip"
          style={{ left: Math.max(90, Math.min(width - 90, tipBox.X + tipBox.W / 2)), top: tipBox.Y < height / 2 ? tipBox.Y + tipBox.H : tipBox.Y }}>
          {describe(tip.cell, tip.key)}
        </div>
      )}
    </div>
  );
}
