import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import MiniLineChart from '../../components/ui/MiniLineChart.jsx';
import Icon from '../../components/ui/Icon.jsx';
import ActionConfirmModal from '../../components/ui/ActionConfirmModal.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './InfrastructureShared.css';

const ACTION_IMPACT = {
  start: { tone: 'warn', label: 'Démarrer', impact: (v) => [`${v.type === 'qemu' ? 'La VM' : 'Le conteneur'} ${v.name} va démarrer.`, 'Les services qu\'il héberge redeviennent joignables dès le démarrage terminé.'] },
  shutdown: { tone: 'crit', label: 'Arrêter', impact: (v) => [`Arrêt propre (ACPI) ${v.type === 'qemu' ? 'de la VM' : 'du conteneur'} ${v.name}.`, 'Tous les services qu\'il héberge deviennent indisponibles.', 'Les connexions actives sont coupées.'] },
  reboot: { tone: 'warn', label: 'Redémarrer', impact: (v) => [`Redémarrage ${v.type === 'qemu' ? 'de la VM' : 'du conteneur'} ${v.name}.`, 'Coupure de service le temps du redémarrage.'] }
};

export default function ProxmoxPage() {
  const status = useApi(() => api.get('/proxmox/status'), []);
  const nodes = useApi(() => api.get('/proxmox/nodes'), [], { pollMs: 20000 });
  const [selectedNode, setSelectedNode] = useState(null);
  const vms = useApi(() => (selectedNode ? api.get(`/proxmox/nodes/${selectedNode}/vms`) : Promise.resolve(null)), [selectedNode], { pollMs: 15000 });
  const infraLoad = useApi(() => api.get('/status/infra-load'), [], { pollMs: 30000 });
  const notify = useNotify();
  const [pending, setPending] = useState(null);

  if (status.data && !status.data.status.configured) {
    return (
      <>
        <PageHeader title="Infrastructure" sub="Proxmox VE : nœuds, VM et conteneurs LXC" />
        <div className="card"><EmptyState title="Proxmox n'est pas configuré" hint="Renseignez l'URL de l'API et un token depuis Paramètres → Proxmox." /></div>
      </>
    );
  }

  function askAction(node, v, act) {
    const cfg = ACTION_IMPACT[act];
    setPending({
      title: `${cfg.label} — ${v.name}`,
      sub: `${node} · ${v.type}/${v.vmid}`,
      tone: cfg.tone,
      confirmLabel: cfg.label,
      impact: cfg.impact(v),
      run: async () => {
        const res = await api.post(`/proxmox/nodes/${node}/${v.type}/${v.vmid}/${act}`, {});
        notify(res.message, { type: 'ok' });
        vms.reload();
      }
    });
  }

  const items = nodes.data?.items || [];
  const onlineCount = items.filter((n) => n.status === 'online').length;
  const avgCpu = items.length ? Math.round((items.reduce((s, n) => s + (n.cpu || 0), 0) / items.length) * 100) : 0;
  const avgMem = items.length ? Math.round((items.reduce((s, n) => s + (n.mem || 0) / (n.maxmem || 1), 0) / items.length) * 100) : 0;
  const baseUrl = status.data?.status?.baseUrl;

  return (
    <>
      <PageHeader
        title="Infrastructure"
        sub={status.data?.status?.message}
        actions={baseUrl && (
          <a href={baseUrl} target="_blank" rel="noreferrer" className="btn-outline infra-header-link">
            <Icon name="externalLink" size={14} />Ouvrir Proxmox
          </a>
        )}
      />

      <div className="infra-kpi-grid">
        <KpiCard label="Nœuds en ligne" value={onlineCount} unit={`/ ${items.length}`} tint="#10B981" />
        <KpiCard label="CPU moyen" value={avgCpu} unit="%" tint={avgCpu > 80 ? '#F43F5E' : '#3B82F6'} />
        <KpiCard label="Mémoire moyenne" value={avgMem} unit="%" tint={avgMem > 80 ? '#F43F5E' : '#8B5CF6'} />
      </div>

      <div className="infra-panel-grid">
        <Panel title="Nœuds Proxmox" sub="Cliquez sur un nœud pour voir ses VM et conteneurs" span={12}>
          {items.length === 0 ? (
            <EmptyState title="Aucun nœud" />
          ) : (
            <div className="infra-node-list">
              {items.map((n) => {
                const cpuPct = Math.round((n.cpu || 0) * 100);
                const memPct = Math.round(((n.mem || 0) / (n.maxmem || 1)) * 100);
                const diskPct = n.maxdisk ? Math.round((n.disk / n.maxdisk) * 100) : null;
                return (
                  <div key={n.node} onClick={() => setSelectedNode(n.node)} className="infra-node-row">
                    <span className="infra-node-name">{n.node}<span className="faint infra-node-cpu-count">{n.maxcpu ? `${n.maxcpu} vCPU` : ''}</span></span>
                    <span className={`badge badge-${n.status === 'online' ? 'ok' : 'crit'} infra-node-badge`}><span className="dot" />{n.status}</span>
                    <GaugeBar label="CPU" pct={cpuPct} />
                    <GaugeBar label="RAM" pct={memPct} />
                    {diskPct !== null && <GaugeBar label="Disque" pct={diskPct} />}
                    <span className="mono faint infra-node-uptime">{Math.round((n.uptime || 0) / 3600)} h</span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {selectedNode && (
          <NodeHistoryPanel node={selectedNode} samples={infraLoad.data?.samples || []} />
        )}

        {selectedNode && (
          <Panel title={`VM & LXC · ${selectedNode}`} span={12}>
            <DataTable
              columns={['ID', 'Nom', 'Type', 'Statut', 'Actions']}
              rows={vms.data?.items}
              emptyTitle="Aucune VM/conteneur"
              renderRow={(v) => (
                <tr key={`${v.type}-${v.vmid}`}>
                  <td className="mono">{v.vmid}</td>
                  <td className="infra-cell-name">{v.name}</td>
                  <td>{v.type}</td>
                  <td><span className={`badge badge-${v.status === 'running' ? 'ok' : 'mut'}`}><span className="dot" />{v.status}</span></td>
                  <td>
                    <div className="infra-row-actions">
                      <span className="btn-outline infra-action-btn" onClick={() => askAction(selectedNode, v, 'start')}>Démarrer</span>
                      <span className="btn-outline infra-action-btn infra-action-btn-danger" onClick={() => askAction(selectedNode, v, 'shutdown')}>Arrêter</span>
                      <span className="btn-outline infra-action-btn" onClick={() => askAction(selectedNode, v, 'reboot')}>Redémarrer</span>
                    </div>
                  </td>
                </tr>
              )}
            />
          </Panel>
        )}
      </div>

      {pending && (
        <ActionConfirmModal
          title={pending.title}
          sub={pending.sub}
          tone={pending.tone}
          impact={pending.impact}
          confirmLabel={pending.confirmLabel}
          onClose={() => setPending(null)}
          onConfirm={pending.run}
        />
      )}
    </>
  );
}

// Historique CPU/RAM d'un nœud précis, extrait du même échantillonnage que
// le graphe agrégé de l'accueil (services/infraLoadService.js, 30s
// d'intervalle, ~6h conservées en mémoire) — pas de nouvelle intégration,
// juste le détail par nœud déjà présent dans chaque échantillon.
function NodeHistoryPanel({ node, samples }) {
  const nodeSamples = samples.filter((s) => s.nodes?.[node]);
  const cpuSeries = nodeSamples.map((s) => s.nodes[node].cpuPct);
  const ramSeries = nodeSamples.map((s) => s.nodes[node].ramPct);

  return (
    <Panel title={`Charge du nœud · ${node}`} sub="Échantillonnage toutes les 30s, ~6h conservées" span={12}>
      <div className="infra-history-grid">
        <div>
          <div className="faint infra-history-label">CPU</div>
          <MiniLineChart values={cpuSeries} height={80} color="#3B82F6" />
        </div>
        <div>
          <div className="faint infra-history-label">Mémoire</div>
          <MiniLineChart values={ramSeries} height={80} color="#8B5CF6" />
        </div>
      </div>
    </Panel>
  );
}

function GaugeBar({ label, pct }) {
  const color = pct > 85 ? 'var(--tone-crit-dot)' : pct > 65 ? 'var(--tone-warn-dot)' : 'var(--tone-ok-dot)';
  return (
    <div className="infra-gauge">
      <span className="faint infra-gauge-label">{label}</span>
      <div className="infra-gauge-track">
        <div className="infra-gauge-fill" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
      <span className="mono infra-gauge-value">{pct}%</span>
    </div>
  );
}
