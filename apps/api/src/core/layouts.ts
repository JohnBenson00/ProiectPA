/**
 * Wagon layout generators.
 *
 * A layout is a top-down schematic of one wagon. Coordinates are in "seat units":
 * x runs along the wagon (the train travels towards x = 0, i.e. to the LEFT on screen),
 * y runs across the wagon (0 = top side, WIDTH = bottom side).
 *
 * Bookable cells (SEAT, BERTH, WHEELCHAIR) carry a numbered label that is unique within the wagon.
 */

export type CellType =
  | 'SEAT' | 'BERTH' | 'WHEELCHAIR'
  | 'TABLE' | 'WC' | 'WC_ACC' | 'DOOR' | 'BAR' | 'KITCHEN' | 'LUGGAGE' | 'BIKE'
  | 'STROLLER' | 'CHAIR' | 'ROOM' | 'SINK' | 'PLAY' | 'STAFF' | 'STAIRS';

export interface Cell {
  x: number; y: number; w: number; h: number;
  type: CellType;
  label?: string;
  attrs?: string[];
  group?: string;
  /** 'L' = faces direction of travel, 'R' = faces backwards */
  facing?: 'L' | 'R';
  level?: 'L' | 'M' | 'U';
}

export type LayoutKind = 'SEATING' | 'COMPARTMENT' | 'COUCHETTE' | 'SLEEPER' | 'DINING' | 'MULTI' | 'PANORAMIC';

export interface Layout {
  code: string;
  name: string;
  kind: LayoutKind;
  classLabel: string;
  priceFactor: number;
  bookable: boolean;
  length: number;
  width: number;
  cells: Cell[];
  description: string;
  defaultAmenities: string[];
}

export const WIDTH = 5;
/** every seat in every coach type has the same footprint */
const SEAT_W = 0.9;
const SEAT_H = 0.9;

function doors(cells: Cell[], xs: number[]) {
  for (const x of xs) {
    cells.push({ x, y: -0.12, w: 1.1, h: 0.24, type: 'DOOR' });
    cells.push({ x, y: WIDTH - 0.12, w: 1.1, h: 0.24, type: 'DOOR' });
  }
}

/** Open saloon 2+2, alternating facing bays (with tables) and airline rows. */
function saloon(code: string, name: string, quiet: boolean): Layout {
  const cells: Cell[] = [];
  const rows = [0.1, 1.0, 3.1, 4.0]; // window, aisle | aisle, window
  let x = 1.7;
  cells.push({ x: 1.6, y: 0.1, w: 1.6, h: 1.8, type: 'WC' });
  cells.push({ x: 1.6, y: 3.1, w: 1.6, h: 1.8, type: 'LUGGAGE' });
  x = 3.7;
  // CFR-style numbering: the bay is the tens digit, positions 1-4 / 5-8 run window to window
  const addRow = (rx: number, facing: 'L' | 'R', table: boolean, bay: number, second: boolean) => {
    rows.forEach((ry, i) => {
      const attrs = [i === 0 || i === 3 ? 'WINDOW' : 'AISLE', facing === 'L' ? 'FORWARD' : 'BACKWARD'];
      if (table) attrs.push('TABLE');
      if (quiet) attrs.push('QUIET');
      if (bay === 0) attrs.push('NEAR_WC');
      const label = `${bay + 1}${(second ? 5 : 1) + i}`;
      cells.push({ x: rx, y: ry, w: SEAT_W, h: SEAT_H, type: 'SEAT', label, attrs, facing, group: `b${bay}${i < 2 ? 'L' : 'R'}` });
    });
  };
  for (let b = 0; b < 8; b++) {
    if (b % 2 === 0) {
      // facing bay: backward row, table, forward row
      addRow(x, 'R', true, b, false);
      cells.push({ x: x + 1.0, y: 0.15, w: 0.5, h: 1.7, type: 'TABLE' });
      cells.push({ x: x + 1.0, y: 3.15, w: 0.5, h: 1.7, type: 'TABLE' });
      addRow(x + 1.6, 'L', true, b, true);
      x += 2.9;
    } else {
      // airline rows: both facing forward
      addRow(x, 'L', false, b, false);
      addRow(x + 1.1, 'L', false, b, true);
      x += 2.4;
    }
  }
  const length = x + 1.6;
  doors(cells, [0.3, length - 1.4]);
  return {
    code, name, kind: 'SEATING', classLabel: '2', priceFactor: quiet ? 1.1 : 1, bookable: true,
    length, width: WIDTH, cells,
    description: quiet
      ? 'Open saloon, 2nd class, quiet zone: phone calls and loud music are not allowed.'
      : 'Open saloon, 2nd class, 2+2 seating with tables in the facing bays.',
    defaultAmenities: quiet ? ['QUIET', 'AC', 'POWER', 'WC'] : ['AC', 'POWER', 'WIFI', 'WC', 'LUGGAGE'],
  };
}

