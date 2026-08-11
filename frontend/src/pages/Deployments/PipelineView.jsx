import Panel from '../../components/ui/Panel.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

const STAGES = [
  { key: 'git', label: 'GitLab · CI/CD' },
  { key: 'argocd', label: 'Argo CD' },
  { key: 'kubernetes', label: 'Kubernetes' },
  { key: 'proxy', label: 'Reverse proxy' }
];

export default function PipelineView({ linkId, span }) {
  const { data, reload } = useApi(() => api.get(`/deployments/${linkId}/pipeline`), [linkId], { pollMs: 15000 });

  async function sync() {
    try {
      const res = await api.post(`/deployments/${linkId}/sync`, {});
      alert(res.message);
    } catch (err) {
      alert(err.message);
    } finally {
      reload();
    }
  }

  return (
    <Panel title={`Pipeline · ${data?.link.name || ''}`} sub="développement → Git → CI/CD → Argo CD → Kubernetes → reverse proxy → domaine" span={span} actions={<span className="btn-outline" onClick={sync}>Synchroniser Argo CD</span>}>
      <div style={{ display: 'flex', gap: 12, padding: 16, flexWrap: 'wrap' }}>
        {STAGES.map((s) => (
          <StageCard key={s.key} label={s.label} stage={data?.stages[s.key]} stageKey={s.key} />
        ))}
      </div>
    </Panel>
  );
}

function StageCard({ label, stage, stageKey }) {
  if (!stage) return null;
  const tone = !stage.configured ? 'mut' : stage.error ? 'crit' : 'ok';
  return (
    <div className="card" style={{ flex: '1 1 220px', padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</span>
        <span className={`badge badge-${tone}`}><span className="dot" />{stage.configured ? (stage.error ? 'Erreur' : 'OK') : 'Non lié'}</span>
      </div>
      <StageDetail stageKey={stageKey} stage={stage} />
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
