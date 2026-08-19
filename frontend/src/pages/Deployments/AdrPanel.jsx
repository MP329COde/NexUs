import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

const STATUS_LABELS = { proposed: 'Proposée', accepted: 'Acceptée', deprecated: 'Dépréciée', superseded: 'Remplacée' };
const STATUS_TONE = { proposed: 'warn', accepted: 'ok', deprecated: 'mut', superseded: 'mut' };
const numberLabel = (n) => `ADR-${String(n).padStart(3, '0')}`;

// Architecture Decision Records (todo.md item 36) : décisions techniques
// numérotées par projet, contenu Markdown stocké réellement (comme le
// Wiki — voir routes/projects.routes.js GET/POST /:id/adrs).
export default function AdrPanel({ projectId, canManage }) {
  const adrs = useApi(() => api.get(`/projects/${projectId}/adrs`), [projectId]);
  const notify = useNotify();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ title: '', status: 'proposed', content: '' });
  const [busy, setBusy] = useState(false);
  const items = adrs.data?.items || [];

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/projects/${projectId}/adrs`, form);
      notify('ADR créée', { type: 'ok' });
      setForm({ title: '', status: 'proposed', content: '' });
      setCreating(false);
      adrs.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(adr, status) {
    try {
      await api.put(`/projects/${projectId}/adrs/${adr.id}`, { status });
      adrs.reload();
      setOpen((o) => (o && o.id === adr.id ? { ...o, status } : o));
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <Panel
      title="Décisions techniques (ADR)"
      sub={`${items.length} décision(s) documentée(s)`}
      span={12}
      actions={canManage && <span className="btn-outline pd-action-btn" onClick={() => setCreating(true)}>Nouvelle ADR</span>}
    >
      {items.length === 0 ? (
        <div className="pd-empty">Aucune décision technique documentée.</div>
      ) : (
        <div className="pd-list-loose">
          {items.map((a) => (
            <div key={a.id} className="pd-row" style={{ cursor: 'pointer' }} onClick={() => setOpen(a)}>
              <span className="faint mono">{numberLabel(a.number)}</span>
              <span className="pd-row-title">{a.title}</span>
              <span className={`badge badge-${STATUS_TONE[a.status]}`}>{STATUS_LABELS[a.status]}</span>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <Modal title="Nouvelle ADR" onClose={() => setCreating(false)}>
          <form onSubmit={create} className="pd-list-loose">
            <input className="input" required placeholder="Titre de la décision" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <textarea className="input" rows={8} placeholder="Contexte, décision, conséquences… (Markdown)" value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} />
            <div className="pd-form-row">
              <button className="btn" type="submit" disabled={busy}>Créer</button>
              <span className="btn-outline pd-action-btn" onClick={() => setCreating(false)}>Annuler</span>
            </div>
          </form>
        </Modal>
      )}

      {open && (
        <Modal title={`${numberLabel(open.number)} — ${open.title}`} onClose={() => setOpen(null)} width={600}>
          <div className="pd-list-loose">
            <div>
              <span className="faint">Statut : </span>
              {canManage ? (
                <select className="input" value={open.status} onChange={(e) => changeStatus(open, e.target.value)}>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ) : (
                <span className={`badge badge-${STATUS_TONE[open.status]}`}>{STATUS_LABELS[open.status]}</span>
              )}
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{open.content || 'Aucun contenu.'}</pre>
          </div>
        </Modal>
      )}
    </Panel>
  );
}
