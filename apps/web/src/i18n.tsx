import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'ro' | 'en';

/** English text is the key. These entries are codes that also need an English label. */
const EN: Record<string, string> = {
  seat_free: 'Available', seat_selected: 'Your selection', seat_held: 'Reservation in progress', seat_sold: 'Occupied', seat_used: 'Boarded', seat_blocked: 'Unavailable',
  Wagon: 'Coach', 'Previous wagon': 'Previous coach', 'Next wagon': 'Next coach', 'Find your wagon': 'Find your coach', W: 'C', wagons: 'coaches',
  'The locomotive is at the front. Your wagons are highlighted – count from the locomotive.': 'The locomotive is at the front. Your coach is highlighted – count from the locomotive.',
  step_seats: 'Seats', step_details: 'Details', step_pay: 'Payment', step_ticket: 'Ticket',
  avail_high: 'many seats', avail_mid: 'filling up', avail_low: 'almost full', avail_none: 'no trains',
  scan_OK: 'Valid – board', scan_USED: 'Already used', scan_WRONG_TRIP: 'Wrong departure', scan_CANCELLED: 'Cancelled ticket', scan_INVALID: 'Invalid ticket',
  ADULT: 'Adult', CHILD: 'Child', STUDENT: 'Student', SENIOR: 'Senior', ADMIN: 'administrator', CONDUCTOR: 'conductor',
  pick_together: 'seats together', 'pick_same row': 'same row', pick_single: 'best match', pick_split: 'not all together',
};

