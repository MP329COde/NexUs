import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

export default function CertificatesPage() {
  const status = useApi(() => api.get('/certmanager/status'), []);
  const certs = useApi(() => api.get('/certmanager/certificates'), [], { pollMs: 30000 });

  if (status.data && !status.data.status.configured) {
    return (
      <>
        <PageHeader title="Certificats" sub="Certificats TLS gérés par cert-manager" />
        <div className="card"><EmptyState title="Cert-Manager n'est pas disponible" hint="Cert-Manager dépend de l'accès Kubernetes : configurez-le depuis Paramètres → Kubernetes." /></div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Certificats" sub={status.data?.status?.message} />
      <Panel title="Certificats cert-manager" sub="Statut de renouvellement automatique" span={12}>
        <DataTable
          columns={['Nom', 'Namespace', 'Domaines', 'Secret', 'Statut', 'Renouvellement']}
          rows={certs.data?.items}
          emptyTitle="Aucun certificat"
          renderRow={(c) => (
            <tr key={`${c.namespace}/${c.name}`}>
              <td style={{ fontWeight: 500 }}>{c.name}</td>
              <td className="mono muted">{c.namespace}</td>
              <td className="mono" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{(c.dnsNames || []).join(', ')}</td>
              <td className="mono faint">{c.secretName}</td>
              <td><span className={`badge badge-${c.ready ? 'ok' : 'warn'}`}><span className="dot" />{c.ready ? 'Prêt' : 'En attente'}</span></td>
              <td className="mono faint">{c.renewalTime ? new Date(c.renewalTime).toLocaleDateString('fr-FR') : '—'}</td>
            </tr>
          )}
        />
      </Panel>
    </>
  );
}
