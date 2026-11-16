export type CellType =
  | 'SEAT' | 'BERTH' | 'WHEELCHAIR'
  | 'TABLE' | 'WC' | 'WC_ACC' | 'DOOR' | 'BAR' | 'KITCHEN' | 'LUGGAGE' | 'BIKE'
  | 'STROLLER' | 'CHAIR' | 'ROOM' | 'SINK' | 'PLAY' | 'STAFF' | 'STAIRS';

export interface Cell {
  x: number; y: number; w: number; h: number;
  type: CellType; label?: string; attrs?: string[]; group?: string;
  facing?: 'L' | 'R'; level?: 'L' | 'M' | 'U';
}

export interface Layout {
  code: string; name: string; kind: string; classLabel: string; priceFactor: number; bookable: boolean;
  length: number; width: number; cells: Cell[]; description: string; defaultAmenities: string[];
}

export interface Wagon {
  id: number; number: number; name: string; layout: string; kind: string; classLabel: string;
  bookable: boolean; capacity: number; amenities: string[]; description: string; layoutData?: Layout;
}

export interface Train {
  id: number; code: string; name: string; kind: string; description: string; color: string; locomotive: string;
  wagons: Wagon[]; capacity: number;
}

export interface Route {
  id: number; code: string; name: string; duration_min: number; base_price: number;
  stops: Array<{ name: string; min: number }>; description: string;
}

export interface WagonSummary { number: number; layout: string; kind: string; classLabel: string; amenities: string[]; bookable: boolean }

export interface TripSummary {
  id: number; departure: string; arrival: string; status: string; departed: boolean;
  route: Route; train: { id: number; code: string; name: string; kind: string; color: string };
  wagons: WagonSummary[]; capacity: number; free: number; sold: number; priceFrom: number;
  leastCrowded?: boolean; boarded?: number;
}

export interface TripDetail extends Omit<TripSummary, 'train'> {
  train: Train;
  prices: Record<string, Record<string, number>>;
}

export interface Availability {
  sold: string[]; used: string[]; held: string[]; mine: string[]; blocked: string[]; expiresAt: number | null;
}

export interface PassengerType { code: string; label: string; factor: number }

export interface Ticket {
  id: number; seatKey: string; seatLabel: string; wagonNumber: number | null; wagonName?: string; wagonId: number;
  seatType?: CellType; attrs: string[]; passengerType: string; price: number; status: string; scannedAt: string | null; token: string;
}

export interface Booking {
  code: string; name: string; email: string; phone: string; total: number; status: string; createdAt: string;
  trip: TripSummary; tickets: Ticket[];
}

export type SeatState = 'free' | 'selected' | 'held' | 'sold' | 'used' | 'blocked';
