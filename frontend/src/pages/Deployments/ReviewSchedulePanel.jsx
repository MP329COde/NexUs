import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';

const WEEKDAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

// Créneaux récurrents de revue de code (jour de semaine + plage horaire +
// relecteurs désignés), indépendants des MR/PR ouvertes à un instant T — pour
// planifier des sessions de revue régulières plutôt que de la relecture ad hoc.
export default function ReviewSchedulePanel({ reviewerNames }) {
  const { user } = useAuth();
  const notify = useNotify();
  const { data, reload } = useApi(() => api.get('/reviews/schedules'), []);
  const items = data?.items || [];
  const sorted = [...items].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));

  const [form, setForm] = useState(null);

  function openNew() {
    setForm({ label: 'Revue de code', weekday: 1, startTime: '10:00', endTime: '11:00', reviewerIds: [] });
  }

  async function save(e) {
    e.preventDefault();
    try {
      await api.post('/reviews/schedules', form);
      notify('Créneau planifié', { type: 'ok' });
      setForm(null);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function remove(id) {
    if (!confirm('Supprimer ce créneau de revue ?')) return;
    try {
      await api.del(`/reviews/schedules/${id}`);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  function toggleReviewer(id) {
    setForm((f) => ({
      ...f,
      reviewerIds: f.reviewerIds.includes(id) ? f.reviewerIds.filter((r) => r !== id) : [...f.reviewerIds, id]
    }));
  }

  return (
    <Panel
      title="Planification des revues"
      sub="Créneaux récurrents de revue de code"
      span={12}
      actions={user?.role === 'admin' && (
        <span className="btn-outline" style={{ height: 28, padding: '0 10px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }} onClick={openNew}>
          <Icon name="plus" size={12} />Planifier un créneau
        </span>
      )}
    >
      {sorted.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Aucun créneau de revue planifié</div>
      ) : (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 9, background: 'var(--border-soft)' }}>
              <span className="badge badge-info" style={{ flex: 'none' }}>{WEEKDAY_LABELS[s.weekday]}</span>
              <span className="mono" style={{ fontSize: 12.5, flex: 'none' }}>{s.startTime}–{s.endTime}</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1 }}>{s.label}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                {s.reviewerIds.length ? s.reviewerIds.map((id) => reviewerNames[id] || 'Inconnu').join(', ') : 'Aucun relecteur désigné'}
              </span>
              {user?.role === 'admin' && (
                <span className="btn-outline" style={{ height: 24, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }} onClick={() => remove(s.id)}>
                  <Icon name="trash" size={12} />
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {form && (
        <form onSubmit={save} style={{ padding: 16, borderTop: '1px solid var(--border-soft)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
          <input className="input" placeholder="Nom du créneau" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <select className="input" value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}>
            {WEEKDAY_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
          </select>
          <input className="input" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
          <input className="input" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(reviewerNames).map(([id, name]) => (
              <span
                key={id}
                onClick={() => toggleReviewer(id)}
                className={form.reviewerIds.includes(id) ? 'btn' : 'btn-outline'}
                style={{ height: 26, padding: '0 10px', fontSize: 11.5, cursor: 'pointer' }}
              >
                {name}
              </span>
            ))}
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
            <button className="btn" type="submit">Enregistrer</button>
            <span className="btn-outline" style={{ display: 'inline-flex', alignItems: 'center', padding: '0 12px', cursor: 'pointer' }} onClick={() => setForm(null)}>Annuler</span>
          </div>
        </form>
      )}
    </Panel>
  );
}