/** 1st class: 8 compartments with 6 seats each and a side corridor. Seats are numbered like CFR (11-16, 21-26, ...). */
function firstClass(): Layout {
  const cells: Cell[] = [];
  cells.push({ x: 1.6, y: 0.1, w: 1.6, h: 1.8, type: 'WC' });
  cells.push({ x: 1.6, y: 2.1, w: 1.6, h: 1.6, type: 'LUGGAGE' });
  let x = 3.5;
  const seatYs = [0.3, 1.38, 2.46]; // window, middle, corridor
  for (let c = 1; c <= 8; c++) {
    cells.push({ x, y: 0.05, w: 3.0, h: 3.65, type: 'ROOM', label: String(c), group: `c${c}` });
    cells.push({ x: x + 1.2, y: 0.2, w: 0.6, h: 0.7, type: 'TABLE' });
    seatYs.forEach((y, i) => {
      const pos = i === 0 ? 'WINDOW' : i === 2 ? 'AISLE' : 'MIDDLE';
      cells.push({ x: x + 0.2, y, w: SEAT_W, h: SEAT_H, type: 'SEAT', label: `${c}${i + 1}`, facing: 'R', group: `c${c}`, attrs: [pos, 'BACKWARD', 'COMPARTMENT', ...(i === 0 ? ['TABLE'] : [])] });
      cells.push({ x: x + 1.9, y, w: SEAT_W, h: SEAT_H, type: 'SEAT', label: `${c}${i + 4}`, facing: 'L', group: `c${c}`, attrs: [pos, 'FORWARD', 'COMPARTMENT', ...(i === 0 ? ['TABLE'] : [])] });
    });
    x += 3.0;
  }
  const length = x + 1.6;
  doors(cells, [0.3, length - 1.4]);
  return {
    code: 'C1', name: '1st class compartments', kind: 'COMPARTMENT', classLabel: '1', priceFactor: 1.5, bookable: true,
    length, width: WIDTH, cells,
    description: '1st class wagon with 8 closed compartments of 6 seats and a side corridor. Wider seats, reading lights.',
    defaultAmenities: ['FIRST_CLASS', 'AC', 'POWER', 'WIFI', 'WC'],
  };
}

/** Couchette: 8 compartments with 6 berths (lower / middle / upper on both sides). */
function couchette(): Layout {
  const cells: Cell[] = [];
  cells.push({ x: 1.6, y: 0.1, w: 1.6, h: 1.7, type: 'WC' });
  cells.push({ x: 1.6, y: 1.95, w: 1.6, h: 1.7, type: 'STAFF' });
  let x = 3.5;
  const levels: Array<['L' | 'M' | 'U', number]> = [['U', 0.15], ['M', 1.3], ['L', 2.45]];
  for (let c = 1; c <= 8; c++) {
    cells.push({ x, y: 0.05, w: 3.0, h: 3.65, type: 'ROOM', label: String(c), group: `c${c}` });
    let i = 0;
    for (const [lvl, y] of levels) {
      const attr = lvl === 'L' ? 'BERTH_LOWER' : lvl === 'M' ? 'BERTH_MIDDLE' : 'BERTH_UPPER';
      const base = lvl === 'L' ? 1 : lvl === 'M' ? 3 : 5;
      cells.push({ x: x + 0.12, y, w: 1.15, h: 1.05, type: 'BERTH', label: `${c}${base}`, level: lvl, group: `c${c}`, attrs: [attr, 'COMPARTMENT', 'SLEEPING'] });
      cells.push({ x: x + 1.73, y, w: 1.15, h: 1.05, type: 'BERTH', label: `${c}${base + 1}`, level: lvl, group: `c${c}`, attrs: [attr, 'COMPARTMENT', 'SLEEPING'] });
      i++;
    }
    x += 3.0;
  }
  const length = x + 1.6;
  cells.push({ x: length - 1.55, y: 0.1, w: 1.4, h: 1.7, type: 'WC' });
  doors(cells, [0.3, length - 1.4]);
  return {
    code: 'CU', name: 'Couchette (6 berths)', kind: 'COUCHETTE', classLabel: '2', priceFactor: 2, bookable: true,
    length, width: WIDTH, cells,
    description: 'Couchette wagon: 8 compartments with 6 berths each (lower, middle, upper). Bedding included.',
    defaultAmenities: ['COUCHETTE', 'HEATING', 'WC', 'LUGGAGE'],
  };
}

