import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

export default function ProxmoxPage() {
  const status = useApi(() => api.get('/proxmox/status'), []);
  const nodes = useApi(() => api.get('/proxmox/nodes'), [], { pollMs: 20000 });
  const [selectedNode, setSelectedNode] = useState(null);
  const vms = useApi(() => (selectedNode ? api.get(`/proxmox/nodes/${selectedNode}/vms`) : Promise.resolve(null)), [selectedNode], { pollMs: 15000 });
  const notify = useNotify();

  if (status.data && !status.data.status.configured) {
    return (
      <>
        <PageHeader title="Infrastructure" sub="Proxmox VE : nœuds, VM et conteneurs LXC" />
        <div className="card"><EmptyState title="Proxmox n'est pas configuré" hint="Renseignez l'URL de l'API et un token depuis Paramètres → Proxmox." /></div>
      </>
    );
  }

  async function action(node, type, vmid, act) {
    if (!confirm(`${act} sur ${type}/${vmid} (${node}) ?`)) return;
    try {
      const res = await api.post(`/proxmox/nodes/${node}/${type}/${vmid}/${act}`, {});
      notify(res.message, { type: 'ok' });
      vms.reload();
    } catch (err) {
      notify(err.message, { type: 'crit', title: 'Action Proxmox échouée' });
    }
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
          <a href={baseUrl} target="_blank" rel="noreferrer" className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
            <Icon name="externalLink" size={14} />Ouvrir Proxmox
          </a>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard label="Nœuds en ligne" value={onlineCount} unit={`/ ${items.length}`} tint="#10B981" />
        <KpiCard label="CPU moyen" value={avgCpu} unit="%" tint={avgCpu > 80 ? '#F43F5E' : '#3B82F6'} />
        <KpiCard label="Mémoire moyenne" value={avgMem} unit="%" tint={avgMem > 80 ? '#F43F5E' : '#8B5CF6'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
        <Panel title="Nœuds Proxmox" sub="Cliquez sur un nœud pour voir ses VM et conteneurs" span={12}>
          {items.length === 0 ? (
            <EmptyState title="Aucun nœud" />
          ) : (
            <div style={{ padding: 6 }}>
              {items.map((n) => {
                const cpuPct = Math.round((n.cpu || 0) * 100);
                const memPct = Math.round(((n.mem || 0) / (n.maxmem || 1)) * 100);
                return (
                  <div
                    key={n.node}
                    onClick={() => setSelectedNode(n.node)}
                    className="home-integration-row"
                    style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '13px 16px', borderBottom: '1px solid var(--border-soft)', cursor: 'pointer' }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13.5, width: 120 }}>{n.node}</span>
                    <span className={`badge badge-${n.status === 'online' ? 'ok' : 'crit'}`} style={{ flex: 'none' }}><span className="dot" />{n.status}</span>
                    <GaugeBar label="CPU" pct={cpuPct} />
                    <GaugeBar label="RAM" pct={memPct} />
                    <span className="mono faint" style={{ fontSize: 11, width: 70, textAlign: 'right' }}>{Math.round((n.uptime || 0) / 3600)} h</span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {selectedNode && (
          <Panel title={`VM & LXC · ${selectedNode}`} span={12}>
            <DataTable
              columns={['ID', 'Nom', 'Type', 'Statut', 'Actions']}
              rows={vms.data?.items}
              emptyTitle="Aucune VM/conteneur"
              renderRow={(v) => (
                <tr key={`${v.type}-${v.vmid}`}>
                  <td className="mono">{v.vmid}</td>
                  <td style={{ fontWeight: 500 }}>{v.name}</td>
                  <td>{v.type}</td>
                  <td><span className={`badge badge-${v.status === 'running' ? 'ok' : 'mut'}`}><span className="dot" />{v.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span className="btn-outline" style={btnMini} onClick={() => action(selectedNode, v.type, v.vmid, 'start')}>Démarrer</span>
                      <span className="btn-outline" style={btnMini} onClick={() => action(selectedNode, v.type, v.vmid, 'shutdown')}>Arrêter</span>
                      <span className="btn-outline" style={btnMini} onClick={() => action(selectedNode, v.type, v.vmid, 'reboot')}>Redémarrer</span>
                    </div>
                  </td>
                </tr>
              )}
            />
          </Panel>
        )}
      </div>
    </>
  );
}

function GaugeBar({ label, pct }) {
  const color = pct > 85 ? 'var(--tone-crit-dot)' : pct > 65 ? 'var(--tone-warn-dot)' : 'var(--tone-ok-dot)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 140 }}>
      <span className="faint" style={{ fontSize: 10.5, width: 26, flex: 'none' }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--border-soft)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, transition: 'width .3s ease' }} />
      </div>
      <span className="mono" style={{ fontSize: 11, width: 32, flex: 'none', textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

const btnMini = { height: 26, padding: '0 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center' };
