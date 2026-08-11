import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

export default function KubernetesPage() {
  const [namespace, setNamespace] = useState('');
  const status = useApi(() => api.get('/kubernetes/status'), []);
  const namespaces = useApi(() => api.get('/kubernetes/namespaces'), [], { pollMs: 30000 });
  const deployments = useApi(() => api.get(`/kubernetes/deployments${namespace ? `?namespace=${namespace}` : ''}`), [namespace], { pollMs: 15000 });
  const pods = useApi(() => api.get(`/kubernetes/pods${namespace ? `?namespace=${namespace}` : ''}`), [namespace], { pollMs: 15000 });
  const notify = useNotify();

  const configured = status.data?.status?.configured;

  async function restart(ns, name) {
    if (!confirm(`Redémarrer le déploiement ${ns}/${name} ?`)) return;
    try {
      const res = await api.post(`/kubernetes/deployments/${ns}/${name}/restart`, {});
      notify(res.message, { type: 'ok', title: 'Redémarrage déclenché' });
      deployments.reload();
    } catch (err) {
      notify(err.message, { type: 'crit', title: 'Échec du redémarrage' });
    }
  }

  if (status.data && !configured) {
    return (
      <>
        <PageHeader title="Kubernetes" sub="Cluster K3s/K8s, charges de travail et GitOps" />
        <div className="card"><EmptyState title="Kubernetes n'est pas configuré" hint="Renseignez l'URL du serveur API et un token de service depuis Paramètres → Kubernetes." /></div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Kubernetes"
        sub={status.data?.status?.message}
        actions={(
          <select className="input" style={{ width: 200 }} value={namespace} onChange={(e) => setNamespace(e.target.value)}>
            <option value="">Tous les namespaces</option>
            {namespaces.data?.items.map((n) => <option key={n.name} value={n.name}>{n.name}</option>)}
          </select>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
        <Panel title="Deployments" sub="Statut des déploiements et actions" span={12}>
          <DataTable
            columns={['Nom', 'Namespace', 'Répliques prêtes', 'Image', 'Actions']}
            rows={deployments.data?.items}
            emptyTitle="Aucun deployment"
            renderRow={(d) => (
              <tr key={`${d.namespace}/${d.name}`}>
                <td style={{ fontWeight: 500 }}>{d.name}</td>
                <td className="mono muted">{d.namespace}</td>
                <td className="mono">{d.ready}/{d.replicas}</td>
                <td className="mono faint" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.image}</td>
                <td><span className="btn-outline" style={{ height: 26, padding: '0 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center' }} onClick={() => restart(d.namespace, d.name)}>Redémarrer</span></td>
              </tr>
            )}
          />
        </Panel>

        <Panel title="Pods" sub="État en temps réel" span={12}>
          <DataTable
            columns={['Nom', 'Namespace', 'Phase', 'Redémarrages', 'Nœud']}
            rows={pods.data?.items}
            emptyTitle="Aucun pod"
            renderRow={(p) => (
              <tr key={`${p.namespace}/${p.name}`}>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td className="mono muted">{p.namespace}</td>
                <td><span className={`badge badge-${p.phase === 'Running' ? 'ok' : p.phase === 'Pending' ? 'warn' : 'crit'}`}><span className="dot" />{p.phase}</span></td>
                <td className="mono">{p.restarts}</td>
                <td className="mono faint">{p.node}</td>
              </tr>
            )}
          />
        </Panel>
      </div>
    </>
  );
}
