import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

export default function SecurityPage() {
  const status = useApi(() => api.get('/wazuh/status'), [], { pollMs: 30000 });
  const agents = useApi(() => api.get('/wazuh/agents'), [], { pollMs: 20000 });
  const summary = useApi(() => api.get('/wazuh/summary'), [], { pollMs: 20000 });

  if (status.data && !status.data.status.configured) {
    return (
      <>
        <PageHeader title="Cybersécurité" sub="Agents, conformité et alertes de sécurité (Wazuh)" />
        <div className="card"><EmptyState title="Wazuh n'est pas configuré" hint="Renseignez l'URL du gestionnaire et des identifiants API depuis Paramètres → Wazuh." /></div>
      </>
    );
  }

  const s = summary.data?.summary?.connection || {};

  return (
    <>
      <PageHeader title="Cybersécurité" sub={status.data?.status?.message} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard label="Agents actifs" value={s.active ?? '—'} tint="#10B981" />
        <KpiCard label="Déconnectés" value={s.disconnected ?? '—'} tint="#F43F5E" />
        <KpiCard label="Jamais connectés" value={s.never_connected ?? '—'} tint="#94A3B8" />
        <KpiCard label="Total" value={s.total ?? '—'} tint="#3B82F6" />
      </div>

      <Panel title="Agents Wazuh" sub="Supervision des hôtes" span={12}>
        <DataTable
          columns={['Agent', 'Adresse IP', 'OS', 'Version', 'Statut', 'Dernier contact']}
          rows={agents.data?.items}
          emptyTitle="Aucun agent"
          renderRow={(a) => (
            <tr key={a.id}>
              <td style={{ fontWeight: 500 }}>{a.name}</td>
              <td className="mono muted">{a.ip}</td>
              <td>{a.os || '—'}</td>
              <td className="mono faint">{a.version}</td>
              <td><span className={`badge badge-${a.status === 'active' ? 'ok' : a.status === 'disconnected' ? 'crit' : 'mut'}`}><span className="dot" />{a.status}</span></td>
              <td className="mono faint">{a.lastKeepAlive ? new Date(a.lastKeepAlive).toLocaleString('fr-FR') : '—'}</td>
            </tr>
          )}
        />
      </Panel>
    </>
  );
}
