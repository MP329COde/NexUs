import Panel from '../../components/ui/Panel.jsx';
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

  async function sync() {
    try {
      const res = await api.post(`/deployments/${linkId}/sync`, {});
      notify(res.message, { type: 'ok', title: 'Argo CD' });
    } catch (err) {
      notify(err.message, { type: 'crit', title: 'Synchronisation échouée' });
    } finally {
      reload();
    }
  }

  const gitLabel = typeof STAGE_LABELS.git === 'object' ? (STAGE_LABELS.git[data?.stages.git.provider] || 'Git') : STAGE_LABELS.git;

  return (
    <Panel
      title={`Pipeline · ${data?.link.name || ''}`}
      sub="développement → Git → CI/CD → Argo CD → Kubernetes → reverse proxy → domaine"
      span={span}
      actions={(
        <span className="btn-outline" onClick={sync} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="sync" size={13} />Synchroniser Argo CD
        </span>
      )}
    >
      <div style={{ display: 'flex', gap: 12, padding: 16, flexWrap: 'wrap' }}>
        <StageCard label={gitLabel} stage={data?.stages.git} stageKey="git" />
        <StageCard label={STAGE_LABELS.argocd} stage={data?.stages.argocd} stageKey="argocd" />
        <StageCard label={STAGE_LABELS.kubernetes} stage={data?.stages.kubernetes} stageKey="kubernetes" />
        <StageCard label={STAGE_LABELS.proxy} stage={data?.stages.proxy} stageKey="proxy" />
      </div>
    </Panel>
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
