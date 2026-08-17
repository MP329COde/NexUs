import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import ActionConfirmModal from '../../components/ui/ActionConfirmModal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import './PipelineView.css';

const STAGE_LABELS = {
  git: { gitlab: 'GitLab · CI/CD', github: 'GitHub · Actions' },
  argocd: 'Argo CD',
  kubernetes: 'Kubernetes',
  proxy: 'Reverse proxy'
};

export default function PipelineView({ linkId, span }) {
  const { user } = useAuth();
  const { data, reload } = useApi(() => api.get(`/deployments/${linkId}/pipeline`), [linkId], { pollMs: 15000 });
  const notify = useNotify();
  const [confirmSync, setConfirmSync] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);

  const hasArgo = data?.stages?.argocd?.configured;
  const [provisionOpen, setProvisionOpen] = useState(false);

  const gitLabel = typeof STAGE_LABELS.git === 'object' ? (STAGE_LABELS.git[data?.stages.git.provider] || 'Git') : STAGE_LABELS.git;

  return (
    <Panel
      title={`Pipeline · ${data?.link.name || ''}`}
      sub="développement → Git → CI/CD → Argo CD → Kubernetes → reverse proxy → domaine"
      span={span}
      actions={(
        <div className="pv-actions">
          {user?.role === 'admin' && (
            <span className="btn-outline pv-action-btn" onClick={() => setConfirmSync(true)}>
              <Icon name="sync" size={13} />Synchroniser
            </span>
          )}
          {hasArgo && user?.role === 'admin' && (
            <>
              <span className="btn-outline pv-action-btn" onClick={() => setDeployOpen(true)}>
                <Icon name="box" size={13} />Déployer une version
              </span>
              <span className="btn-outline pv-action-btn pv-action-btn-danger" onClick={() => setRollbackOpen(true)}>
                <Icon name="refresh" size={13} />Revenir en arrière
              </span>
            </>
          )}
        </div>
      )}
    >
      <div className="pv-stages">
        <StageCard label={gitLabel} stage={data?.stages.git} stageKey="git" />
        <StageCard
          label={STAGE_LABELS.argocd}
          stage={data?.stages.argocd}
          stageKey="argocd"
          action={!hasArgo && user?.role === 'admin' ? { label: 'Provisionner', onClick: () => setProvisionOpen(true) } : null}
        />
        <StageCard label={STAGE_LABELS.kubernetes} stage={data?.stages.kubernetes} stageKey="kubernetes" />
        <StageCard label={STAGE_LABELS.proxy} stage={data?.stages.proxy} stageKey="proxy" />
      </div>

      {confirmSync && (
        <ActionConfirmModal
          title="Synchroniser Argo CD"
          sub={data?.link.name}
          tone="warn"
          confirmLabel="Synchroniser"
          impact={[
            'Applique l\'état déclaré dans Git au cluster Kubernetes (crée/modifie/supprime les ressources concernées).',
            'Si le dépôt Git a changé depuis le dernier déploiement, cela met à jour l\'application en conséquence.'
          ]}
          onClose={() => setConfirmSync(false)}
          onConfirm={async () => {
            const res = await api.post(`/deployments/${linkId}/sync`, {});
            notify(res.message, { type: 'ok', title: 'Argo CD' });
            reload();
          }}
        />
      )}

      {deployOpen && <DeployVersionModal linkId={linkId} appName={data?.link.name} onClose={() => setDeployOpen(false)} onDone={reload} />}
      {rollbackOpen && <RollbackModal linkId={linkId} appName={data?.link.name} onClose={() => setRollbackOpen(false)} onDone={reload} />}
      {provisionOpen && <ProvisionArgocdModal linkId={linkId} appName={data?.link.name} onClose={() => setProvisionOpen(false)} onDone={reload} />}
    </Panel>
  );
}

