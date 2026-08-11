import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

export default function ProxmoxPage() {
  const status = useApi(() => api.get('/proxmox/status'), []);
  const nodes = useApi(() => api.get('/proxmox/nodes'), [], { pollMs: 20000 });
  const [selectedNode, setSelectedNode] = useState(null);
  const vms = useApi(() => (selectedNode ? api.get(`/proxmox/nodes/${selectedNode}/vms`) : Promise.resolve(null)), [selectedNode], { pollMs: 15000 });

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
      await api.post(`/proxmox/nodes/${node}/${type}/${vmid}/${act}`, {});
      vms.reload();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      <PageHeader title="Infrastructure" sub={status.data?.status?.message} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
        <Panel title="Nœuds Proxmox" span={12}>
          <DataTable
            columns={['Nœud', 'Statut', 'CPU', 'Mémoire', 'Uptime', '']}
            rows={nodes.data?.items}
            emptyTitle="Aucun nœud"
            renderRow={(n) => (
              <tr key={n.node} onClick={() => setSelectedNode(n.node)} style={{ cursor: 'pointer' }}>
                <td style={{ fontWeight: 500 }}>{n.node}</td>
                <td><span className={`badge badge-${n.status === 'online' ? 'ok' : 'crit'}`}><span className="dot" />{n.status}</span></td>
                <td className="mono">{Math.round((n.cpu || 0) * 100)}%</td>
                <td className="mono">{Math.round(((n.mem || 0) / (n.maxmem || 1)) * 100)}%</td>
                <td className="mono faint">{Math.round((n.uptime || 0) / 3600)} h</td>
                <td><span style={{ fontSize: 12, color: 'var(--primary)' }}>Voir les VM →</span></td>
              </tr>
            )}
          />
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

const btnMini = { height: 26, padding: '0 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center' };
