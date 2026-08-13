import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

const EMPTY_FORM = { label: '', url: '', category: 'Accès direct' };

// Redirections créées à la main pour ce projet précis (staging perso,
// tableau de bord applicatif, wiki d'équipe...) — distinctes des raccourcis
// globaux d'Accès aux outils. Ouverture directe en un clic, comptabilisée.
export default function ProjectShortcutsPanel({ project, canManage }) {
  const notify = useNotify();
  const { data, reload } = useApi(() => api.get(`/projects/${project.id}/shortcuts`), [project.id]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const items = data?.items || [];

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/projects/${project.id}/shortcuts`, form);
      notify(`${form.label} ajouté`, { type: 'ok' });
      setForm(EMPTY_FORM);
      setFormOpen(false);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    await api.del(`/projects/${project.id}/shortcuts/${id}`);
    reload();
  }

  async function open(s) {
    api.post(`/projects/${project.id}/shortcuts/${s.id}/open`, {}).catch(() => {});
    window.open(s.url, '_blank', 'noreferrer');
  }

  return (
    <Panel
      title={(<span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="externalLink" size={13} style={{ color: 'var(--text-faint)' }} />Redirections du projet</span>)}
      sub="Accès direct aux services externes propres à ce projet"
      span={12}
      actions={canManage && (
        <span className="btn-outline" style={{ height: 28, padding: '0 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setFormOpen(true)}>
          <Icon name="plus" size={13} />Ajouter une redirection
        </span>
      )}
    >
      {items.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Aucune redirection créée pour ce projet</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10, padding: 14 }}>
          {items.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-soft)', position: 'relative' }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                <Icon name="terminal" size={14} />
              </span>
              <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => open(s)}>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</div>
                <div className="mono faint" style={{ fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url.replace(/^https?:\/\//, '')}</div>
              </div>
              <Icon name="externalLink" size={13} style={{ color: 'var(--text-faint)', flex: 'none', cursor: 'pointer' }} onClick={() => open(s)} />
              {canManage && (
                <span onClick={() => remove(s.id)} title="Retirer" style={{ position: 'absolute', top: 4, right: 4, color: 'var(--text-faintest)', cursor: 'pointer' }}>
                  <Icon name="x" size={12} />
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <Modal title="Ajouter une redirection" sub={`Propre au projet « ${project.name} »`} onClose={() => setFormOpen(false)} width={440}>
          <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>Nom</label>
              <input className="input" required value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Staging api-gateway" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>URL</label>
              <input className="input" required type="url" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://staging.api-gateway.homelab.local" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <span className="btn-outline" onClick={() => setFormOpen(false)}>Annuler</span>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Ajout…' : 'Ajouter'}</button>
            </div>
          </form>
        </Modal>
      )}
    </Panel>
  );
}
