/** Time, crypto and token helpers that work identically on Node and in the browser. */
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { scrypt } from '@noble/hashes/scrypt';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

let SECRET = 'dev-secret-change-me';
export function setSecret(s: string) { SECRET = s; }

/** Current local time in Romania as 'YYYY-MM-DDTHH:MM'. Departures are stored in local time. */
export function nowLocal(): string {
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
  return s.replace(' ', 'T');
}
export const todayLocal = () => nowLocal().slice(0, 10);

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------- passwords (scrypt) ----------
const SCRYPT = { N: 16384, r: 8, p: 1, dkLen: 32 };
export function hashPassword(pw: string): string {
  const salt = bytesToHex(randomBytes(16));
  return `${salt}:${bytesToHex(scrypt(pw, salt, SCRYPT))}`;
}
export function checkPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  return equal(bytesToHex(scrypt(pw, salt, SCRYPT)), bytesToHex(hexToBytes(hash)));
}

// ---------- signed tokens (tickets + staff sessions), HMAC-SHA256 ----------
function b64url(bytes: Uint8Array) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
const sign = (payload: string) => b64url(hmac(sha256, utf8ToBytes(SECRET), utf8ToBytes(payload))).slice(0, 22);

export function makeToken(data: object): string {
  const p = b64url(utf8ToBytes(JSON.stringify(data)));
  return `${p}.${sign(p)}`;
}
export function readToken<T>(token: string): T | null {
  const [p, s] = token.trim().split('.');
  if (!p || !s || !equal(sign(p), s)) return null;
  try {
    return JSON.parse(fromB64url(p)) as T;
  } catch {
    return null;
  }
}

export function bookingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join('');
}

export const PASSENGER_TYPES = [
  { code: 'ADULT', label: 'Adult', factor: 1 },
  { code: 'CHILD', label: 'Child (6-14)', factor: 0.5 },
  { code: 'STUDENT', label: 'Student', factor: 0.5 },
  { code: 'SENIOR', label: 'Senior (65+)', factor: 0.7 },
];
