import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import ActionConfirmModal from '../../components/ui/ActionConfirmModal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

const STAGE_LABELS = {
  git: { gitlab: 'GitLab · CI/CD', github: 'GitHub · Actions' },
  argocd: 'Argo CD',
  kubernetes: 'Kubernetes',
  proxy: 'Reverse proxy'
};

export default function PipelineView({ linkId, span }) {
  const { data, reload } = useApi(() => api.get(`/deployments/${linkId}/pipeline`), [linkId], { pollMs: 15000 });
  const notify = useNotify();
  const [confirmSync, setConfirmSync] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);

  const hasArgo = data?.stages?.argocd?.configured;

  const gitLabel = typeof STAGE_LABELS.git === 'object' ? (STAGE_LABELS.git[data?.stages.git.provider] || 'Git') : STAGE_LABELS.git;

  return (
    <Panel
      title={`Pipeline · ${data?.link.name || ''}`}
      sub="développement → Git → CI/CD → Argo CD → Kubernetes → reverse proxy → domaine"
      span={span}
      actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="btn-outline" onClick={() => setConfirmSync(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="sync" size={13} />Synchroniser
          </span>
          {hasArgo && (
            <>
              <span className="btn-outline" onClick={() => setDeployOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="box" size={13} />Déployer une version
              </span>
              <span className="btn-outline" onClick={() => setRollbackOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--tone-crit-fg)' }}>
                <Icon name="refresh" size={13} />Revenir en arrière
              </span>
            </>
          )}
        </div>
      )}
    >
      <div style={{ display: 'flex', gap: 12, padding: 16, flexWrap: 'wrap' }}>
        <StageCard label={gitLabel} stage={data?.stages.git} stageKey="git" />
        <StageCard label={STAGE_LABELS.argocd} stage={data?.stages.argocd} stageKey="argocd" />
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
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>Révision Git (tag, branche ou SHA de commit)</label>
          <input className="input mono" autoFocus required value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="v2.9.0 ou a1b2c3d" />
        </div>
        <div className="faint" style={{ fontSize: 11.5 }}>Synchronise Argo CD vers cette révision précise plutôt que la dernière du dépôt.</div>
        {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
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
      {loading && <div className="faint" style={{ fontSize: 12.5 }}>Chargement de l'historique…</div>}
      {!loading && items.length === 0 && <div className="faint" style={{ fontSize: 12.5 }}>Aucun historique de déploiement disponible pour cette application.</div>}
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.slice(0, 10).map((h, i) => (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border-soft)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 12 }}>{(h.revision || '').slice(0, 10)}</div>
                <div className="faint" style={{ fontSize: 10.5 }}>{h.deployedAt ? new Date(h.deployedAt).toLocaleString('fr-FR') : '—'}{i === 0 ? ' · déploiement actuel' : ''}</div>
              </div>
              {i > 0 && (
                <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5 }} onClick={() => doRollback(h)}>
                  {busy ? '…' : 'Restaurer'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)', marginTop: 10 }}>{error}</div>}
    </Modal>
  );
}

function StageCard({ label, stage, stageKey }) {
  if (!stage) return null;
  const tone = !stage.configured ? 'mut' : stage.error ? 'crit' : 'ok';
  const externalUrl = stage.latestPipeline?.webUrl || stage.webUrl;
  return (
    <div className="card" style={{ flex: '1 1 220px', padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</span>
        <span className={`badge badge-${tone}`}><span className="dot" />{stage.configured ? (stage.error ? 'Erreur' : 'OK') : 'Non lié'}</span>
      </div>
      <StageDetail stageKey={stageKey} stage={stage} />
      {externalUrl && (
        <a href={externalUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, marginTop: 8 }}>
          <Icon name="externalLink" size={12} />Ouvrir dans l'outil
        </a>
      )}
    </div>
  );
}

function StageDetail({ stageKey, stage }) {
  if (stage.error) return <div style={{ fontSize: 12, color: 'var(--tone-crit-fg)' }}>{stage.error}</div>;
  if (!stage.configured) return <div className="faint" style={{ fontSize: 12 }}>Non renseigné pour cette application</div>;

  if (stageKey === 'git') {
    const p = stage.latestPipeline;
    return p ? <div className="mono" style={{ fontSize: 12 }}>#{p.id} · {p.status} · {p.ref}</div> : <div className="faint" style={{ fontSize: 12 }}>Aucun pipeline</div>;
  }
  if (stageKey === 'argocd') {
    return <div className="mono" style={{ fontSize: 12 }}>sync: {stage.syncStatus || '—'} · health: {stage.healthStatus || '—'}</div>;
  }
  if (stageKey === 'kubernetes') {
    const d = stage.deployment;
    return d ? <div className="mono" style={{ fontSize: 12 }}>{d.ready}/{d.replicas} répliques prêtes</div> : <div className="faint" style={{ fontSize: 12 }}>Deployment introuvable</div>;
  }
  if (stageKey === 'proxy') {
    const p = stage.proxy;
    return p ? <div className="mono" style={{ fontSize: 12 }}>{p.domain} → {p.status}</div> : <div className="faint" style={{ fontSize: 12 }}>Aucun proxy</div>;
  }
  return null;
}
