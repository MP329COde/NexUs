import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

const KIND_LABELS = { docusaurus: 'Documentation technique (Docusaurus)', storybook: 'Design System (Storybook)' };
const STATUS_LABELS = { unknown: 'Non configuré', building: 'En cours de build', published: 'Publié', failed: 'Échec' };
const STATUS_TONE = { unknown: 'mut', building: 'warn', published: 'ok', failed: 'crit' };

// Intégration Docusaurus/Storybook (todo.md Lot 34, chantiers #8-#13) :
// NexUs ne construit que la couche d'intégration référençant un repository
// GitHub externe (URL, statut, version, commit, pipeline) ; si aucun
// repository n'est connecté, bascule sur une génération locale minimale
// (voir POST /:id/doc-sites/:kind/generate-local) plutôt que de rester vide.
export default function DocSitesPanel({ projectId, canManage }) {
  const sites = useApi(() => api.get(`/projects/${projectId}/doc-sites`), [projectId]);
  const notify = useNotify();
  const [editing, setEditing] = useState(null);
  const [local, setLocal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ url: '', repoUrl: '', branch: '', status: 'unknown' });
  const items = sites.data?.items || [];
  const byKind = (kind) => items.find((s) => s.kind === kind) || { kind };

  function openEdit(kind) {
    const s = byKind(kind);
    setForm({ url: s.url || '', repoUrl: s.repo_url || '', branch: s.branch || '', status: s.status || 'unknown' });
    setEditing(kind);
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/projects/${projectId}/doc-sites/${editing}`, form);
      notify('Lien enregistré', { type: 'ok' });
      setEditing(null);
      sites.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function generateLocal(kind) {
    setBusy(true);
    try {
      await api.post(`/projects/${projectId}/doc-sites/${kind}/generate-local`);
      notify('Documentation locale générée', { type: 'ok' });
      sites.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Documentation & Design System" sub="Docusaurus / Storybook" span={12}>
      <div className="pd-list-loose">
        {['docusaurus', 'storybook'].map((kind) => {
          const s = byKind(kind);
          const hasRepo = Boolean(s.repo_url);
          const hasLocal = Boolean(s.local_content);
          return (
            <div key={kind} className="pd-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <div className="pd-row" style={{ padding: 0 }}>
                <span className="pd-row-title">{KIND_LABELS[kind]}</span>
                <span className={`badge badge-${STATUS_TONE[s.status || 'unknown']}`}>{STATUS_LABELS[s.status || 'unknown']}</span>
              </div>
              {s.branch && <div className="faint">Branche : {s.branch}{s.last_commit ? ` · ${s.last_commit.slice(0, 8)}` : ''}</div>}
              {s.last_published_at && <div className="faint">Dernière publication : {new Date(s.last_published_at).toLocaleString('fr-FR')}</div>}
              {!hasRepo && !hasLocal && <div className="faint">Aucun repository connecté et aucune documentation locale générée.</div>}
              <div className="pd-form-row">
                {s.url && <a className="btn-outline pd-action-btn" href={s.url} target="_blank" rel="noreferrer">Ouvrir</a>}
                {s.repo_url && <a className="btn-outline pd-action-btn" href={s.repo_url} target="_blank" rel="noreferrer">Voir repository</a>}
                {hasLocal && <span className="btn-outline pd-action-btn" onClick={() => setLocal(s)}>Voir la documentation locale</span>}
                {canManage && <span className="btn-outline pd-action-btn" onClick={() => openEdit(kind)}>Configurer le repository</span>}
                {canManage && !hasRepo && (
                  <span className="btn-outline pd-action-btn" onClick={() => generateLocal(kind)}>
                    {hasLocal ? 'Régénérer localement' : 'Générer localement'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <Modal title={`Configurer — ${KIND_LABELS[editing]}`} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="pd-list-loose">
            <input className="input" placeholder="URL du site publié" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
            <input className="input" placeholder="URL du repository GitHub" value={form.repoUrl} onChange={(e) => setForm((f) => ({ ...f, repoUrl: e.target.value }))} />
            <input className="input" placeholder="Branche (ex. main)" value={form.branch} onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))} />
            <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <div className="pd-form-row">
              <button className="btn" type="submit" disabled={busy}>Enregistrer</button>
              <span className="btn-outline pd-action-btn" onClick={() => setEditing(null)}>Annuler</span>
            </div>
          </form>
        </Modal>
      )}

      {local && (
        <Modal title={KIND_LABELS[local.kind]} onClose={() => setLocal(null)} width={600}>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{local.local_content}</pre>
        </Modal>
      )}
    </Panel>
  );
}
