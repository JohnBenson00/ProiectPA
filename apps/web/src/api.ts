/** true in the GitHub Pages build, where there is no server */
export const LOCAL_API = import.meta.env.VITE_LOCAL_API === '1';

export class ApiError extends Error {
  constructor(public status: number, message: string, public data: any) { super(message); }
}

export function getStaffToken() {
  try { return localStorage.getItem('staffToken'); } catch { return null; }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const tok = getStaffToken();
  const auth = tok && path.startsWith('/api/admin') ? `Bearer ${tok}` : undefined;
  let status: number, data: any;
  if (LOCAL_API) {
    // static demo build: the API runs in the browser (see local/localServer.ts)
    const { localRequest } = await import('./local/localServer');
    ({ status, body: data } = await localRequest(opts.method ?? 'GET', path, opts.body, auth));
  } else {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (auth) headers.authorization = auth;
    const res = await fetch(path, { method: opts.method ?? 'GET', headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
    status = res.status;
    data = await res.json().catch(() => ({}));
  }
  if (status === 401 && path.startsWith('/api/admin')) window.dispatchEvent(new Event('staff-unauthorized'));
  if (status >= 400) throw new ApiError(status, data.error ?? `Request failed (${status})`, data);
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
export function fmtMoney(n: number) {
  const en = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  return `${new Intl.NumberFormat(en ? 'en-GB' : 'ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} lei`;
}
export function fmtDate(date: string, lang: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(date.slice(0, 10) + 'T12:00:00').toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-GB', opts);
}
export const fmtDuration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min} min`);
