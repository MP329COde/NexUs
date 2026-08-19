import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

const STEP_LABEL = {
  validate: 'Validation',
  generate: 'Génération des fichiers',
  create_repo: 'Création du dépôt',
  push_files: 'Envoi des fichiers',
  register_catalog: 'Enregistrement dans le catalogue',
  generate_docs: 'Documentation (Docusaurus)',
  create_environment: 'Environnement de preview'
};
const STEP_ORDER = ['validate', 'generate', 'create_repo', 'push_files', 'register_catalog', 'generate_docs', 'create_environment'];

function stepIcon(status) {
  if (status === 'done') return { name: 'check', color: 'var(--ok, #10b981)' };
  if (status === 'running' || status === 'progress') return { name: 'sync', color: 'var(--info, #3b82f6)' };
  if (status === 'skipped') return { name: 'x', color: 'var(--text-faint)' };
  return { name: 'clock', color: 'var(--text-faint)' };
}

// Assistant de scaffolding : soumet POST /catalog/scaffold (crée un job —
// voir services/scaffolderService.js) puis interroge la progression via
// GET /projects/:id/jobs/:jobId (déjà exposé par routes/projects.routes.js
// pour tout job de projet, réutilisé tel quel plutôt que de dupliquer un
// second point de suivi spécifique au scaffolder).
export default function ScaffolderModal({ template, onClose }) {
  const projects = useApi(() => api.get('/projects'), []);
  const [legacyProjectId, setLegacyProjectId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [repositoryProvider, setRepositoryProvider] = useState('none');
  const [ownerTeamId, setOwnerTeamId] = useState('');
  const [withDocs, setWithDocs] = useState(false);
  const [withEnvironment, setWithEnvironment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef(null);

  const projectDetail = useApi(() => (legacyProjectId ? api.get(`/projects/${legacyProjectId}`) : Promise.resolve(null)), [legacyProjectId]);
  const orgId = projectDetail.data?.project?.orgId;
  const teams = useApi(() => (orgId ? api.get(`/teams/org/${orgId}`) : Promise.resolve(null)), [orgId]);
  const availableTeams = teams.data?.items || [];

  useEffect(() => () => clearInterval(pollRef.current), []);

  function pollJob(jobId) {
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/projects/${legacyProjectId}/jobs/${jobId}`);
        setJob(res.job);
        if (['succeeded', 'failed', 'cancelled'].includes(res.job.status)) clearInterval(pollRef.current);
      } catch {
        clearInterval(pollRef.current);
      }
    }, 1200);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/catalog/scaffold', {
        legacyProjectId, templateId: template.id, name, description, ownerTeamId: ownerTeamId || null, repositoryProvider, withDocs, withEnvironment
      });
      setJob(res.job);
      pollJob(res.job.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setCancelling(true);
    try {
      const res = await api.post(`/projects/${legacyProjectId}/jobs/${job.id}/cancel`);
      setJob(res.job);
      clearInterval(pollRef.current);
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  const steps = job?.payload?.steps || [];
  // Dernier statut connu par étape (une étape peut apparaître plusieurs fois : running puis done).
  const lastByStep = {};
  for (const s of steps) lastByStep[s.step] = s;
  const componentId = job?.result?.component?.id;

  return (
    <Modal title={`Créer un service — ${template.name}`} sub={template.description} onClose={onClose} width={520}>
      {!job ? (
        <form onSubmit={submit}>
          <label className="projects-form-label">Projet</label>
          <select className="input" required value={legacyProjectId} onChange={(e) => { setLegacyProjectId(e.target.value); setOwnerTeamId(''); }} style={{ marginBottom: 12 }}>
            <option value="">Sélectionner un projet…</option>
            {(projects.data?.items || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {legacyProjectId && availableTeams.length > 0 && (
            <>
              <label className="projects-form-label">Équipe propriétaire (optionnel)</label>
              <select className="input" value={ownerTeamId} onChange={(e) => setOwnerTeamId(e.target.value)} style={{ marginBottom: 12 }}>
                <option value="">Aucune équipe définie</option>
                {availableTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </>
          )}
          <label className="projects-form-label">Nom du service</label>
          <input className="input" required pattern="[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?" placeholder="billing-api" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 12 }} />
          <label className="projects-form-label">Description</label>
          <input className="input" placeholder={template.description} value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginBottom: 12 }} />
          <label className="projects-form-label">Dépôt</label>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="radio" name="provider" checked={repositoryProvider === 'none'} onChange={() => setRepositoryProvider('none')} />
              Aucun (catalogue uniquement)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="radio" name="provider" checked={repositoryProvider === 'github'} onChange={() => setRepositoryProvider('github')} />
              GitHub
            </label>
          </div>
          <label className="projects-form-label">Aussi générer</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={withDocs} onChange={(e) => setWithDocs(e.target.checked)} />
              Documentation (page Docusaurus générée localement à partir du catalogue/ADR du projet)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={withEnvironment} onChange={(e) => setWithEnvironment(e.target.checked)} />
              Environnement de preview (déclaratif — sélectionnez un blueprint depuis la fiche projet pour un provisioning Kubernetes réel)
            </label>
          </div>
          {error && <p style={{ color: 'var(--danger, #ef4444)', marginBottom: 8, fontSize: 13 }}>{error}</p>}
          <div className="projects-form-actions">
            <span className="btn-outline" onClick={onClose}>Annuler</span>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Création…' : 'Créer le service'}</button>
          </div>
        </form>
      ) : (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {STEP_ORDER.map((stepId) => {
              const s = lastByStep[stepId];
              const icon = stepIcon(s?.status);
              return (
                <div key={stepId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name={icon.name} size={14} color={icon.color} />
                  <span>{STEP_LABEL[stepId]}</span>
                  {s?.status === 'skipped' && <span className="faint" style={{ fontSize: 12 }}>— ignoré</span>}
                </div>
              );
            })}
          </div>

          {job.status === 'succeeded' && (
            <div className="card" style={{ padding: 12, background: 'var(--surface-alt, var(--border-soft))' }}>
              <p style={{ marginBottom: 8 }}>Service créé avec succès.</p>
              {componentId && (
                <Link to={`/deployments/catalog/${componentId}`} className="btn" onClick={onClose}>
                  Voir dans le catalogue
                </Link>
              )}
            </div>
          )}

          {job.status === 'failed' && (
            <div className="card" style={{ padding: 12, borderColor: 'var(--danger, #ef4444)' }}>
              <p style={{ color: 'var(--danger, #ef4444)' }}>Échec : {job.error}</p>
            </div>
          )}

          {job.status === 'cancelled' && (
            <div className="card" style={{ padding: 12, borderColor: 'var(--text-faint)' }}>
              <p className="faint">Création annulée.</p>
            </div>
          )}

          {(job.status === 'pending' || job.status === 'running') && (
            <p className="faint">Création en cours…</p>
          )}

          <div className="projects-form-actions" style={{ marginTop: 12 }}>
            {(job.status === 'pending' || job.status === 'running') && (
              <span className="btn-outline" onClick={cancelling ? undefined : cancel}>
                {cancelling ? 'Annulation…' : 'Annuler'}
              </span>
            )}
            <span className="btn-outline" onClick={onClose}>Fermer</span>
          </div>
        </div>
      )}
    </Modal>
  );
}
