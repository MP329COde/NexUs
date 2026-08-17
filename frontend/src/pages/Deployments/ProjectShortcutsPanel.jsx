import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './ProjectShortcutsPanel.css';

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
      title={(<span className="psp-title"><Icon name="externalLink" size={13} className="psp-title-icon" />Redirections du projet</span>)}
      sub="Accès direct aux services externes propres à ce projet"
      span={12}
      actions={canManage && (
        <span className="btn-outline psp-add-btn" onClick={() => setFormOpen(true)}>
          <Icon name="plus" size={13} />Ajouter une redirection
        </span>
      )}
    >
      {items.length === 0 ? (
        <div className="psp-empty">Aucune redirection créée pour ce projet</div>
      ) : (
        <div className="psp-grid">
          {items.map((s) => (
            <div key={s.id} className="psp-card">
              <span className="psp-card-icon">
                <Icon name="terminal" size={14} />
              </span>
              <div className="psp-card-info" onClick={() => open(s)}>
                <div className="psp-card-label">{s.label}</div>
                <div className="mono faint psp-card-url">{s.url.replace(/^https?:\/\//, '')}</div>
              </div>
              <Icon name="externalLink" size={13} className="psp-card-external-icon" onClick={() => open(s)} />
              {canManage && (
                <span onClick={() => remove(s.id)} title="Retirer" className="psp-card-remove">
                  <Icon name="x" size={12} />
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <Modal title="Ajouter une redirection" sub={`Propre au projet « ${project.name} »`} onClose={() => setFormOpen(false)} width={440}>
          <form onSubmit={create} className="psp-form">
            <div>
              <label className="psp-field-label">Nom</label>
              <input className="input" required value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Staging api-gateway" />
            </div>
            <div>
              <label className="psp-field-label">URL</label>
              <input className="input" required type="url" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://staging.api-gateway.homelab.local" />
            </div>
            <div className="psp-form-actions">
              <span className="btn-outline" onClick={() => setFormOpen(false)}>Annuler</span>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Ajout…' : 'Ajouter'}</button>
            </div>
          </form>
        </Modal>
      )}
    </Panel>
  );
}