function DeployVersionModal({ linkId, appName, onClose, onDone }) {
  const notify = useNotify();
  const [revision, setRevision] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/deployments/${linkId}/sync`, { revision: revision.trim() });
      notify(res.message, { type: 'ok', title: 'Argo CD' });
      onDone();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Déployer une version" sub={appName} onClose={onClose} width={420}>
      <form onSubmit={submit} className="pv-modal-form">
        <div>
          <label className="pv-form-label">Révision Git (tag, branche ou SHA de commit)</label>
          <input className="input mono" autoFocus required value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="v2.9.0 ou a1b2c3d" />
        </div>
        <div className="faint pv-form-hint">Synchronise Argo CD vers cette révision précise plutôt que la dernière du dépôt.</div>
        {error && <div className="pv-form-error">{error}</div>}
        <div className="pv-form-actions">
          <span className="btn-outline" onClick={onClose}>Annuler</span>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Déploiement…' : 'Déployer'}</button>
        </div>
      </form>
    </Modal>
  );
}

function RollbackModal({ linkId, appName, onClose, onDone }) {
  const notify = useNotify();
  const { data, loading } = useApi(() => api.get(`/deployments/${linkId}/history`), [linkId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const items = data?.items || [];

  async function doRollback(entry) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/deployments/${linkId}/rollback`, { historyId: entry.id });
      notify(res.message, { type: 'ok', title: 'Argo CD' });
      onDone();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Revenir à une version précédente" sub={appName} onClose={onClose} width={460}>
      {loading && <div className="faint pv-history-loading">Chargement de l'historique…</div>}
      {!loading && items.length === 0 && <div className="faint pv-history-empty">Aucun historique de déploiement disponible pour cette application.</div>}
      {items.length > 0 && (
        <div className="pv-history-list">
          {items.slice(0, 10).map((h, i) => (
            <div key={h.id} className="pv-history-row">
              <div className="pv-history-info">
                <div className="mono pv-history-revision">{(h.revision || '').slice(0, 10)}</div>
                <div className="faint pv-history-date">{h.deployedAt ? new Date(h.deployedAt).toLocaleString('fr-FR') : '—'}{i === 0 ? ' · déploiement actuel' : ''}</div>
              </div>
              {i > 0 && (
                <span className="btn-outline pv-history-restore-btn" onClick={() => doRollback(h)}>
                  {busy ? '…' : 'Restaurer'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <div className="pv-history-error">{error}</div>}
    </Modal>
  );
}

function StageCard({ label, stage, stageKey, action }) {
  if (!stage) return null;
  const tone = !stage.configured ? 'mut' : stage.error ? 'crit' : 'ok';
  const externalUrl = stage.latestPipeline?.webUrl || stage.webUrl;
  return (
    <div className="card pv-stage-card">
      <div className="pv-stage-card-header">
        <span className="pv-stage-card-label">{label}</span>
        <span className={`badge badge-${tone}`}><span className="dot" />{stage.configured ? (stage.error ? 'Erreur' : 'OK') : 'Non lié'}</span>
      </div>
      <StageDetail stageKey={stageKey} stage={stage} />
      {externalUrl && (
        <a href={externalUrl} target="_blank" rel="noreferrer" className="pv-stage-link">
          <Icon name="externalLink" size={12} />Ouvrir dans l'outil
        </a>
      )}
      {action && (
        <span className="btn-outline pv-stage-action" onClick={action.onClick}>
          <Icon name="plus" size={11} />{action.label}
        </span>
      )}
    </div>
  );
}

// Crée/reconfigure directement l'application Argo CD depuis la console (voir
// POST /deployments/:id/provision-argocd-app) : l'admin n'a plus besoin
// d'ouvrir l'interface Argo CD pour créer l'Application elle-même.
function ProvisionArgocdModal({ linkId, appName, onClose, onDone }) {
  const notify = useNotify();
  const [namespace, setNamespace] = useState('');
  const [path, setPath] = useState('.');
  const [automatedSync, setAutomatedSync] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/deployments/${linkId}/provision-argocd-app`, { destinationNamespace: namespace.trim(), path: path.trim() || '.', automatedSync });
      notify(`Application Argo CD provisionnée pour ${appName}`, { type: 'ok' });
      onDone();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Provisionner l'application Argo CD" sub={appName} onClose={onClose} width={420}>
      <form onSubmit={submit} className="pv-modal-form">
        <div className="pv-form-intro">
          Crée (ou met à jour) l'Application dans Argo CD à partir du dépôt Git déjà lié — pas besoin de la créer manuellement dans l'interface Argo CD.
        </div>
        <div>
          <label className="pv-form-label">Namespace cible</label>
          <input className="input mono" autoFocus required value={namespace} onChange={(e) => setNamespace(e.target.value)} placeholder="production" />
        </div>
        <div>
          <label className="pv-form-label">Chemin des manifestes dans le dépôt</label>
          <input className="input mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder="." />
        </div>
        <label className="pv-form-checkbox">
          <input type="checkbox" checked={automatedSync} onChange={(e) => setAutomatedSync(e.target.checked)} />
          Synchronisation automatique (prune + self-heal)
        </label>
        {error && <div className="pv-form-error">{error}</div>}
        <div className="pv-form-actions">
          <span className="btn-outline" onClick={onClose}>Annuler</span>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Provisionnement…' : 'Provisionner'}</button>
        </div>
      </form>
    </Modal>
  );
}

function StageDetail({ stageKey, stage }) {
  if (stage.error) return <div className="pv-stage-detail-error">{stage.error}</div>;
  if (!stage.configured) return <div className="faint pv-stage-detail-muted">Non renseigné pour cette application</div>;

  if (stageKey === 'git') {
    const p = stage.latestPipeline;
    return p ? <div className="mono pv-stage-detail-mono">#{p.id} · {p.status} · {p.ref}</div> : <div className="faint pv-stage-detail-muted">Aucun pipeline</div>;
  }
  if (stageKey === 'argocd') {
    return <div className="mono pv-stage-detail-mono">sync: {stage.syncStatus || '—'} · health: {stage.healthStatus || '—'}</div>;
  }
  if (stageKey === 'kubernetes') {
    const d = stage.deployment;
    return d ? <div className="mono pv-stage-detail-mono">{d.ready}/{d.replicas} répliques prêtes</div> : <div className="faint pv-stage-detail-muted">Deployment introuvable</div>;
  }
  if (stageKey === 'proxy') {
    const p = stage.proxy;
    return p ? <div className="mono pv-stage-detail-mono">{p.domain} → {p.status}</div> : <div className="faint pv-stage-detail-muted">Aucun proxy</div>;
  }
  return null;
}
