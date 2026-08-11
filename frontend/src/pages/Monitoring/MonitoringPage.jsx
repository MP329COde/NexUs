import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

export default function MonitoringPage() {
  const status = useApi(() => api.get('/grafana/status'), [], { pollMs: 30000 });
  const dashboards = useApi(() => api.get('/grafana/dashboards'), [], { pollMs: 60000 });
  const alerts = useApi(() => api.get('/grafana/alerts'), [], { pollMs: 15000 });

  if (status.data && !status.data.status.configured) {
    return (
      <>
        <PageHeader title="Monitoring" sub="Métriques, alertes et tableaux de bord Grafana" />
        <div className="card"><EmptyState title="Grafana n'est pas configuré" hint="Renseignez l'URL et une clé API depuis Paramètres → Grafana." /></div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Monitoring" sub={status.data?.status?.message} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
        <Panel title="Alertes actives" span={12}>
          <DataTable
            columns={['Alerte', 'Sévérité', 'État', 'Déclenchée le']}
            rows={alerts.data?.items}
            emptyTitle="Aucune alerte active"
            renderRow={(a, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{a.name}</td>
                <td><span className={`badge badge-${a.severity === 'critical' ? 'crit' : a.severity === 'warning' ? 'warn' : 'info'}`}><span className="dot" />{a.severity}</span></td>
                <td>{a.status}</td>
                <td className="mono faint">{a.startsAt ? new Date(a.startsAt).toLocaleString('fr-FR') : '—'}</td>
              </tr>
            )}
          />
        </Panel>

        <Panel title="Tableaux de bord" span={12}>
          <DataTable
            columns={['Titre', 'Dossier', 'Lien']}
            rows={dashboards.data?.items}
            emptyTitle="Aucun tableau de bord"
            renderRow={(d) => (
              <tr key={d.uid}>
                <td style={{ fontWeight: 500 }}>{d.title}</td>
                <td className="muted">{d.folderTitle || '—'}</td>
                <td><a href={d.url} target="_blank" rel="noreferrer">Ouvrir dans Grafana ↗</a></td>
              </tr>
            )}
          />
        </Panel>
      </div>
    </>
  );
}
