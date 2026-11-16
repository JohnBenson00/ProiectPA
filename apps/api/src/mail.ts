/** Booking confirmation / cancellation emails over SMTP (optional). */
import nodemailer from 'nodemailer';
import { cfg } from './config.js';
import { bookingOut } from './core/routes.js';

const transport = cfg.smtpUrl ? nodemailer.createTransport(cfg.smtpUrl) : null;
export const emailEnabled = !!transport;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (n: number) => `${n.toFixed(2).replace('.', ',')} lei`;

async function send(code: string, kind: 'created' | 'cancelled') {
  if (!transport) return;
  const b = bookingOut(code, undefined, true);
  const link = `${cfg.publicUrl}/ticket/${b.code}?email=${encodeURIComponent(b.email)}`;
  const when = `${b.trip.departure.slice(0, 10)} ${b.trip.departure.slice(11)}`;
  const seats = b.tickets.map((t) => `Vagon ${t.wagonNumber}, loc ${t.seatLabel} (${t.passengerType}) – ${money(t.price)}`);
  const subject = kind === 'created'
    ? `Bilete ${b.code} – ${b.trip.route.name}, ${when}`
    : `Rezervare anulată ${b.code} – ${b.trip.route.name}, ${when}`;
  const intro = kind === 'created'
    ? 'Rezervarea dumneavoastră a fost confirmată. Arătați codul QR controlorului la urcare.'
    : 'Rezervarea dumneavoastră a fost anulată.';
  const text = [
    `Bună ziua, ${b.name},`, '', intro, '',
    `Cod rezervare: ${b.code}`, `Cursa: ${b.trip.route.code} ${b.trip.route.name}`, `Plecare: ${when}`, `Tren: ${b.trip.train.name}`, '',
    ...seats, '', `Total: ${money(b.total)}`, '', kind === 'created' ? `Biletele (cu cod QR): ${link}` : '', '', 'Râșnov Trains',
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1d2530;max-width:560px">
    <p>Bună ziua, ${esc(b.name)},</p><p>${intro}</p>
    <table style="border-collapse:collapse;font-size:14px">
      <tr><td style="color:#6b7380;padding:2px 12px 2px 0">Cod rezervare</td><td><b>${b.code}</b></td></tr>
      <tr><td style="color:#6b7380;padding:2px 12px 2px 0">Cursa</td><td>${esc(b.trip.route.code)} ${esc(b.trip.route.name)}</td></tr>
      <tr><td style="color:#6b7380;padding:2px 12px 2px 0">Plecare</td><td>${when}</td></tr>
      <tr><td style="color:#6b7380;padding:2px 12px 2px 0">Tren</td><td>${esc(b.trip.train.name)}</td></tr>
    </table>
    <p>${seats.map(esc).join('<br>')}</p><p><b>Total: ${money(b.total)}</b></p>
    ${kind === 'created' ? `<p><a href="${link}" style="background:#1c55b0;color:#fff;padding:8px 14px;text-decoration:none;border-radius:4px">Deschide biletele</a></p>` : ''}
    <p style="color:#6b7380">Râșnov Trains</p></div>`;
  await transport.sendMail({ from: cfg.mailFrom, to: b.email, subject, text, html });
}

/** Fire-and-forget: a mail problem never breaks a booking. */
export function sendBookingMail(code: string, kind: 'created' | 'cancelled') {
  send(code, kind).catch((e) => console.error(`[mail] ${kind} ${code}:`, e?.message ?? e));
}