/** Sleeping car: 10 compartments with 2 berths, washbasin and an attendant cabin. */
function sleeper(): Layout {
  const cells: Cell[] = [];
  cells.push({ x: 1.6, y: 0.1, w: 1.6, h: 1.7, type: 'STAFF' });
  cells.push({ x: 1.6, y: 1.95, w: 1.6, h: 1.7, type: 'WC' });
  let x = 3.45;
  for (let c = 1; c <= 10; c++) {
    cells.push({ x, y: 0.05, w: 2.55, h: 3.65, type: 'ROOM', label: String(c), group: `c${c}` });
    cells.push({ x: x + 0.15, y: 0.2, w: 1.55, h: 1.55, type: 'BERTH', label: `${c * 10 + 2}`, level: 'U', group: `c${c}`, attrs: ['BERTH_UPPER', 'COMPARTMENT', 'SLEEPING'] });
    cells.push({ x: x + 0.15, y: 1.95, w: 1.55, h: 1.6, type: 'BERTH', label: `${c * 10 + 1}`, level: 'L', group: `c${c}`, attrs: ['BERTH_LOWER', 'COMPARTMENT', 'SLEEPING'] });
    cells.push({ x: x + 1.85, y: 0.2, w: 0.55, h: 0.6, type: 'SINK' });
    x += 2.55;
  }
  const length = x + 1.7;
  cells.push({ x: length - 1.6, y: 0.1, w: 1.45, h: 1.7, type: 'WC' });
  doors(cells, [0.3, length - 1.4]);
  return {
    code: 'WL', name: 'Sleeping car (2 berths)', kind: 'SLEEPER', classLabel: '1', priceFactor: 3, bookable: true,
    length, width: WIDTH, cells,
    description: 'Sleeping car with 10 private compartments of 2 berths, washbasin, towels, and breakfast served by the attendant.',
    defaultAmenities: ['SLEEPING', 'AC', 'POWER', 'WC', 'HEATING'],
  };
}

/** Dining car: kitchen, bar counter and tables. Not bookable: open to all passengers. */
function dining(): Layout {
  const cells: Cell[] = [];
  cells.push({ x: 1.6, y: 0.1, w: 4.5, h: 2.3, type: 'KITCHEN' });
  cells.push({ x: 6.3, y: 2.9, w: 3.0, h: 0.9, type: 'BAR' });
  for (let i = 0; i < 4; i++) cells.push({ x: 6.4 + i * 0.75, y: 4.0, w: 0.55, h: 0.55, type: 'CHAIR' });
  let x = 10.0;
  for (let t = 0; t < 6; t++) {
    // table of 4 on the window side
    cells.push({ x: x + 0.75, y: 0.2, w: 0.9, h: 1.7, type: 'TABLE' });
    cells.push({ x: x, y: 0.25, w: 0.6, h: 0.7, type: 'CHAIR' }, { x: x, y: 1.15, w: 0.6, h: 0.7, type: 'CHAIR' });
    cells.push({ x: x + 1.8, y: 0.25, w: 0.6, h: 0.7, type: 'CHAIR' }, { x: x + 1.8, y: 1.15, w: 0.6, h: 0.7, type: 'CHAIR' });
    // table of 2 on the other side
    cells.push({ x: x + 0.75, y: 3.4, w: 0.9, h: 1.0, type: 'TABLE' });
    cells.push({ x: x, y: 3.55, w: 0.6, h: 0.7, type: 'CHAIR' }, { x: x + 1.8, y: 3.55, w: 0.6, h: 0.7, type: 'CHAIR' });
    x += 2.75;
  }
  const length = x + 1.5;
  doors(cells, [0.3, length - 1.4]);
  return {
    code: 'WR', name: 'Dining car', kind: 'DINING', classLabel: '', priceFactor: 0, bookable: false,
    length, width: WIDTH, cells,
    description: 'Restaurant car: hot meals, local specialties, coffee and drinks. Open to all passengers, no reservation needed.',
    defaultAmenities: ['DINING', 'BAR', 'AC', 'WIFI'],
  };
}

