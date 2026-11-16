import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Accessibility, Baby, Bike, Coffee, Luggage, Sparkles, Toilet, UtensilsCrossed, UserRound } from 'lucide-react';
import type { Cell, Layout, SeatState } from '../types';
import { useT } from '../i18n';
import { SEAT_ATTRS } from '../amenities';

const BOOKABLE = new Set(['SEAT', 'BERTH', 'WHEELCHAIR']);

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

export function WagonPlan({ layout, wagonId, wagonNumber, stateOf, onSeat, dimmed, highlight, describe, vertical = false, scale, ariaLabel, selectAny }: WagonPlanProps) {
  const t = useT();
  const uid = useId().replace(/:/g, '');
  const S = scale ?? (vertical ? 46 : 30);
  const PAD = 0.5;
  const L = layout.length, Wd = layout.width;
  const width = (vertical ? Wd : L) * S + PAD * 2 * S;
  const height = (vertical ? L : Wd) * S + PAD * 2 * S;
  const box = (c: { x: number; y: number; w: number; h: number }): Box =>
    vertical
      ? { X: (PAD + Wd - c.y - c.h) * S, Y: (PAD + c.x) * S, W: c.h * S, H: c.w * S }
      : { X: (PAD + c.x) * S, Y: (PAD + c.y) * S, W: c.w * S, H: c.h * S };

  const seats = useMemo(() => layout.cells.filter((c) => BOOKABLE.has(c.type) && layout.bookable), [layout]);
  const refs = useRef(new Map<string, SVGGElement>());
  const [tip, setTip] = useState<{ cell: Cell; key: string } | null>(null);
  const keyOf = (c: Cell) => `${wagonId}:${c.label}`;

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
      const main = dir === 'ArrowLeft' || dir === 'ArrowRight' ? Math.abs(dx) : Math.abs(dy);
      const side = dir === 'ArrowLeft' || dir === 'ArrowRight' ? Math.abs(dy) : Math.abs(dx);
      const d = main + side * 3;
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best) refs.current.get(keyOf(best))?.focus();
  };

  const onKey = (e: KeyboardEvent, c: Cell) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSeat?.(c, keyOf(c)); }
    else if (e.key.startsWith('Arrow')) { e.preventDefault(); move(c, e.key as any); }
  };

  const levelLetter = (l?: string) => (l === 'L' ? t('L') : l === 'M' ? t('M') : l === 'U' ? t('U') : '');

  const icon = (Icon: typeof Toilet, b: Box, color: string, sizeMax = 22) => {
    const size = Math.min(sizeMax, b.W * 0.6, b.H * 0.6);
    return <Icon x={b.X + b.W / 2 - size / 2} y={b.Y + b.H / 2 - size / 2} width={size} height={size} color={color} strokeWidth={1.8} aria-hidden />;
  };

  const decor = (c: Cell, i: number) => {
    const b = box(c);
    const r = Math.min(6, S * 0.15);
    switch (c.type) {
      case 'ROOM':
        return (
          <g key={i}>
            <rect x={b.X} y={b.Y} width={b.W} height={b.H} rx={r} className="cell-room" />
            <text x={b.X + 4} y={b.Y + 11} className="cell-room-label">{c.label}</text>
          </g>
        );
      case 'DOOR':
        return <rect key={i} x={b.X} y={b.Y} width={b.W} height={b.H} rx={2} className="cell-door" />;
      case 'TABLE':
        return <rect key={i} x={b.X} y={b.Y} width={b.W} height={b.H} rx={r} className="cell-table" />;
      case 'CHAIR':
        return <rect key={i} x={b.X} y={b.Y} width={b.W} height={b.H} rx={r} className="cell-chair" />;
      case 'SINK':
        return <circle key={i} cx={b.X + b.W / 2} cy={b.Y + b.H / 2} r={Math.min(b.W, b.H) / 2.4} className="cell-sink" />;
      case 'WC':
      case 'WC_ACC':
        return (
          <g key={i}>
            <rect x={b.X} y={b.Y} width={b.W} height={b.H} rx={r} className="cell-wc" />
            {icon(c.type === 'WC' ? Toilet : Accessibility, b, '#0369a1')}
            <title>{t(c.type === 'WC' ? 'Toilet' : 'Accessible toilet')}</title>
          </g>
        );
      default: {
        const map: Record<string, [typeof Toilet, string, string]> = {
          LUGGAGE: [Luggage, 'Luggage', 'cell-util'],
          BIKE: [Bike, 'Bicycles', 'cell-bike'],
          STROLLER: [Baby, 'Stroller space', 'cell-family'],
          PLAY: [Sparkles, 'Kids corner', 'cell-family'],
          KITCHEN: [UtensilsCrossed, 'Kitchen', 'cell-kitchen'],
          BAR: [Coffee, 'Bar', 'cell-kitchen'],
          STAFF: [UserRound, 'Staff', 'cell-util'],
        };
        const m = map[c.type];
        if (!m) return null;
        return (
          <g key={i}>
            <rect x={b.X} y={b.Y} width={b.W} height={b.H} rx={r} className={m[2]} />
            {icon(m[0], b, 'currentColor', 26)}
            <title>{t(m[1])}</title>
          </g>
        );
      }
    }
  };

  const seat = (c: Cell) => {
    const key = keyOf(c);
    const st = stateOf(key);
    const b = box(c);
    const isDim = st === 'free' && dimmed?.(c);
    const clickable = !!onSeat && (selectAny || st === 'free' || st === 'selected');
    const r = Math.min(7, S * 0.18);
    const back = 0.2 * S;
    // backrest is on the side opposite to the facing direction
    let backRect: Box | null = null;
    if (c.type === 'SEAT' && c.facing) {
      const facingFront = c.facing === 'L';
      backRect = vertical
        ? { X: b.X + 1, Y: facingFront ? b.Y + b.H - back : b.Y, W: b.W - 2, H: back }
        : { X: facingFront ? b.X + b.W - back : b.X, Y: b.Y + 1, W: back, H: b.H - 2 };
    }
    const label = c.label!;
    const stateLabel = t(`seat_${st}`);
    const attrs = (c.attrs ?? []).filter((a) => SEAT_ATTRS[a]).map((a) => t(SEAT_ATTRS[a])).join(', ');
    const fs = Math.min(S * 0.4, b.W * 0.42, 14);
    return (
      <g
        key={key}
        ref={(el) => { if (el) refs.current.set(key, el); else refs.current.delete(key); }}
        className={`seat seat--${st}${isDim ? ' seat--dim' : ''}${highlight?.has(key) ? ' seat--hl' : ''}${clickable ? ' seat--click' : ''}`}
        tabIndex={clickable ? 0 : -1}
        role={onSeat ? 'button' : 'img'}
        aria-pressed={onSeat ? st === 'selected' : undefined}
        aria-label={`${t('Wagon')} ${wagonNumber}, ${t(c.type === 'BERTH' ? 'berth' : c.type === 'WHEELCHAIR' ? 'wheelchair space' : 'seat')} ${label}, ${attrs}, ${stateLabel}`}
        onClick={() => clickable && onSeat?.(c, key)}
        onKeyDown={(e) => onKey(e, c)}
        onMouseEnter={() => setTip({ cell: c, key })}
        onMouseLeave={() => setTip((p) => (p?.key === key ? null : p))}
        onFocus={() => setTip({ cell: c, key })}
        onBlur={() => setTip((p) => (p?.key === key ? null : p))}
      >
        <rect x={b.X + 1} y={b.Y + 1} width={b.W - 2} height={b.H - 2} rx={r} className="seat-body"
          style={st === 'held' ? { fill: `url(#held-${uid})` } : st === 'blocked' ? { fill: `url(#blocked-${uid})` } : undefined} />
        {backRect && <rect x={backRect.X} y={backRect.Y} width={backRect.W} height={backRect.H} rx={3} className="seat-back" />}
        {c.type === 'BERTH' && (
          vertical
            ? <rect x={b.X + b.W * 0.15} y={b.Y + 4} width={b.W * 0.7} height={Math.min(8, b.H * 0.18)} rx={3} className="seat-pillow" />
            : <rect x={b.X + 4} y={b.Y + b.H * 0.15} width={Math.min(8, b.W * 0.18)} height={b.H * 0.7} rx={3} className="seat-pillow" />
        )}
        {c.type === 'WHEELCHAIR' && (
          <Accessibility x={b.X + b.W / 2 - 10} y={b.Y + b.H / 2 - 20} width={20} height={20} className="seat-icon" aria-hidden />
        )}
        {(st === 'sold' || st === 'used') && c.type !== 'WHEELCHAIR' && (
          <path d={`M${b.X + 5} ${b.Y + 5} L${b.X + b.W - 5} ${b.Y + b.H - 5}`} className="seat-cross" />
        )}
        <text x={b.X + b.W / 2} y={b.Y + b.H / 2 + (c.type === 'WHEELCHAIR' ? 14 : 0)} className="seat-label" style={{ fontSize: fs }}
          dominantBaseline="central" textAnchor="middle">{label}</text>
        {c.level && (
          <text x={b.X + b.W - 4} y={b.Y + 9} className="seat-level" textAnchor="end">{levelLetter(c.level)}</text>
        )}
      </g>
    );
  };

  const windows = [];
  for (let x = 1.6; x < L - 1.6; x += 1.45) {
    windows.push({ x, y: -0.06, w: 1.0, h: 0.12 }, { x, y: Wd - 0.06, w: 1.0, h: 0.12 });
  }

  const tipBox = tip ? box(tip.cell) : null;
  return (
    <div className="wagon-plan" style={{ width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={ariaLabel}>
        <defs>
          <pattern id={`held-${uid}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="#fde68a" /><rect width="4" height="8" fill="#fbbf24" />
          </pattern>
          <pattern id={`blocked-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width="6" height="6" fill="#64748b" /><rect width="2" height="6" fill="#334155" />
          </pattern>
        </defs>
        {(() => { const b = box({ x: 0, y: 0, w: L, h: Wd }); return <rect x={b.X} y={b.Y} width={b.W} height={b.H} rx={S * 0.6} className="wagon-body" />; })()}
        {windows.map((w, i) => { const b = box(w); return <rect key={`w${i}`} x={b.X} y={b.Y} width={b.W} height={b.H} rx={2} className="wagon-window" />; })}
        {layout.cells.filter((c) => c.type === 'ROOM').map(decor)}
        {layout.cells.filter((c) => c.type !== 'ROOM' && !BOOKABLE.has(c.type)).map(decor)}
        {layout.cells.filter((c) => BOOKABLE.has(c.type)).map((c) => (layout.bookable ? seat(c) : null))}
      </svg>
      {tip && tipBox && describe && (
        <div className={`seat-tip${tipBox.Y < height / 2 ? ' seat-tip--below' : ''}`} role="tooltip"
          style={{ left: Math.max(80, Math.min(width - 80, tipBox.X + tipBox.W / 2)), top: tipBox.Y < height / 2 ? tipBox.Y + tipBox.H : tipBox.Y }}>
          {describe(tip.cell, tip.key)}
        </div>
      )}
    </div>
  );
}
