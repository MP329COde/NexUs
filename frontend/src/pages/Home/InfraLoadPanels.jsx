import Panel from '../../components/ui/Panel.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import './InfraLoadPanels.css';

const CPU_COLOR = '#3B82F6';
const RAM_COLOR = '#8B5CF6';

function buildPath(values, width, height, max) {
  if (values.length < 2) return '';
  const step = width / (values.length - 1);
  return values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(height - (v / max) * height).toFixed(1)}`).join(' ');
}

// "Charge de l'infrastructure" : CPU/RAM agrégés des nœuds Proxmox en ligne,
// échantillonnés côté serveur toutes les 30s (mémoire uniquement, voir
// infraLoadService.js). Vide tant que Proxmox n'est pas configuré.
export function InfraLoadPanel() {
  const { data } = useApi(() => api.get('/status/infra-load'), [], { pollMs: 10000 });
  const samples = data?.samples || [];
  const width = 640;
  const height = 130;

  if (samples.length === 0) {
    return (
      <Panel title="Charge de l'infrastructure" sub="CPU et mémoire agrégés" span={8}>
        <div className="ilp-empty">
          Non configuré — nécessite l'intégration Proxmox (Paramètres → Intégrations)
        </div>
      </Panel>
    );
  }

  const cpuValues = samples.map((s) => s.cpuPct);
  const ramValues = samples.map((s) => s.ramPct);
  const lastCpu = cpuValues[cpuValues.length - 1];
  const lastRam = ramValues[ramValues.length - 1];
  const spanMinutes = Math.round((new Date(samples[samples.length - 1].ts) - new Date(samples[0].ts)) / 60000);

  return (
    <Panel
      title="Charge de l'infrastructure"
      sub="CPU et mémoire agrégés des nœuds Proxmox en ligne"
      span={8}
      actions={(
        <span className="badge badge-ok ilp-live-badge">
          <span className="dot ilp-live-dot" />LIVE
        </span>
      )}
    >
      <div className="ilp-chart-body">
        <svg viewBox={`0 0 ${width} ${height}`} className="ilp-svg" style={{ height }} preserveAspectRatio="none">
          <path d={buildPath(cpuValues, width, height, 100)} fill="none" stroke={CPU_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <path d={buildPath(ramValues, width, height, 100)} fill="none" stroke={RAM_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="ilp-legend-row">
          <LegendDot color={CPU_COLOR} label="CPU" value={`${lastCpu} %`} />
          <LegendDot color={RAM_COLOR} label="RAM" value={`${lastRam} %`} />
          <span className="ilp-legend-time mono">
            {spanMinutes < 1 ? 'quelques secondes' : `-${spanMinutes} min`} → maintenant
          </span>
        </div>
      </div>
    </Panel>
  );
}

function LegendDot({ color, label, value }) {
  return (
    <span className="ilp-legend-dot">
      <span className="ilp-legend-swatch" style={{ background: color }} />
      <span className="ilp-legend-label">{label}</span>
      <span className="mono ilp-legend-value">{value}</span>
    </span>
  );
}

const WORKLOAD_SEGMENTS = [
  { key: 'vms', label: 'Machines virtuelles', color: '#3B82F6' },
  { key: 'lxc', label: 'Conteneurs LXC', color: '#8B5CF6' },
  { key: 'docker', label: 'Docker', color: '#10B981' },
  { key: 'pods', label: 'Pods K3s', color: '#F59E0B' }
];

// "Répartition des charges" : donut VM/LXC (Proxmox) + Pods (Kubernetes).
// Docker n'a pas d'intégration dans la console : toujours affiché "Non
// configuré" plutôt qu'une fausse valeur.
export function WorkloadDonutPanel() {
  const { data } = useApi(() => api.get('/status/workloads'), [], { pollMs: 15000 });
  const counts = { vms: data?.vms ?? null, lxc: data?.lxc ?? null, docker: data?.docker ?? null, pods: data?.pods ?? null };
  const total = WORKLOAD_SEGMENTS.reduce((s, seg) => s + (counts[seg.key] || 0), 0);

  const r = 46;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const arcs = total > 0 ? WORKLOAD_SEGMENTS.map((seg) => {
    const value = counts[seg.key] || 0;
    if (value === 0) return null;
    const frac = value / total;
    const dash = frac * circumference;
    const arc = { ...seg, dash, gap: circumference - dash, offset };
    offset += dash;
    return arc;
  }).filter(Boolean) : [];

  return (
    <Panel title="Répartition des charges" sub="Par type de workload" span={4}>
      <div className="wdp-body">
        <div className="wdp-donut-wrap">
          <svg width={116} height={116} viewBox="0 0 116 116" className="wdp-donut-svg">
            {arcs.length === 0 ? (
              <circle cx={58} cy={58} r={r} fill="none" stroke="var(--border-soft)" strokeWidth={14} />
            ) : arcs.map((a) => (
              <circle
                key={a.key}
                cx={58} cy={58} r={r}
                fill="none" stroke={a.color} strokeWidth={14}
                strokeDasharray={`${a.dash} ${a.gap}`}
                strokeDashoffset={-a.offset}
              />
            ))}
          </svg>
          <div className="wdp-donut-center">
            <span className="mono wdp-donut-center-value">{total || '—'}</span>
            <span className="wdp-donut-center-label">workloads</span>
          </div>
        </div>
        <div className="wdp-legend">
          <div className="wdp-legend-list">
            {WORKLOAD_SEGMENTS.map((seg) => (
              <div key={seg.key} className="wdp-legend-row">
                <span className="wdp-legend-swatch" style={{ background: seg.color }} />
                <span className="wdp-legend-label">{seg.label}</span>
                <span className="mono wdp-legend-count">{counts[seg.key] === null ? '—' : counts[seg.key]}</span>
                <span className="mono wdp-legend-pct">
                  {counts[seg.key] && total ? `${Math.round((counts[seg.key] / total) * 100)}%` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {total === 0 && (
        <div className="wdp-empty">
          Aucune donnée (Proxmox et Kubernetes non configurés)
        </div>
      )}
    </Panel>
  );
}
