import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { useT } from '../../i18n';
import type { StaffUser } from './Admin';

interface Account { id: number; username: string; role: 'ADMIN' | 'CONDUCTOR'; name: string }

/** Staff accounts (administrators) and changing your own password (everyone). */
export function Accounts({ me }: { me: StaffUser }) {
  const t = useT();
  const isAdmin = me.role === 'ADMIN';
  const [users, setUsers] = useState<Account[]>([]);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ username: '', name: '', role: 'CONDUCTOR', password: '' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [reset, setReset] = useState<{ id: number; password: string } | null>(null);

  const load = useCallback(() => { if (isAdmin) api<Account[]>('/api/admin/users').then(setUsers).catch((e) => setMsg(t(e.message))); }, [isAdmin, t]);
  useEffect(load, [load]);
  const go = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); setMsg(t(ok)); load(); return true; } catch (e) { setMsg(t((e as Error).message)); return false; }
  };

  return (
    <div className="two-col">
      {isAdmin && (
        <div className="card">
          <h2>{t('Staff accounts')}</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('Username')}</th><th>{t('Name')}</th><th>{t('Role')}</th><th /></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td><code>{u.username}</code></td>
                    <td>{u.name}</td>
                    <td>
                      <select value={u.role} aria-label={t('Role')} onChange={(e) => go(() => api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { role: e.target.value } }), 'Saved.')}>
                        <option value="ADMIN">{t('ADMIN')}</option>
                        <option value="CONDUCTOR">{t('CONDUCTOR')}</option>
                      </select>
                    </td>
                    <td className="actions">
                      <button className="btn btn--small" onClick={() => setReset({ id: u.id, password: '' })}>{t('New password')}</button>
                      {u.id !== me.id && (
                        <button className="btn btn--small btn--danger" onClick={() => window.confirm(t('Delete the account {u}?', { u: u.username })) && go(() => api(`/api/admin/users/${u.id}`, { method: 'DELETE' }), 'Account deleted.')}>
                          {t('Delete')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {reset && (
            <form className="form inline-form" onSubmit={async (e) => { e.preventDefault(); if (await go(() => api(`/api/admin/users/${reset.id}`, { method: 'PATCH', body: { password: reset.password } }), 'Password changed.')) setReset(null); }}>
              <label>{t('New password for {u}', { u: users.find((x) => x.id === reset.id)?.username ?? '' })}
                <input type="text" autoComplete="off" minLength={8} required value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} />
              </label>
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setReset(null)}>{t('Cancel')}</button>
                <button className="btn btn--primary">{t('Save')}</button>
              </div>
            </form>
          )}
          <form className="form" onSubmit={async (e) => {
            e.preventDefault();
            if (await go(() => api('/api/admin/users', { method: 'POST', body: form }), 'Account created.')) setForm({ username: '', name: '', role: 'CONDUCTOR', password: '' });
          }}>
            <h3>{t('Add account')}</h3>
            <div className="form-row">
              <label>{t('Username')}<input required pattern="[a-z0-9._\-]{3,32}" title={t('3-32 lowercase letters, digits, dot, dash or underscore')} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} /></label>
              <label>{t('Full name')}<input required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            </div>
            <div className="form-row">
              <label>{t('Role')}
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="CONDUCTOR">{t('CONDUCTOR')}</option>
                  <option value="ADMIN">{t('ADMIN')}</option>
                </select>
              </label>
              <label>{t('Password')}<input type="text" autoComplete="off" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            </div>
            <div className="form-actions"><span className="muted small">{t('Conductors can scan tickets and see seat maps. Administrators can change everything.')}</span><button className="btn btn--primary">{t('Create account')}</button></div>
          </form>
        </div>
      )}

      <form className="card form" onSubmit={async (e) => {
        e.preventDefault();
        if (await go(() => api('/api/admin/me/password', { method: 'POST', body: pw }), 'Password changed.')) setPw({ current: '', next: '' });
      }}>
        <h2>{t('My account')}</h2>
        <p className="muted small">{me.name}</p>
        <label>{t('Current password')}<input type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
        <label>{t('New password')}<input type="password" autoComplete="new-password" minLength={8} required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
        <div className="form-actions"><span className="muted small">{t('At least 8 characters.')}</span><button className="btn btn--primary">{t('Change password')}</button></div>
      </form>
      {msg && <p className="note" role="status">{msg}</p>}
    </div>
  );
}
