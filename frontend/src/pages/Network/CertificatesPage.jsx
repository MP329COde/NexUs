import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ActionConfirmModal from '../../components/ui/ActionConfirmModal.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './NetworkShared.css';

export default function CertificatesPage() {
  const status = useApi(() => api.get('/certmanager/status'), []);
  const certs = useApi(() => api.get('/certmanager/certificates'), [], { pollMs: 30000 });
  const notify = useNotify();
  const [pending, setPending] = useState(null);

  if (status.data && !status.data.status.configured) {
    return (
      <>
        <PageHeader title="Certificats" sub="Certificats TLS gérés par cert-manager" />
        <div className="card"><EmptyState title="Cert-Manager n'est pas disponible" hint="Cert-Manager dépend de l'accès Kubernetes : configurez-le depuis Paramètres → Kubernetes." /></div>
      </>
    );
  }

  function askRenew(c) {
    setPending({
      title: `Renouveler ${c.name}`,
      sub: `${c.namespace} · ${(c.dnsNames || []).join(', ') || 'sans domaine'}`,
      tone: 'warn',
      confirmLabel: 'Renouveler',
      impact: [
        `Supprime le secret TLS "${c.secretName}" — cert-manager le détecte manquant et réémet immédiatement un certificat.`,
        'Le certificat actuel reste valide jusqu\'à ce que le nouveau soit émis (généralement quelques secondes à minutes selon l\'émetteur).',
        'Si l\'émetteur (Let\'s Encrypt...) est temporairement indisponible ou limité en quota, la réémission peut échouer.'
      ],
      run: async () => {
        const res = await api.post(`/certmanager/certificates/${c.namespace}/${c.name}/renew`, {});
        notify(res.message, { type: 'ok', title: 'Renouvellement déclenché' });
        certs.reload();
      }
    });
  }

  return (
    <>
      <PageHeader title="Certificats" sub={status.data?.status?.message} />
      <Panel title="Certificats cert-manager" sub="Statut de renouvellement automatique" span={12}>
        <DataTable
          columns={['Nom', 'Namespace', 'Domaines', 'Secret', 'Statut', 'Renouvellement', '']}
          rows={certs.data?.items}
          emptyTitle="Aucun certificat"
          renderRow={(c) => (
            <tr key={`${c.namespace}/${c.name}`}>
              <td className="net-cell-name">{c.name}</td>
              <td className="mono muted">{c.namespace}</td>
              <td className="mono cert-cell-domains">{(c.dnsNames || []).join(', ')}</td>
              <td className="mono faint">{c.secretName}</td>
              <td><span className={`badge badge-${c.ready ? 'ok' : 'warn'}`}><span className="dot" />{c.ready ? 'Prêt' : 'En attente'}</span></td>
              <td className="mono faint">{c.renewalTime ? new Date(c.renewalTime).toLocaleDateString('fr-FR') : '—'}</td>
              <td>
                <span className="btn-outline cert-renew-btn" onClick={() => askRenew(c)}>Renouveler</span>
              </td>
            </tr>
          )}
        />
      </Panel>

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
