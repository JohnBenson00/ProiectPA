# Project plan: Râșnov tourist train booking app (Tema 4)

> Online booking, seat selection and digital QR tickets for the Râșnov tourist train
> (Valea Cetății ⇄ Cetatea Râșnov), plus a staff panel for trips, occupancy and ticket scanning.
> Prices in the app are made up. Payment is simulated.

---

## 0. Things to know before starting

1. **The real train is a small road train.** It is a tractor pulling 2–3 open or covered
   wagons on a short ride up to the citadel. Sleeping wagons and food wagons don't exist there.
   That is fine because we are told to bring original ideas. **Keep wagon types and amenities
   data-driven**, though. Then the app works for the real fleet (benches, open wagon, stroller
   space) and for our fictional "themed" trains (sleeping wagon, dining wagon) without code
   changes. During the client demo, show the real fleet first and present the fictional ones
   as extras.
2. **Ask whether seats are numbered.** On road trains people usually sit wherever there is
   room. If that is the case here, we still build full seat selection, but the admin panel lets
   each wagon be set to *numbered seats* or *free seating with a capacity only*.
3. The professor wants **our own algorithms** and **a good UI**. Seat selection is where both
   show, so most of the effort goes there (sections 5 and 6).
4. Teams compete, so ideas beyond the brief count. These are marked with ★.

---

## 1. Scope

### Must have (MVP: the client's brief)
- Customers can see the schedule (day → departure times → seats left).
- Customers choose a date, a time, the number of passengers and the seats.
- A digital ticket with a **QR code**, shown on the phone.
- Admin can **add and edit trips**.
- Admin can **see occupied seats** for each trip.
- Staff can **scan tickets** at boarding (phone camera).

### Our extensive part (the focus)
- **Interactive train map.** The whole train is drawn as wagons in order, with occupancy and
  amenity icons on each wagon. Click a wagon to zoom into its seat layout.
- **Very detailed seat selection.** Seats have attributes (window, aisle, facing forward,
  table, accessible, berth…). Customers can set preferences and filters, use "auto-pick best
  seats together", see a hold timer, see live availability, and choose a passenger type per
  seat.
- **Train and wagon info pages.** Each train has a name, photo, description and a composition
  diagram. Each wagon has amenity icons: 🛏 sleeping, 🍽 food, ☕ bar, 🚻 WC, ♿ accessible,
  👶 stroller, 🚲 bike, 🐕 pets, ❄ AC, 🔥 heated, 🔌 power, 📶 Wi-Fi, 🤫 quiet zone,
  🌄 panoramic / open-air, 🎧 audio guide.
- **Fleet editor** in the admin panel: build trains from wagons, reorder them, and toggle
  amenities.

### ★ Original ideas (pick 3–5, don't do them all)
| Idea | Why it matters | Effort |
|---|---|---|
| Return ticket bundling (up + down; fixed or open return) | This is how most people actually ride | M |
| RO / EN (+ DE/HU) interface | Tourist destination | S |
| PWA: ticket works **offline** | Signal at the citadel may be weak | S–M |
| Waitlist for sold-out trips, with automatic email when a seat frees up | Turns cancellations back into sales | M |
| "Least crowded departure" suggestion based on occupancy | Reduces queues, which was the client's stated problem | S |
| Weather banner (rain + open wagon warning) | Open-air wagons | S |
| Simulated live train position on the route map, "next train in 7 min" | Looks great in a demo | M |
| Counter / kiosk mode: the cashier sells walk-in tickets from the same seat map | One shared seat inventory for online and counter sales | M |
| Visual **wagon layout editor** (paint seats on a grid) | Very impressive in the admin demo | L |
| Group tickets split to individual phones (share link per passenger) | Families and school groups | M |
| Post-ride feedback / rating | Gives the client data | S |
| Themed trips (evening "dinner train" with the food wagon) | Gives the fictional wagons a real purpose | S (data only) |

---

## 2. Questions for the client (send to Alexandra to collect)

The client is addressed formally, in Romanian:

