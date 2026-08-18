import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './PlatformRequestsPage.css';

const KINDS = [
  { value: 'access', label: "Demande d'accès" },
  { value: 'resource_increase', label: 'Augmentation de ressources' },
  { value: 'create_production_env', label: "Création d'environnement de production" },
  { value: 'other', label: 'Autre' }
];
const STATUS_BADGE = { pending: 'warn', approved: 'ok', rejected: 'crit', cancelled: 'mut', expired: 'mut' };
const STATUS_LABEL = { pending: 'En attente', approved: 'Approuvée', rejected: 'Rejetée', cancelled: 'Annulée', expired: 'Expirée' };
const EMPTY_FORM = { orgId: '', projectId: '', kind: 'access', title: '', description: '', environmentName: '' };

function kindLabel(v) { return KINDS.find((k) => k.value === v)?.label || v; }

// Platform Requests (ÉTAPE 17 IDP) : un développeur demande quelque chose à
// l'organisation (accès, ressources, environnement de production),
// approuvé/rejeté explicitement par un owner/admin. Depuis ÉTAPE 12,
// approuver une demande "create_production_env" déclenche réellement la
// création + le provisioning Kubernetes de l'environnement (voir
// platformRequestActionService.js côté backend) — les autres types restent
// sans action automatique, honnêtement signalé (r.result.status "skipped").
export default function PlatformRequestsPage() {
  const notify = useNotify();
  const mine = useApi(() => api.get('/platform-requests/mine'), []);
  const orgs = useApi(() => api.get('/organizations'), []);
  const [reviewOrgId, setReviewOrgId] = useState('');
  const toReview = useApi(() => (reviewOrgId ? api.get(`/platform-requests?orgId=${reviewOrgId}&status=pending`) : Promise.resolve(null)), [reviewOrgId]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const orgProjects = useApi(() => (form.orgId ? api.get(`/organizations/${form.orgId}/projects`) : Promise.resolve(null)), [form.orgId]);

  const myRequests = mine.data?.items || [];
  const allOrgs = orgs.data?.items || [];
  const pendingForReview = toReview.data?.items || [];
  const availableProjects = orgProjects.data?.items || [];

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { orgId, projectId, kind, title, description, environmentName } = form;
      await api.post('/platform-requests', {
        orgId, projectId: projectId || null, kind, title, description,
        payload: kind === 'create_production_env' ? { environmentName } : undefined
      });
      notify('Demande envoyée', { type: 'ok' });
      setForm(EMPTY_FORM);
      setFormOpen(false);
      mine.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id) {
    try {
      await api.post(`/platform-requests/${id}/cancel`, {});
      notify('Demande annulée', { type: 'info' });
      mine.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function review(id, status) {
    try {
      await api.post(`/platform-requests/${id}/${status === 'approved' ? 'approve' : 'reject'}`, {});
      notify(status === 'approved' ? 'Demande approuvée' : 'Demande rejetée', { type: status === 'approved' ? 'ok' : 'info' });
      toReview.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <>
      <PageHeader
        title="Demandes"
        sub="Demandez un accès, une augmentation de ressources ou un environnement de production — tranché explicitement par un owner/admin d'organisation."
        actions={(
          <button className="btn" onClick={() => setFormOpen(true)}>
            <Icon name="plus" size={14} />Nouvelle demande
          </button>
        )}
      />

      {formOpen && (
        <Modal title="Nouvelle demande" onClose={() => setFormOpen(false)} width={480}>
          <form onSubmit={submit}>
            <label className="projects-form-label">Organisation</label>
            <select className="input" required value={form.orgId} onChange={(e) => setForm((f) => ({ ...f, orgId: e.target.value }))} style={{ marginBottom: 12 }}>
              <option value="">Sélectionner une organisation…</option>
              {allOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <label className="projects-form-label">Type</label>
            <select className="input" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))} style={{ marginBottom: 12 }}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            {form.kind === 'create_production_env' && (
              <>
                <label className="projects-form-label">Projet</label>
                <select className="input" required value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))} style={{ marginBottom: 12 }} disabled={!form.orgId}>
                  <option value="">{form.orgId ? 'Sélectionner un projet…' : 'Choisissez d\'abord une organisation'}</option>
                  {availableProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <label className="projects-form-label">Nom de l'environnement</label>
                <input className="input mono" required value={form.environmentName} onChange={(e) => setForm((f) => ({ ...f, environmentName: e.target.value }))} placeholder="production-eu" style={{ marginBottom: 12 }} />
                <p className="faint" style={{ marginTop: -8, marginBottom: 12, fontSize: 12 }}>
                  Si approuvée, cet environnement sera réellement créé (et provisionné sur Kubernetes si un blueprint de production existe pour l'organisation).
                </p>
              </>
            )}
            <label className="projects-form-label">Titre</label>
            <input className="input" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Augmenter les replicas de billing-api" style={{ marginBottom: 12 }} />
            <label className="projects-form-label">Description</label>
            <textarea className="input" rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={{ marginBottom: 12, resize: 'vertical' }} />
            <div className="projects-form-actions">
              <span className="btn-outline" onClick={() => setFormOpen(false)}>Annuler</span>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Envoi…' : 'Envoyer la demande'}</button>
            </div>
          </form>
        </Modal>
      )}

      <div className="card pr-panel">
        <div className="pr-panel-title">Mes demandes</div>
        {myRequests.length === 0 ? (
          <p className="faint">Aucune demande envoyée.</p>
        ) : myRequests.map((r) => (
          <div key={r.id} className="pr-row">
            <div className="pr-row-main">
              <span className="pr-row-title">{r.title}</span>
              <span className={`badge badge-${STATUS_BADGE[r.status]}`}><span className="dot" />{STATUS_LABEL[r.status]}</span>
            </div>
            <div className="faint pr-row-meta">
              <span>{kindLabel(r.kind)}</span>
              {r.project_name && <span>· {r.project_name}</span>}
              {r.review_note && <span>· note : {r.review_note}</span>}
            </div>
            {r.result && (
              <p className="faint" style={{ fontSize: 12, marginTop: 4, color: r.result.status === 'failed' ? 'var(--danger, #ef4444)' : undefined }}>
                {r.result.status === 'created' ? '✓ ' : r.result.status === 'failed' ? '✗ ' : ''}{r.result.message}
              </p>
            )}
            {r.status === 'pending' && (
              <span className="btn-outline pr-cancel-btn" onClick={() => cancel(r.id)}>Annuler</span>
            )}
          </div>
        ))}
      </div>

      <div className="card pr-panel">
        <div className="pr-panel-title">Demandes à trancher</div>
        <select className="input" value={reviewOrgId} onChange={(e) => setReviewOrgId(e.target.value)} style={{ marginBottom: 12, maxWidth: 320 }}>
          <option value="">Sélectionner une organisation à administrer…</option>
          {allOrgs.filter((o) => o.my_role === 'owner' || o.my_role === 'admin').map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {!reviewOrgId ? (
          <p className="faint">Choisissez une organisation dont vous êtes owner/admin.</p>
        ) : pendingForReview.length === 0 ? (
          <p className="faint">Aucune demande en attente.</p>
        ) : pendingForReview.map((r) => (
          <div key={r.id} className="pr-row">
            <div className="pr-row-main">
              <span className="pr-row-title">{r.title}</span>
              <span className="badge badge-warn"><span className="dot" />En attente</span>
            </div>
            <p className="faint pr-row-desc">{r.description || 'Aucune description'}</p>
            <div className="faint pr-row-meta">{kindLabel(r.kind)} · demandé par {r.requested_by}</div>
            <div className="pr-row-actions">
              <span className="btn-outline" onClick={() => review(r.id, 'rejected')}>Rejeter</span>
              <span className="btn" onClick={() => review(r.id, 'approved')}>Approuver</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
