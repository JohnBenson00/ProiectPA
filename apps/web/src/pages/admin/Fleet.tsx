import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api';
import type { Layout, Train } from '../../types';
import { TrainStrip } from '../../components/TrainStrip';
import { AMENITIES } from '../../amenities';
import { useT } from '../../i18n';

export function Fleet() {
  const t = useT();
  const [trains, setTrains] = useState<Train[]>([]);
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [newLayout, setNewLayout] = useState('S2');
  const [msg, setMsg] = useState('');

  const load = () => api<Train[]>('/api/trains').then((l) => { setTrains(l); setSel((s) => s ?? l[0]?.id ?? null); });
  useEffect(() => { load(); api('/api/meta').then((m) => setLayouts(m.layouts)); }, []);

  const train = trains.find((x) => x.id === sel);
  const go = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); setMsg(ok ?? ''); load(); } catch (e) { setMsg((e as Error).message); }
  };
  const move = (i: number, d: number) => {
    if (!train) return;
    const order = train.wagons.map((w) => w.id);
    [order[i], order[i + d]] = [order[i + d], order[i]];
    go(() => api(`/api/admin/trains/${train.id}`, { method: 'PATCH', body: { wagonOrder: order } }));
  };
  const toggleAmenity = (wagonId: number, list: string[], code: string) =>
    go(() => api(`/api/admin/wagons/${wagonId}`, { method: 'PATCH', body: { amenities: list.includes(code) ? list.filter((x) => x !== code) : [...list, code] } }));

  return (
    <div>
      <div className="chips" role="tablist">
        {trains.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === sel} className={`chip${x.id === sel ? ' is-on' : ''}`} onClick={() => setSel(x.id)}>
            <span className="train-dot" style={{ background: x.color }} /> {x.name}
          </button>
        ))}
      </div>
      {msg && <p className="note" role="status">{msg}</p>}
      {train && (
        <>
          <div className="card form">
            <div className="form-row">
              <label>{t('Name')}<input defaultValue={train.name} key={`n${train.id}`} onBlur={(e) => e.target.value !== train.name && go(() => api(`/api/admin/trains/${train.id}`, { method: 'PATCH', body: { name: e.target.value } }), t('Saved.'))} /></label>
              <label>{t('Color')}<input type="color" defaultValue={train.color} key={`c${train.id}`} onBlur={(e) => go(() => api(`/api/admin/trains/${train.id}`, { method: 'PATCH', body: { color: e.target.value } }), t('Saved.'))} /></label>
            </div>
            <label>{t('Description')}<textarea rows={2} defaultValue={train.description} key={`d${train.id}`} onBlur={(e) => e.target.value !== train.description && go(() => api(`/api/admin/trains/${train.id}`, { method: 'PATCH', body: { description: e.target.value } }), t('Saved.'))} /></label>
            <TrainStrip color={train.color} wagons={train.wagons} />
            <p className="muted small">{train.capacity} {t('places')} · {train.wagons.length} {t('wagons')}</p>
          </div>

          <div className="fleet-list">
            {train.wagons.map((w, i) => (
              <div key={w.id} className="card fleet-wagon">
                <div className="fleet-wagon-head">
                  <b>{t('Wagon')} {w.number}</b>
                  <span>{t(w.name)} {w.classLabel && <span className="badge">{t('class')} {w.classLabel}</span>}</span>
                  <span className="muted small">{w.bookable ? `${w.capacity} ${t('places')}` : t('not bookable')}</span>
                  <span className="spacer" />
                  <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('Move towards locomotive')}><ArrowUp size={16} /></button>
                  <button className="icon-btn" disabled={i === train.wagons.length - 1} onClick={() => move(i, 1)} aria-label={t('Move towards the end')}><ArrowDown size={16} /></button>
                  <button className="icon-btn" onClick={() => go(() => api(`/api/admin/trains/${train.id}/wagons/${w.id}`, { method: 'DELETE' }), t('Wagon removed.'))} aria-label={t('Remove wagon')}><Trash2 size={16} /></button>
                </div>
                <div className="chips">
                  {Object.entries(AMENITIES).map(([code, a]) => {
                    const on = w.amenities.includes(code);
                    const Icon = a.icon;
                    return (
                      <button key={code} className={`chip chip--icon${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggleAmenity(w.id, w.amenities, code)}>
                        <Icon size={14} aria-hidden /> {t(a.label)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="card toolbar">
            <label className="inline">{t('Add wagon')}
              <select value={newLayout} onChange={(e) => setNewLayout(e.target.value)}>
                {layouts.map((l) => <option key={l.code} value={l.code}>{t(l.name)}</option>)}
              </select>
            </label>
            <button className="btn btn--primary" onClick={() => go(() => api(`/api/admin/trains/${train.id}/wagons`, { method: 'POST', body: { layout: newLayout } }), t('Wagon added at the end of the train.'))}>
              <Plus size={16} aria-hidden /> {t('Add')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