1. Câte trenulețe aveți și din câte vagoane este compus fiecare? Câte locuri are fiecare vagon?
2. Locurile sunt numerotate sau libere? Ați dori locuri alocate în aplicație?
3. Care este programul curselor (frecvență, primă/ultimă cursă, sezon, zile închise)?
4. Există stații intermediare? Cât durează o cursă?
5. Se vând bilete dus, întors și dus-întors? Întoarcerea are oră fixă sau este liberă?
6. Ce categorii de bilete există (adult, copil, elev/student, pensionar, grup, gratuități)?
7. Doriți să păstrați o cotă de locuri pentru vânzarea de la casierie?
8. Ce politică de anulare/rambursare doriți?
9. Ce date despre client sunt necesare (nume, telefon, email)?
10. Câți angajați vor folosi panoul de administrare și ce dispozitive au pentru scanare?
11. Ce se întâmplă la vreme rea – se anulează cursele? Cum anunțăm clienții?
12. Sunt permise animale, biciclete, cărucioare? Există acces pentru persoane cu dizabilități?
13. Putem folosi logo-ul, fotografii și culorile firmei în prototip?
14. În ce limbi ar trebui să fie disponibilă aplicația?
15. Plata online va fi simulată în prototip. Este în regulă?

---

## 3. Tech stack (recommended)

| Layer | Choice | Why |
|---|---|---|
| Frontend | **React + TypeScript + Vite**, Tailwind CSS | Fast to build, works well for an SVG seat map |
| Seat map | Plain **SVG** React components (+ `react-zoom-pan-pinch` for mobile) | Full control, accessible, scales cleanly |
| Icons | Lucide / Tabler icons + a few custom SVGs (sleeping, dining wagon) | Consistent style |
| Backend | **Node.js + Express** (or NestJS) + TypeScript | One language across the stack, shared types |
| Database | **PostgreSQL** + Prisma ORM | Unique constraints and transactions prevent double booking |
| Live updates | Server-Sent Events (or Socket.IO) | Seat map updates when others book |
| QR | `qrcode` (generate) + `html5-qrcode` (scan in the browser) | No native app needed |
| Auth | JWT + bcrypt for staff; guest checkout for customers | Simple |
| Email | Nodemailer + Mailtrap / Ethereal (fake inbox) | Ticket emails without real sending |
| PDF ticket | `pdfkit` or a print-styled page | Optional |
| Tests | Vitest (unit), Supertest (API), Playwright (E2E) | |
| Hosting | Render / Railway (API + DB), Vercel / Netlify (web) | Free tiers, live URL for demos |

If the team is stronger in Java or C#, Spring Boot or ASP.NET with the same React frontend is
fine. The design below doesn't depend on the backend language.

**Repo layout (monorepo):**
```
apps/web        React app (customer site + admin panel + scanner)
apps/api        REST API
packages/shared Types, seat-layout schema, amenity catalog, validation (zod)
docs/           Plan, spec, architecture, user manual, screenshots
```

---

## 4. Data model

```
Station(id, name, lat, lng)
Route(id, name, stops[] {stationId, order, minutesFromStart})

Amenity(code, icon, label_ro, label_en)                -- catalog: SLEEPING, DINING, WC, ...
WagonLayout(id, name, kind, gridJson)                  -- reusable template (see 4.1)
Wagon(id, number, layoutId, name, photoUrl, amenities[], seatingMode: NUMBERED|FREE, capacity)
TrainSet(id, name, description, photoUrl, locomotive, wagons[] {wagonId, position})

ScheduleRule(id, routeId, trainSetId, daysOfWeek, times[], validFrom, validTo, exceptions[])
Trip(id, routeId, trainSetId, departureAt, status: SCHEDULED|BOARDING|DEPARTED|CANCELLED)

PassengerType(code, label, priceFactor)                -- ADULT, CHILD, STUDENT, SENIOR, FREE
SeatHold(id, tripId, seatKey, sessionId, expiresAt)    -- temporary lock, ~10 min
Booking(id, code, tripId, returnTripId?, name, email, phone, status: PENDING|PAID|CANCELLED, total, createdAt)
Ticket(id, bookingId, tripId, seatKey, passengerType, token, status: VALID|USED|CANCELLED, scannedAt, scannedBy)
BlockedSeat(tripId|null, wagonId, seatKey, reason)     -- maintenance, counter quota, staff
StaffUser(id, email, passwordHash, role: ADMIN|CONDUCTOR)
AuditLog(id, userId, action, entity, data, at)
```

Important constraints:
- `UNIQUE(tripId, seatKey)` on active tickets. This is the database-level guarantee against
  double booking.
- `seatKey = "<wagonPosition>-<seatLabel>"`, for example `2-14A`.
- `Ticket.token` is a signed value (see 7). The QR code contains **no personal data**.

### 4.1 Wagon layout format (shared between frontend and backend)

A layout is a grid of cells. The same format draws seat wagons, sleeping compartments and
dining tables.