/** Multi-purpose wagon: wheelchair spaces, accessible WC, bikes, strollers, family zone + 2+2 seats. */
function multi(): Layout {
  const cells: Cell[] = [];
  cells.push({ x: 1.7, y: 0.1, w: 2.6, h: 2.2, type: 'WC_ACC' });
  cells.push({ x: 1.7, y: 2.9, w: 1.25, h: 2.0, type: 'WHEELCHAIR', label: '81', group: 'acc', attrs: ['ACCESSIBLE', 'NEAR_WC', 'FORWARD'] });
  cells.push({ x: 3.05, y: 2.9, w: 1.25, h: 2.0, type: 'WHEELCHAIR', label: '82', group: 'acc', attrs: ['ACCESSIBLE', 'NEAR_WC', 'FORWARD'] });
  // companion seats right after the wheelchair area
  let x = 4.6;
  const rows = [0.1, 1.0, 3.1, 4.0];
  const addRow = (rx: number, facing: 'L' | 'R', group: string, extra: string[], bay: number, second: boolean) => {
    rows.forEach((ry, i) => {
      const attrs = [i === 0 || i === 3 ? 'WINDOW' : 'AISLE', facing === 'L' ? 'FORWARD' : 'BACKWARD', ...extra];
      cells.push({ x: rx, y: ry, w: SEAT_W, h: SEAT_H, type: 'SEAT', label: `${bay}${(second ? 5 : 1) + i}`, attrs, facing, group: `${group}${i < 2 ? 'L' : 'R'}` });
    });
  };
  addRow(x, 'L', 'comp', ['ACCESSIBLE', 'NEAR_WC'], 1, false);
  x += 1.4;
  cells.push({ x, y: 0.1, w: 3.2, h: 1.8, type: 'BIKE' });
  cells.push({ x, y: 3.1, w: 3.2, h: 1.8, type: 'STROLLER' });
  x += 3.5;
  cells.push({ x, y: 0.1, w: 3.0, h: 1.8, type: 'PLAY' });
  cells.push({ x, y: 3.1, w: 3.0, h: 1.8, type: 'LUGGAGE' });
  x += 3.3;
  for (let b = 0; b < 3; b++) {
    addRow(x, 'R', `f${b}`, ['TABLE', 'FAMILY'], b + 2, false);
    cells.push({ x: x + 1.0, y: 0.15, w: 0.5, h: 1.7, type: 'TABLE' });
    cells.push({ x: x + 1.0, y: 3.15, w: 0.5, h: 1.7, type: 'TABLE' });
    addRow(x + 1.6, 'L', `f${b}`, ['TABLE', 'FAMILY'], b + 2, true);
    x += 2.9;
  }
  const length = x + 1.5;
  doors(cells, [0.3, length - 1.4]);
  return {
    code: 'MP', name: 'Multi-purpose (accessible, bikes, family)', kind: 'MULTI', classLabel: '2', priceFactor: 1, bookable: true,
    length, width: WIDTH, cells,
    description: 'Low-floor wagon with 2 wheelchair spaces, accessible toilet, bicycle and stroller area, kids play corner and family tables.',
    defaultAmenities: ['WHEELCHAIR', 'WC_ACCESSIBLE', 'BIKE', 'STROLLER', 'FAMILY', 'PETS', 'AC'],
  };
}

/** Panoramic tourist wagon: 2+1 seating, all facing forward, glass roof, bar corner. */
function panoramic(): Layout {
  const cells: Cell[] = [];
  cells.push({ x: 1.6, y: 0.1, w: 2.2, h: 1.8, type: 'BAR' });
  cells.push({ x: 1.6, y: 3.1, w: 2.2, h: 1.8, type: 'WC' });
  let x = 4.2;
  for (let r = 0; r < 14; r++) {
    const ys: Array<[number, string]> = [[0.1, 'WINDOW'], [1.0, 'AISLE'], [4.0, 'WINDOW']];
    ys.forEach(([y, pos], i) => {
      const attrs = [pos, 'FORWARD', 'PANORAMIC'];
      if (y === 4.0) attrs.push('SOLO');
      const label = `${Math.floor(r / 2) + 1}${(r % 2) * 3 + i + 1}`;
      cells.push({ x, y, w: SEAT_W, h: SEAT_H, type: 'SEAT', label, attrs, facing: 'L', group: `r${r}${y < 2 ? 'L' : 'R'}` });
    });
    x += 1.3;
  }
  const length = x + 1.5;
  doors(cells, [0.3, length - 1.4]);
  return {
    code: 'PN', name: 'Panoramic 2+1', kind: 'PANORAMIC', classLabel: '1', priceFactor: 1.3, bookable: true,
    length, width: WIDTH, cells,
    description: 'Panoramic wagon with glass roof and 2+1 forward-facing seats. Audio guide about the Râșnov citadel and the Bârsa land.',
    defaultAmenities: ['PANORAMIC', 'AUDIO_GUIDE', 'BAR', 'AC', 'WC'],
  };
}

export const LAYOUTS: Record<string, Layout> = Object.fromEntries(
  [saloon('S2', 'Open saloon 2+2', false), saloon('S2Q', 'Quiet saloon 2+2', true), firstClass(), couchette(), sleeper(), dining(), multi(), panoramic()]
    .map((l) => [l.code, l]),
);

export const BOOKABLE: CellType[] = ['SEAT', 'BERTH', 'WHEELCHAIR'];

export function bookableCells(layout: Layout): Cell[] {
  return layout.bookable ? layout.cells.filter((c) => BOOKABLE.includes(c.type)) : [];
}

export function capacity(layout: Layout): number {
  return bookableCells(layout).length;
}
