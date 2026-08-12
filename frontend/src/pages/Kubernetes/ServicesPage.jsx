import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

export default function ServicesPage() {
  const [namespace, setNamespace] = useState('');
  const status = useApi(() => api.get('/kubernetes/status'), []);
  const namespaces = useApi(() => api.get('/kubernetes/namespaces'), []);
  const services = useApi(() => api.get(`/kubernetes/services${namespace ? `?namespace=${namespace}` : ''}`), [namespace], { pollMs: 20000 });

  if (status.data && !status.data.status.configured) {
    return <div className="card"><EmptyState title="Kubernetes n'est pas configuré" hint="Renseignez l'URL du serveur API et un token de service depuis Paramètres → Kubernetes." /></div>;
  }

  return (
    <>
      <PageHeader
        title="Services"
        sub="Points d'accès réseau des charges de travail (ClusterIP, NodePort, LoadBalancer)"
        actions={(
          <select className="input" style={{ width: 200 }} value={namespace} onChange={(e) => setNamespace(e.target.value)}>
            <option value="">Tous les namespaces</option>
            {namespaces.data?.items.map((n) => <option key={n.name} value={n.name}>{n.name}</option>)}
          </select>
        )}
      />
      <Panel title="Services" span={12}>
        <DataTable
          columns={['Nom', 'Namespace', 'Type', 'IP cluster', 'Ports']}
          rows={services.data?.items}
          emptyTitle="Aucun service"
          renderRow={(s) => (
            <tr key={`${s.namespace}/${s.name}`}>
              <td style={{ fontWeight: 500 }}>{s.name}</td>
              <td className="mono muted">{s.namespace}</td>
              <td><span className={`badge badge-${s.type === 'LoadBalancer' ? 'vio' : s.type === 'NodePort' ? 'warn' : 'mut'}`}><span className="dot" />{s.type}</span></td>
              <td className="mono faint">{s.clusterIP}</td>
              <td className="mono faint">{s.ports.join(', ')}</td>
            </tr>
          )}
        />
      </Panel>
    </>
  );
}