```json
{
  "name": "Covered wagon 2+2",
  "kind": "SEATING",
  "cols": 5, "rows": 8,
  "cells": [
    { "r": 0, "c": 0, "type": "DOOR" },
    { "r": 1, "c": 0, "type": "SEAT", "label": "1A", "attrs": ["WINDOW", "FORWARD"] },
    { "r": 1, "c": 1, "type": "SEAT", "label": "1B", "attrs": ["AISLE", "FORWARD"] },
    { "r": 1, "c": 2, "type": "AISLE" },
    { "r": 1, "c": 3, "type": "SEAT", "label": "1C", "attrs": ["AISLE", "FORWARD"] },
    { "r": 1, "c": 4, "type": "SEAT", "label": "1D", "attrs": ["WINDOW", "FORWARD"] },
    { "r": 2, "c": 0, "type": "TABLE", "span": [1, 2] },
    { "r": 7, "c": 4, "type": "WHEELCHAIR", "label": "W1", "attrs": ["ACCESSIBLE"] }
  ],
  "groups": [ { "id": "row1", "seats": ["1A", "1B"] } ]
}
```
Cell types: `SEAT, BERTH_LOWER, BERTH_UPPER, WHEELCHAIR, STROLLER, BENCH, TABLE, AISLE, DOOR,
WC, BAR, KITCHEN, LUGGAGE, BIKE, WALL`.
Seat attributes: `WINDOW, AISLE, FORWARD, BACKWARD, TABLE, ACCESSIBLE, QUIET, NEAR_WC,
NEAR_DOOR, COMPARTMENT:<id>, OPEN_AIR`.
`groups` define compartments, rows and tables. The auto-pick algorithm uses them to keep
people together.

### 4.2 Seed fleet (realistic + fictional)
- **"Cetățuia"** (real-like road train): open panoramic wagon (bench seating, 24), covered
  wagon (24, stroller space), accessible wagon (16 + 2 wheelchair spots).
- **"Expresul Bârsei"** (fictional heritage train): locomotive, 2× seating wagons 2+2,
  **dining wagon** (tables of 4, bar), **sleeping wagon** (6 compartments × 4 berths), luggage
  & bike wagon.
- **"Trenulețul Copiilor"** (fictional themed): family wagon with kids' zone, quiet wagon.

---

## 5. Customer experience (screens)

1. **Home.** Hero, route map (Valea Cetății → Cetatea), "Next departures today" cards, language
   switch.
2. **Choose date.** Calendar colored by availability (green / orange / red / closed).
3. **Choose departure.** A card per time, showing the train name, mini composition strip with
   amenity icons, seats left, and a "★ least crowded" badge.
4. **Passengers.** Steppers for adult / child / student / senior, and a "return trip?" toggle.
5. **Train map + seat selection** (main screen, see 6).
6. **Your details.** Name, email, phone, terms and GDPR checkbox.
7. **Payment (simulated).** Fake card form with a clear "DEMO – no real payment" notice.
8. **Ticket.** One QR per passenger, with wagon / seat / time and a "how to find your wagon"
   mini diagram. Download PDF, add to home screen (PWA), share each passenger's ticket.
9. **Manage booking.** Look up by booking code + email; view, change seats, cancel.
10. **Train info pages.** Photo, description, capacity, composition diagram, amenity legend and
    accessibility info.

---

## 6. Train map & seat selection (detailed spec)

### 6.1 Two zoom levels
- **Train overview (minimap).** A horizontal strip of wagons in real order, locomotive first.
  Each wagon shows its number, type icon, amenity icons, an occupancy bar (e.g. 18/24) and a
  color for its fill level. Wagons that can't be booked (dining, luggage) are drawn but marked
  "not bookable" with an info tooltip. Example: *"Dining wagon: open to all passengers, menu
  →"*.
- **Wagon detail.** The SVG seat layout from `gridJson`. Clicking a wagon in the minimap
  scrolls or animates to it. Previous/next wagon arrows. On mobile the wagons are a swipe
  carousel with pinch zoom.

### 6.2 Seat states (color + **pattern/icon**, so they are color-blind safe)
Available · Selected (by me) · Held by someone else (striped, "being booked") · Sold ·
Blocked (staff) · Accessible-only · Filtered out (dimmed).

### 6.3 Interactions
- Click or tap a seat to toggle it. The chip "Seat 2-14A • Adult ▾" lets you change the
  passenger type per seat.
- You can't select more seats than passengers. Selecting one more replaces the oldest
  selection, with a hint.
- Hovering or long-pressing a seat shows a tooltip: "14A • window • forward-facing • table •
  2 rows from WC".
