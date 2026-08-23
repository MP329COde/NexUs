import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

const STATUS_LABELS = { pending: 'En cours', provisioned: 'Provisionné', failed: 'Échec' };
const STATUS_TONE = { pending: 'warn', provisioned: 'ok', failed: 'crit' };

// UI manquante jusqu'ici (voir todo-lot54.md) : ne fait qu'appeler les
// routes de repositoryProvisioning.routes.js — la création réelle du dépôt
// (services/repositoryProvisioningService.js) est déclenchée côté backend
// dès le POST, cette page n'affiche que le résultat réel (jamais un succès
// avant que la réponse HTTP ne le confirme).
export default function ManagedRepositoriesPanel({ projectId, orgId, canManage }) {
  const items = useApi(() => (orgId ? api.get(`/repository-provisioning?orgId=${orgId}&projectId=${projectId}`) : Promise.resolve(null)), [orgId, projectId]);
  const templates = useApi(() => api.get('/repository-provisioning/templates'), []);
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryingId, setRetryingId] = useState(null);
  const [form, setForm] = useState({ provider: 'github', account: 'personal', owner: '', name: '', templateKey: '' });

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/repository-provisioning', { ...form, orgId, projectId });
      const item = res.item;
      notify(item.status === 'provisioned' ? `Dépôt créé : ${item.web_url}` : `Provisioning : ${item.status_detail || item.status}`, { type: item.status === 'provisioned' ? 'ok' : 'crit' });
      setOpen(false);
      setForm({ provider: 'github', account: 'personal', owner: '', name: '', templateKey: '' });
      items.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function retry(id) {
    setRetryingId(id);
    try {
      const res = await api.post(`/repository-provisioning/${id}/provision`, {});
      notify(res.item.status === 'provisioned' ? 'Dépôt provisionné' : `Toujours en échec : ${res.item.status_detail}`, { type: res.item.status === 'provisioned' ? 'ok' : 'crit' });
      items.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setRetryingId(null);
    }
  }

  if (!orgId) return null;

  return (
    <Panel
      title="Repositories gérés par NexUs"
      sub="Provisioning automatique (dépôt, branche, protections, webhooks, variables CI, labels)"
      span={12}
      actions={canManage && <span className="btn-outline pd-action-btn" onClick={() => setOpen(true)}>+ Nouveau dépôt</span>}
    >
      {!items.data?.items?.length ? (
        <div className="pd-empty">Aucun dépôt géré pour ce projet</div>
      ) : (
        <div className="pd-list-loose">
          {items.data.items.map((it) => (
            <div key={it.id} className="pd-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
              <div className="pd-row" style={{ padding: 0 }}>
                <span className="pd-row-title">{it.provider} · {it.owner}/{it.name}</span>
                <span className={`badge badge-${STATUS_TONE[it.status]}`}>{STATUS_LABELS[it.status]}</span>
              </div>
              <div className="faint">{it.account === 'platform' ? 'Compte GitHub NexUs (plateforme)' : 'Compte personnel'} · modèle {it.template_key}</div>
              {it.status_detail && <div className="faint">{it.status_detail}</div>}
              <div className="pd-form-row">
                {it.web_url && <a className="btn-outline pd-action-btn" href={it.web_url} target="_blank" rel="noreferrer">Ouvrir</a>}
                {it.status === 'failed' && canManage && (
                  <span className="btn-outline pd-action-btn" onClick={() => retry(it.id)}>{retryingId === it.id ? 'Relance…' : 'Réessayer'}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <Modal title="Provisionner un nouveau dépôt" onClose={() => setOpen(false)}>
          <form onSubmit={create} className="pd-list-loose">
            <select className="input" value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}>
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
            </select>
            {form.provider === 'github' && (
              <select className="input" value={form.account} onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))}>
                <option value="personal">Mon compte GitHub</option>
                <option value="platform">Compte GitHub NexUs (plateforme)</option>
              </select>
            )}
            <input className="input" placeholder="Propriétaire (utilisateur ou organisation)" value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} required />
            <input className="input" placeholder="Nom du dépôt" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            <select className="input" value={form.templateKey} onChange={(e) => setForm((f) => ({ ...f, templateKey: e.target.value }))} required>
              <option value="">— Modèle —</option>
              {(templates.data?.items || []).map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
            <div className="pd-form-row">
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Provisioning…' : 'Créer'}</button>
              <span className="btn-outline pd-action-btn" onClick={() => setOpen(false)}>Annuler</span>
            </div>
          </form>
        </Modal>
      )}
    </Panel>
  );
}
