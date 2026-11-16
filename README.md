# Râșnov Trains – online tickets with a train seat map

Student project (Tema 4): a web app for booking seats and buying tickets for the Râșnov trains,
with a CFR-style interactive map of every train, wagon and numbered seat.

> Prices and payments are fictional. Payment is simulated.

## Run it

Requirements: **Node.js 22+** (uses the built-in `node:sqlite`, so there is no database server to install).

```bash
npm install
npm run build      # build the web app
npm start          # http://localhost:3001  (API + web app)
```

For development with hot reload: `npm run dev` (web on http://localhost:5173, API on :3001).

| Command | What it does |
|---|---|
| `npm run build:pages -w apps/web` | Static build for GitHub Pages (no server needed, see below) |
| `npm run seed` | Reset the database: 3 trains, 14 wagons, 5 routes, ~800 departures, demo bookings |
| `npm test` | Unit tests for the algorithms (seat auto-pick, re-seating, ticket signatures) |

Staff accounts: `admin / admin123` (everything) and `conductor / conductor123` (scanner + seat maps).

## Live demo (GitHub Pages)

GitHub Pages only serves static files, so the Pages build runs **the same API code in the browser**:
the route table (`apps/api/src/core/routes.ts`) runs on SQLite compiled to WebAssembly (sql.js).
Every visitor gets their own demo database, saved in the browser (IndexedDB), so bookings survive a reload.
The Node server (`npm start`) uses exactly the same core with `node:sqlite`.

Deploy: build with `npm run build:pages -w apps/web` (output in `apps/web/dist-pages`, base path `/ProiectPA/`),
then publish that folder on the `gh-pages` branch and select it under *Settings → Pages*.

## What it does

**Passengers**
- Routes, a 14-day availability calendar, and departures with a mini picture of each train and its amenity icons.
- Each departure shows a "least crowded" badge on the emptiest train.
- **Train map**: the whole train is drawn locomotive-first, with the class, amenity icons and free seats of every wagon.
  Click a wagon to open its seat plan.
- **Seat plans** for 8 wagon types, all with numbered seats:
  - 2nd class saloon 2+2 (with tables) and a quiet saloon
  - 1st class compartments (CFR numbering 11–16, 21–26…)
  - couchettes with lower/middle/upper berths
  - sleeping car
  - dining car (not bookable)
  - multi-purpose wagon: wheelchair spaces, bikes, strollers, kids corner
  - panoramic 2+1 wagon
- Every seat shows its backrest (which way it faces). Hovering a seat shows its details: window/aisle, table, berth level, price.
- Preference filters (window, aisle, facing forward, table, quiet, lower berth, near the restaurant, …) dim the seats that don't match.
- **"Pick the best seats for me"** keeps a group together around a table, in a compartment or in a row.
- **Book the whole compartment** for sleeping cars and couchettes.
- Seats are **held for 10 minutes** while you book, with a countdown. Other users see them as "being booked".
  The map refreshes live.
- A passenger type (adult, child, student, senior) can be set per seat.
- Simulated payment, then digital tickets with one **QR code per passenger**, a "find your wagon" diagram, printing,
  and cancellation.
- Romanian / English interface. The seat map is usable with the keyboard (arrow keys) and screen readers.
- On phones the wagon plan rotates to vertical.

**Staff (`/admin`)**
- Departures per day with occupancy, number boarded, and stats.
- Cancel a trip, or **change its train**. Passengers are automatically re-seated on similar seats, with a preview first.
- **Live seat map** of a departure: who sits where, who has boarded, block or unblock seats.
- **Ticket scanner**: uses the phone camera to read the QR code, or takes a typed booking code. Results:
  - green: valid
  - orange: already used, or wrong departure
  - red: invalid or forged
- Schedule: add one departure, or generate a **recurring schedule** (weekdays × times × date range).
- **Fleet editor**: rename trains, reorder or add/remove wagons, toggle each wagon's amenity icons.

## Algorithms (our own)
| Algorithm | Where |
|---|---|
| Best seats together: scores groups (compartments / table bays / rows, and neighbouring groups) by togetherness, preferences, isolated seats left over, and wagon load | `apps/api/src/core/seats.ts` → `autoPick` |
| Re-seating when a trip changes train: keeps seats that still exist, moves the rest to the most similar seats, keeps bookings in the same wagon | `planReseat` |
| Temporary seat holds with expiry, plus a unique DB index, so no seat can be sold twice | `PUT /api/trips/:id/hold`, `tickets_seat` index |
| Signed tickets (HMAC). The QR code holds no personal data. Scanning is atomic (`VALID → USED`), so a ticket can't be used twice | `core/util.ts` → `makeToken/readToken`, `/api/admin/scan` |
| Recurring schedule generation, idempotent | `/api/admin/schedule` |

## Structure
```
apps/api   API. src/core = runtime-independent logic (layouts.ts seat plans, seats.ts algorithms,
           routes.ts route table, sql.ts database facade); server.ts / node-db.ts = Node + Express adapter
apps/web   React + TypeScript + Vite (components/TrainMap, WagonPlan, TrainStrip; pages/…; i18n.tsx;
           local/localServer.ts = in-browser API for the static demo)
docs/      Project plan
```