const RO: Record<string, string> = {
  ...{
    seat_free: 'Liber', seat_selected: 'Selectat', seat_held: 'Rezervare în curs', seat_sold: 'Ocupat', seat_used: 'Îmbarcat', seat_blocked: 'Indisponibil',
    step_seats: 'Locuri', step_details: 'Date', step_pay: 'Plată', step_ticket: 'Bilet',
    avail_high: 'multe locuri', avail_mid: 'se ocupă', avail_low: 'aproape plin', avail_none: 'fără curse',
    scan_OK: 'Valid – poftiți', scan_USED: 'Deja folosit', scan_WRONG_TRIP: 'Altă cursă', scan_CANCELLED: 'Bilet anulat', scan_INVALID: 'Bilet invalid',
    ADULT: 'Adult', CHILD: 'Copil', STUDENT: 'Student', SENIOR: 'Pensionar', ADMIN: 'administrator', CONDUCTOR: 'controlor',
    pick_together: 'locuri alăturate', 'pick_same row': 'pe același rând', pick_single: 'cea mai bună potrivire', pick_split: 'nu toate alăturate',
  },
  // amenities & seat attributes
  '1st class': 'Clasa 1', 'Accessible': 'Accesibil', 'Accessible toilet': 'Toaletă accesibilă', 'Air conditioning': 'Aer condiționat',
  'Audio guide': 'Ghid audio', 'Bar & snacks': 'Bar & gustări', 'Bicycles': 'Biciclete', 'Couchettes': 'Cușete', 'Family zone': 'Zonă pentru familii',
  'Heating': 'Încălzire', 'Lower berth': 'Pat jos', 'Middle berth': 'Pat mijloc', 'Upper berth': 'Pat sus', 'Luggage racks': 'Spațiu bagaje',
  'Panoramic windows': 'Geamuri panoramice', 'Pets allowed': 'Animale permise', 'Power sockets': 'Prize', 'Quiet zone': 'Zonă de liniște',
  'Restaurant': 'Restaurant', 'Sleeping compartments': 'Compartimente de dormit', 'Stroller space': 'Loc pentru cărucioare', 'Toilet': 'Toaletă',
  'Wheelchair spaces': 'Locuri pentru scaun rulant', 'Wi-Fi': 'Wi-Fi', 'Window': 'Fereastră', 'Aisle': 'Culoar', 'Middle': 'Mijloc',
  'Facing forward': 'În sensul de mers', 'Facing backward': 'Invers sensului de mers', 'Table': 'Masă', 'Near toilet': 'Lângă toaletă',
  'Compartment': 'Compartiment', 'Bed': 'Pat', 'Panoramic': 'Panoramic', 'Single seat': 'Loc individual', 'Near restaurant': 'Lângă vagonul restaurant',
  'Kids corner': 'Colț pentru copii', 'Kitchen': 'Bucătărie', 'Bar': 'Bar', 'Staff': 'Personal', 'Luggage': 'Bagaje',
  L: 'J', M: 'M', U: 'S', W: 'V',
  // wagons, trains, routes (data from the server)
  'Open saloon 2+2': 'Vagon salon 2+2', 'Quiet saloon 2+2': 'Vagon salon 2+2, zonă de liniște', '1st class compartments': 'Clasa 1 cu compartimente',
  'Couchette (6 berths)': 'Cușetă (6 paturi)', 'Sleeping car (2 berths)': 'Vagon de dormit (2 paturi)', 'Dining car': 'Vagon restaurant',
  'Multi-purpose (accessible, bikes, family)': 'Multifuncțional (accesibil, biciclete, familii)', 'Panoramic 2+1': 'Panoramic 2+1',
  'Open saloon, 2nd class, 2+2 seating with tables in the facing bays.': 'Vagon salon clasa a 2-a, scaune 2+2, cu mese la locurile față în față.',
  'Open saloon, 2nd class, quiet zone: phone calls and loud music are not allowed.': 'Vagon salon clasa a 2-a, zonă de liniște: fără convorbiri telefonice sau muzică tare.',
  '1st class wagon with 8 closed compartments of 6 seats and a side corridor. Wider seats, reading lights.': 'Vagon de clasa 1 cu 8 compartimente închise de câte 6 locuri și culoar lateral. Scaune mai late, lămpi de citit.',
  'Couchette wagon: 8 compartments with 6 berths each (lower, middle, upper). Bedding included.': 'Vagon cușetă: 8 compartimente cu câte 6 paturi (jos, mijloc, sus). Lenjerie inclusă.',
  'Sleeping car with 10 private compartments of 2 berths, washbasin, towels, and breakfast served by the attendant.': 'Vagon de dormit cu 10 compartimente private de 2 paturi, chiuvetă, prosoape și mic dejun servit de însoțitor.',
  'Restaurant car: hot meals, local specialties, coffee and drinks. Open to all passengers, no reservation needed.': 'Vagon restaurant: mâncare caldă, specialități locale, cafea și băuturi. Deschis tuturor călătorilor, fără rezervare.',
  'Low-floor wagon with 2 wheelchair spaces, accessible toilet, bicycle and stroller area, kids play corner and family tables.': 'Vagon cu podea joasă: 2 locuri pentru scaun rulant, toaletă accesibilă, spațiu pentru biciclete și cărucioare, colț de joacă și mese pentru familii.',
  'Panoramic wagon with glass roof and 2+1 forward-facing seats. Audio guide about the Râșnov citadel and the Bârsa land.': 'Vagon panoramic cu acoperiș de sticlă și scaune 2+1 în sensul de mers. Ghid audio despre Cetatea Râșnov și Țara Bârsei.',
  'Panoramic shuttle': 'Navetă panoramică', 'InterRegio': 'InterRegio', 'Night train': 'Tren de noapte',
  'Our panoramic tourist train that climbs from the valley to the Râșnov citadel. Glass roof, audio guide in 4 languages.': 'Trenulețul nostru panoramic care urcă din vale până la Cetatea Râșnov. Acoperiș de sticlă, ghid audio în 4 limbi.',
  'Comfortable regional train with 1st class compartments, a quiet saloon and a restaurant car.': 'Tren regional confortabil cu compartimente de clasa 1, vagon de liniște și vagon restaurant.',
  'Overnight train with sleeping cars and couchettes. Breakfast served in the morning.': 'Tren de noapte cu vagoane de dormit și cușete. Mic dejun servit dimineața.',
  'Panoramic shuttle up to the citadel.': 'Navetă panoramică până la cetate.', 'Panoramic shuttle back down to the valley.': 'Navetă panoramică înapoi în vale.',
  'InterRegio through the Bârsa land.': 'InterRegio prin Țara Bârsei.', 'InterRegio back to Brașov.': 'InterRegio înapoi spre Brașov.',
  'Overnight train to the seaside, with sleeping cars.': 'Tren de noapte spre mare, cu vagoane de dormit.',
  // passenger types
  'Adult': 'Adult', 'Child (6-14)': 'Copil (6-14 ani)', 'Student': 'Elev / student', 'Senior (65+)': 'Pensionar (65+)',
  // UI
  'Add': 'Adaugă', 'Add departure': 'Adaugă cursa', 'Add one departure': 'Adaugă o cursă', 'Add wagon': 'Adaugă vagon', 'Admin sections': 'Secțiuni administrare',
  'All departures': 'Toate cursele', 'All trains': 'Toate trenurile', 'Any departure today': 'Orice cursă de azi',
  'At most 12 places per booking.': 'Maximum 12 locuri pe rezervare.', 'Back': 'Înapoi', 'Backrest (seat faces away from it)': 'Spătar (scaunul este orientat invers față de el)',
  'Block seat': 'Blochează locul', 'Blocked': 'Blocate', 'Boarded': 'Îmbarcați', 'Boarded today': 'Îmbarcați azi', 'Boarding for departure': 'Îmbarcare pentru cursa',
  'Book the whole compartment': 'Rezervă tot compartimentul', 'Booking code': 'Cod rezervare', 'Booking code or ticket code': 'Cod rezervare sau cod bilet',
  'Camera not available. Allow camera access or type the booking code below.': 'Camera nu este disponibilă. Permite accesul la cameră sau introdu codul rezervării mai jos.',
  'Cancel': 'Anulează', 'Cancel booking': 'Anulează rezervarea', 'Cancelled': 'Anulat', 'Capacity': 'Capacitate', 'Card number': 'Număr card', 'Check': 'Verifică',
  'Choose seats': 'Alege locurile', 'Choose the day': 'Alege ziua',
  'Choose your departure, pick your exact seat on the train map and board with the QR code on your phone. No queue at the ticket office.': 'Alege cursa, alege exact locul pe harta trenului și urcă la bord cu codul QR de pe telefon. Fără coadă la casierie.',
  'Click any seat to see who booked it, or to block it.': 'Apasă pe un loc ca să vezi cine l-a rezervat sau ca să-l blochezi.',
  'Click free seats on the map, or let us pick the best ones.': 'Apasă pe locurile libere de pe hartă sau lasă-ne pe noi să alegem cele mai bune.',
  'Color': 'Culoare', 'Composition': 'Compunere', 'Confirm cancel': 'Confirmă anularea', 'Contact details': 'Date de contact', 'Continue': 'Continuă',
  'Continue to payment': 'Continuă spre plată', 'Date': 'Data', 'Date and time': 'Data și ora',
  'Demo mode: no real payment is made. Any card number works.': 'Mod demonstrativ: nu se face nicio plată reală. Orice număr de card funcționează.',
  'Departed': 'Plecat', 'Departure added.': 'Cursa a fost adăugată.', 'Departure times (HH:MM, comma separated)': 'Ore de plecare (HH:MM, separate prin virgulă)',
  'Departures': 'Curse', 'Departures today': 'Curse azi', 'Description': 'Descriere', 'Direction of travel': 'Sensul de mers', 'Email': 'Email',
  'Every train is drawn wagon by wagon, so you know exactly where the restaurant, the sleeping cars or the bike space are.': 'Fiecare tren este desenat vagon cu vagon, ca să știi exact unde sunt restaurantul, vagoanele de dormit sau locul pentru biciclete.',
  'Expiry': 'Expirare', 'Fewer passengers': 'Mai puțini călători', 'Find a booking': 'Caută o rezervare', 'Find your wagon': 'Găsește-ți vagonul', 'From': 'De la',
  'Full name': 'Nume complet', 'Generate departures': 'Generează cursele',
  'Generates departures for every selected weekday between the two dates. Existing departures are skipped.': 'Generează curse pentru fiecare zi a săptămânii bifată, între cele două date. Cursele existente sunt sărite.',
  'I agree to the terms and to the processing of my data for this booking (GDPR).': 'Sunt de acord cu termenii și cu prelucrarea datelor mele pentru această rezervare (GDPR).',
  'Icon legend': 'Legenda iconițelor', 'Language': 'Limba', 'Last scans': 'Ultimele scanări', 'Least crowded': 'Cea mai liberă', 'Legend': 'Legendă',
  'Locomotive': 'Locomotivă', 'Log in': 'Autentificare', 'Log out': 'Ieșire', 'Main': 'Principal', 'More passengers': 'Mai mulți călători',
  'Move towards locomotive': 'Mută spre locomotivă', 'Move towards the end': 'Mută spre coada trenului', 'My preferences': 'Preferințele mele',
  'My tickets': 'Biletele mele', 'Name': 'Nume', 'Next wagon': 'Vagonul următor', 'No departures on this day.': 'Nu sunt curse în această zi.',
  'Not found': 'Nu a fost găsit', 'Not yet boarded': 'Neîmbarcați', 'Occupancy': 'Grad de ocupare', 'On board': 'La bord',
  'Online sales, 30 days': 'Vânzări online, 30 de zile', 'Our trains': 'Trenurile noastre', 'Passenger': 'Călător',
  'Passenger type for seat {s}': 'Tip călător pentru locul {s}', 'Passengers': 'Călători', 'Password': 'Parolă', 'Pay': 'Plătește', 'Payment': 'Plată',
  'Payment successful – have a nice trip!': 'Plata a reușit – călătorie plăcută!', 'Phone': 'Telefon', 'Phone (optional)': 'Telefon (opțional)',
  'Pick the best seats for me': 'Alege-mi cele mai bune locuri', 'Previous wagon': 'Vagonul anterior',
  'Prices are per person for this route. Children under 6 travel free without a seat.': 'Prețurile sunt de persoană pentru această rută. Copiii sub 6 ani călătoresc gratuit, fără loc.',
  'Print / PDF': 'Tipărește / PDF', 'Reason (optional)': 'Motiv (opțional)', 'Recurring schedule': 'Program recurent', 'Refresh': 'Reîncarcă',
  'Remove seat {s}': 'Elimină locul {s}', 'Remove wagon': 'Elimină vagonul', 'Route': 'Ruta', 'Routes': 'Rute', 'Saved.': 'Salvat.',
  'Scan with camera': 'Scanează cu camera', 'Scheduled': 'Programată', 'Seat details': 'Detalii loc', 'Seat map': 'Harta locurilor', 'Seat plan': 'Planul locurilor',
  'Seats held for': 'Locuri reținute încă', 'Select {n} more': 'Mai alege {n}', 'Show on map': 'Arată pe hartă',
  'Show the QR code to the conductor when boarding. Save this page to your home screen to open it offline.': 'Arată codul QR controlorului la urcare. Salvează pagina pe ecranul principal ca s-o poți deschide și fără internet.',
  'Show tickets': 'Arată biletele', 'Skip to content': 'Sari la conținut', 'Sold': 'Vândute', 'Sold out': 'Epuizat',
  'Sorry, seat {s} was just taken by someone else.': 'Ne pare rău, locul {s} tocmai a fost ocupat de altcineva.', 'Staff login': 'Autentificare personal',
  'Status': 'Stare', 'Steps': 'Pași', 'Stop camera': 'Oprește camera',
  'Student project prototype – prices and payments are fictional.': 'Prototip – proiect studențesc. Prețurile și plățile sunt fictive.',
  'The locomotive is at the front. Your wagons are highlighted – count from the locomotive.': 'Locomotiva este în față. Vagonul tău este evidențiat – numără de la locomotivă.',
  'The whole compartment is now selected ({n} berths).': 'Tot compartimentul este acum selectat ({n} paturi).',
  'This wagon has no reservable seats. It is open to all passengers of the train.': 'Acest vagon nu are locuri rezervabile. Este deschis tuturor călătorilor din tren.',
  'Ticket': 'Bilet', 'Tickets for the Râșnov trains': 'Bilete pentru trenulețele din Râșnov', 'Tickets per day': 'Bilete pe zi', 'Tickets today': 'Bilete azi',
  'Time': 'Ora', 'To': 'Până la', 'Total': 'Total', 'Train': 'Tren', 'Train changed and passengers re-seated.': 'Trenul a fost schimbat și călătorii au fost mutați.',
  'Train composition': 'Compunerea trenului', 'Trains': 'Trenuri', 'Trip cancelled. All its tickets were cancelled.': 'Cursa a fost anulată, împreună cu toate biletele ei.',
  'Type': 'Tip', 'Unblock seat': 'Deblochează locul', 'Username': 'Utilizator', 'Valid': 'Valabil', 'Wagon': 'Vagon',
  'Wagon added at the end of the train.': 'Vagonul a fost adăugat la coada trenului.', 'Wagon removed.': 'Vagonul a fost eliminat.',
  'We found {n} seats in wagon {w}': 'Am găsit {n} locuri în vagonul {w}',
  'We send the tickets to this email. You can also find them later with the booking code.': 'Trimitem biletele pe acest email. Le poți găsi oricând și cu codul rezervării.',
  'Weekdays': 'Zilele săptămânii',
  'Wheelchair space selected. Please also select a seat for your companion – seats 11–14 next to this area are best.': 'Ai ales un loc pentru scaun rulant. Alege și un loc pentru însoțitor – locurile 11–14 de lângă această zonă sunt cele mai potrivite.',
  'Yes, cancel all tickets': 'Da, anulează toate biletele',
  'You already selected {n} seats. Add a passenger or remove a seat first.': 'Ai ales deja {n} locuri. Adaugă un călător sau elimină mai întâi un loc.',
  'Your seat reservation expired. Please select your seats again.': 'Rezervarea temporară a locurilor a expirat. Te rugăm să alegi din nou.',
  'Your selection': 'Selecția ta', 'class': 'clasa', 'e.g. broken seat, counter sale': 'ex. scaun defect, vânzare la casă', 'free': 'libere', 'from': 'de la',
  'no seats': 'fără locuri', 'not bookable': 'nu se rezervă', 'other seats are dimmed': 'celelalte locuri sunt estompate', 'passengers': 'călători',
  'places': 'locuri', 'places selected': 'locuri alese', 'seats left': 'locuri libere', 'selected': 'alese', 'wagons': 'vagoane',
  '{c} departures created, {s} already existed.': '{c} curse create, {s} existau deja.',
  '{k} passengers keep their seat, {m} will be moved to similar seats, {u} do not fit. Continue?': '{k} călători își păstrează locul, {m} vor fi mutați pe locuri asemănătoare, {u} nu încap. Continui?',
  'Seat': 'Loc', 'Berth': 'Pat', 'Wheelchair space': 'Loc pentru scaun rulant', 'seat': 'loc', 'berth': 'pat', 'wheelchair space': 'loc pentru scaun rulant',
  'Train not found': 'Trenul nu a fost găsit',
  'Demo: bookings are stored only in this browser.': 'Demo: rezervările sunt salvate doar în acest browser.',
  'Seat preferences': 'Preferințe loc', held: 'reținute', 'Menu': 'Meniu', 'Place': 'Loc', 'Fare type': 'Tarif', 'Price': 'Preț',
  'Selected places': 'Locuri selectate', 'accessible': 'accesibil', 'Auto-assign seats': 'Alocare automată', 'Uses your preferences': 'Ține cont de preferințe',
  'Keeps your group together': 'Locuri alăturate pentru grup', 'Your reservation': 'Rezervarea ta', 'passenger': 'călător',
  'Select seats on the plan or use automatic assignment.': 'Alege locurile pe plan sau folosește alocarea automată.',
  'Prices per person, VAT included. Children under 6 travel free without a seat.': 'Prețuri de persoană, TVA inclus. Copiii sub 6 ani călătoresc gratuit, fără loc.',
  '{n} intermediate stops': '{n} opriri intermediare', 'direct': 'direct', 'Fares': 'Tarife', 'Facilities': 'Dotări',
  'About this coach': 'Despre vagon', 'free seats': 'locuri libere', 'Class': 'Clasa', 'Backrest': 'Spătar', 'Strollers': 'Cărucioare', 'Schedule': 'Program', 'Fleet': 'Flotă', 'Scanner': 'Scanner',
  '{ok}/{n} passengers boarded': '{ok}/{n} călători îmbarcați',
  'Not a valid ticket (signature check failed or unknown code).': 'Bilet nevalid (semnătură greșită sau cod necunoscut).',
  'Not enough free seats together for this party': 'Nu sunt destule locuri libere pentru acest grup',
  'Your seat reservation expired or some seats were taken. Please choose again.': 'Rezervarea temporară a expirat sau unele locuri au fost ocupate. Te rugăm să alegi din nou.',
  'This departure can no longer be booked': 'Această cursă nu mai poate fi rezervată',
  'That seat was just booked by someone else.': 'Locul tocmai a fost rezervat de altcineva.',
  'Booking not found. Check the code and the email address.': 'Rezervarea nu a fost găsită. Verifică codul și adresa de email.',
  'Wrong username or password': 'Utilizator sau parolă greșită', 'At most 12 seats per booking': 'Maximum 12 locuri pe rezervare',
  'Name and a valid email are required': 'Numele și un email valid sunt obligatorii',
};

const DICTS: Record<Lang, Record<string, string>> = { en: EN, ro: RO };

type Ctx = { lang: Lang; setLang: (l: Lang) => void };
const LangCtx = createContext<Ctx>({ lang: 'ro', setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try { return (localStorage.getItem('lang') as Lang) || (navigator.language.startsWith('ro') ? 'ro' : 'en'); } catch { return 'ro'; }
  });
  const setLang = (l: Lang) => { document.documentElement.lang = l; setLangState(l); try { localStorage.setItem('lang', l); } catch { /* ignore */ } };
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);

export function useT() {
  const { lang } = useLang();
  return useCallback((key: string, vars?: Record<string, string | number>) => {
    let s = DICTS[lang][key] ?? EN[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  }, [lang]);
}