- **Preferences panel:** window, aisle, forward-facing, table, quiet zone, near dining wagon,
  near exit, accessible. Matching seats are highlighted and the rest are dimmed.
- **"Pick best seats for me" button** runs the auto-allocation algorithm (6.4) and shows the
  result with a short "why" ("4 seats together around a table, window, forward").
- **Sleeping wagon:** choose single berths (upper/lower) or "book whole compartment".
- **Wheelchair space:** requires choosing a companion seat next to it.
- **Hold timer:** after the first seat is selected, the server places a hold and a
  "Seats held for 9:41" countdown appears. When it expires the seats are released.
- **Live updates:** seats change state in real time when others hold or buy them (SSE). If a
  selected seat gets taken, a toast appears: "Seat 14A was just booked, here are 2 similar
  seats".
- **Keyboard & screen reader:** arrow keys move between seats, Enter selects, each seat has an
  `aria-label` ("Wagon 2, seat 14A, window, available").
- **Legend** of seat states + amenity icons, always reachable.
- **Summary sidebar** (bottom sheet on mobile): selected seats, passenger types, price, and a
  Continue button.

### 6.4 Algorithm: best seats together (our own)
Input: N passengers, preferences, current availability.
1. Collect candidate *groups* in each bookable wagon (compartments, table groups, rows, and
   row pairs across the aisle).
2. For each group with ≥ N free seats, try all N-subsets (small numbers, brute force is fine) or
   use a sliding window along the rows.
3. Score: `+10` all in the same group, `+5` adjacent, `+2` per seat matching each preference,
   `−3` split across the aisle, `−8` split across rows, `+1` per seat for a less full wagon
   (spreads load), `−20` if it would leave a single isolated free seat (avoids fragmentation).
4. Pick the highest score. If no group fits N, split into the fewest groups in the same wagon,
   then in neighbouring wagons.
5. Unit-test with fixed layouts and expected results.

### 6.5 Free-seating wagons
For wagons in `FREE` mode, show the layout as benches, with "Free seating – 12 of 24 places
left". Customers only pick the wagon, never a seat.

---

## 7. Tickets & QR security
- On payment, create one `Ticket` per passenger with
  `token = base64url(ticketId.tripId.exp) + "." + HMAC_SHA256(secret, payload)`.
- The QR encodes only the token, or a URL `https://.../t/<token>`.
- Scanner flow: verify the signature, then look the ticket up in the DB and check:
  - right trip / date / time window,
  - status VALID,
  - not CANCELLED.
- Mark the ticket USED (with time and conductor) in an atomic update
  (`UPDATE ... WHERE status='VALID'`). This makes double scans impossible even with 2
  conductors.
- Results shown full screen: **green** "OK – Wagon 2, Seat 14A, Adult", **orange** "Wrong
  departure (14:00, this is 13:00)", **red** "Already used at 13:02 by Ion".
- Manual code entry fallback (an 8-character booking code on the ticket).
- ★ Offline ticket: the ticket page is cached by the service worker, so the QR shows without
  signal.

---

## 8. Admin panel

| Section | Features |
|---|---|
| **Dashboard** | Today's trips, occupancy %, tickets sold, scanned vs. not scanned, alerts |
| **Trips** | Calendar / list view; add a single trip; **recurring schedule rules** (days + times + season) with a preview of generated trips; edit; cancel (bookings get notified) |
| **Live occupancy** | The same train map in admin mode: sold / held / scanned / blocked; click a seat to see booking details; block or unblock seats; move a passenger to another seat |
| **Counter sale** ★ | Sell a walk-in ticket from the map; print or show the QR |
| **Fleet** | Trains: create, rename, drag & drop wagon order, assign layouts, toggle amenities, upload photos. Layout templates: JSON at first, visual grid editor ★ later |
| **Bookings** | Search by code, email or name; resend ticket; cancel / refund (simulated) |
| **Scanner** | Camera scanner (mobile-first, big buttons), choose the current trip, counter of boarded passengers |
| **Reports** | Sales per day/week, occupancy per departure time (heatmap), no-show rate; CSV export |
| **Users** | ADMIN (everything) vs. CONDUCTOR (scanner + occupancy view only) |

**Algorithm: re-seating when a train changes.** If the admin swaps the train set or removes a
wagon on a trip with bookings, map each existing ticket to the most similar seat in the new
composition (same attributes, keep groups together, reuse 6.4 scoring). Show the admin a
preview, then notify customers whose seat changed.

**Algorithm: schedule generation.** Expand `ScheduleRule` into trips between two dates, skip
exceptions (holidays / closed days), and don't duplicate existing trips (idempotent).

