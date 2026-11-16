export class ApiError extends Error {
  constructor(public status: number, message: string, public data: any) { super(message); }
}

export function getStaffToken() {
  try { return localStorage.getItem('staffToken'); } catch { return null; }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const tok = getStaffToken();
  if (tok && path.startsWith('/api/admin')) headers.authorization = `Bearer ${tok}`;
  const res = await fetch(path, { method: opts.method ?? 'GET', headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path.startsWith('/api/admin')) window.dispatchEvent(new Event('staff-unauthorized'));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data);
  return data as T;
}

/** A per-browser id used to own seat holds. */
export function sessionId(): string {
  try {
    let s = sessionStorage.getItem('seatSession');
    if (!s) { s = crypto.randomUUID(); sessionStorage.setItem('seatSession', s); }
    return s;
  } catch {
    return (window as any).__seatSession ??= Math.random().toString(36).slice(2);
  }
}

export const fmtTime = (iso: string) => iso.slice(11, 16);
export const fmtMoney = (n: number) => `${n.toFixed(n % 1 ? 2 : 0)} lei`;
export function fmtDate(date: string, lang: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(date.slice(0, 10) + 'T12:00:00').toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-GB', opts);
}
export const fmtDuration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min} min`);