---

## 9. API (first draft)

```
Public
GET  /api/trips?date=YYYY-MM-DD              list departures + seats left
GET  /api/trips/:id                          trip + train composition + layouts
GET  /api/trips/:id/availability             seat states (and SSE: /stream)
POST /api/trips/:id/holds                    {seatKeys[]} -> hold + expiresAt
DELETE /api/holds/:id
POST /api/trips/:id/auto-pick                {count, prefs} -> suggested seatKeys
POST /api/bookings                           {holdId, passengers[], contact, returnTripId?}
POST /api/bookings/:code/pay                 simulated payment
GET  /api/bookings/:code?email=              manage booking
GET  /api/trains, /api/trains/:id            info pages
GET  /api/amenities

Staff (JWT)
POST /api/auth/login
CRUD /api/admin/trips, /api/admin/schedule-rules, /api/admin/trains, /api/admin/wagons, /api/admin/layouts
POST /api/admin/trips/:id/block-seats
POST /api/admin/scan                         {token, tripId} -> OK / WRONG_TRIP / USED / INVALID
GET  /api/admin/reports/...
```

---

## 10. Non-functional
- **Concurrency:** holds and bookings run in DB transactions, backed by the unique index.
  Expired holds are cleaned up by a cron job every minute, and expiry is also checked on read.
- **Security:** HTTPS, hashed passwords, rate limiting on login / holds / scan, input validation
  (zod), and the role check runs on the server.
- **GDPR:** collect minimal data, show a privacy notice, delete booking contact data after
  N months (configurable).
- **Mobile-first:** most tourists book on their phone, and the scanner runs on a phone.
- **Accessibility:** keyboard navigation, aria labels, contrast, never color-only states.
- **i18n:** all UI strings in `ro.json` / `en.json` from day one.

---

## 11. Timeline (relative weeks; adjust to the real deadline)

| Week | Goal | Client-visible output |
|---|---|---|
| **1** (now) | Send questions to Alexandra; pick stack; set up repo, CI and the GitHub issues board; wireframes (Figma or paper) for the seat map, booking flow and scanner | Wireframes |
| **2** | DB schema + seed fleet; API for trips / trains; **static train map + seat layout rendering** from JSON | **Prototype 1:** clickable train map with fake data |
| **3** | Booking flow: date → time → passengers → seats (holds, timer) → details → simulated payment | |
| **4** | Tickets + QR + ticket page + email; manage booking; staff login | **Prototype 2:** full purchase end to end |
| **5** | Admin: trips CRUD, schedule rules, live occupancy map, block seats; scanner | |
| **6** | Auto-pick algorithm, preferences / filters, live updates (SSE), fleet editor, amenity icons everywhere, train info pages | **Prototype 3:** admin + scanner demo |
| **7** | Chosen ★ features (return trips, i18n, PWA offline, waitlist…), reports | |
| **8** | Testing (unit, API, E2E incl. double-booking race), accessibility pass, deployment, docs, user manual, final presentation and demo script | Final demo |

Show each prototype to the client (through Alexandra) and note their feedback in `docs/feedback.md`.

---

## 12. Team organization
Suggested roles (combine them if the team is small):
- **PM / client liaison.** Talks to Alexandra and the client, keeps the board up to date,
  writes the docs.
- **Seat map specialist (frontend).** Train map, seat states, interactions, accessibility.
- **Frontend booking flow.** Pages, forms, ticket page, i18n, PWA.
- **Backend.** DB, API, holds and concurrency, QR signing, email.
- **Admin + scanner.** Admin panel, fleet editor, scanner page, reports.
- **QA / algorithms.** Auto-pick + re-seating algorithms, tests, demo data.

Working rules: a GitHub issue for every task, a branch + PR per issue with 1 reviewer, a short
weekly sync, and a demo at the end of each week (even if small).

---

## 13. Definition of done (final)
- [ ] Deployed live URL + repo with a README (setup in under 5 commands)
- [ ] A customer can book seats on any train, including the sleeping and dining-wagon trains, and get a QR ticket
- [ ] Two browsers can't book the same seat (demonstrated)
- [ ] Admin can create a recurring schedule, edit and cancel trips, and edit the fleet
- [ ] Conductor can scan from a phone: valid / used / wrong trip
- [ ] Amenity icons and train info pages are complete
- [ ] At least 3 ★ original features
- [ ] Tests for the algorithms + the main E2E flow
- [ ] Docs: spec, architecture diagram, data model, user manual, presentation
