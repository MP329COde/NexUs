import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import './MonitoringPage.css';

const SEVERITY_FILTERS = [
  { value: '', label: 'Toutes' },
  { value: 'critical', label: 'Critiques' },
  { value: 'warning', label: 'Avertissements' }
];

export default function MonitoringPage() {
  const status = useApi(() => api.get('/grafana/status'), [], { pollMs: 30000 });
  const dashboards = useApi(() => api.get('/grafana/dashboards'), [], { pollMs: 60000 });
  const alerts = useApi(() => api.get('/grafana/alerts'), [], { pollMs: 15000 });
  const [severityFilter, setSeverityFilter] = useState('');
  const [nodes, setNodes] = useState(null);

  // Les hôtes (nœuds Proxmox) sont chargés en best-effort : cette page reste
  // utile même si seul Grafana (pas Proxmox) est configuré.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.get('/proxmox/nodes');
        if (!cancelled) setNodes(res.items);
      } catch {
        if (!cancelled) setNodes([]);
      }
    }
    load();
    const id = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (status.data && !status.data.status.configured) {
    return (
      <>
        <PageHeader title="Monitoring" sub="Métriques, alertes et tableaux de bord Grafana" />
        <div className="card"><EmptyState title="Grafana n'est pas configuré" hint="Renseignez l'URL et une clé API depuis Paramètres → Grafana." /></div>
      </>
    );
  }

  const allAlerts = alerts.data?.items || [];
  const critCount = allAlerts.filter((a) => a.severity === 'critical').length;
  const warnCount = allAlerts.filter((a) => a.severity === 'warning').length;
  const filteredAlerts = severityFilter ? allAlerts.filter((a) => a.severity === severityFilter) : allAlerts;

  return (
    <>
      <PageHeader title="Monitoring" sub={status.data?.status?.message} />

      <div className="monitoring-kpi-grid">
        <KpiCard label="Alertes critiques" value={critCount} tint={critCount > 0 ? '#F43F5E' : '#10B981'} />
        <KpiCard label="Avertissements" value={warnCount} tint={warnCount > 0 ? '#F59E0B' : '#10B981'} />
        <KpiCard label="Tableaux de bord" value={dashboards.data?.items?.length ?? '—'} tint="#3B82F6" />
        <KpiCard label="Hôtes surveillés" value={nodes === null ? '—' : nodes.length} tint="#8B5CF6" note={nodes?.length === 0 ? 'Proxmox non configuré' : undefined} />
      </div>

      <div className="monitoring-panel-grid">
        <Panel
          title="Alertes actives"
          sub="Grafana, temps réel"
          span={12}
          actions={(
            <div className="monitoring-severity-tabs">
              {SEVERITY_FILTERS.map((f) => (
                <span
                  key={f.value}
                  onClick={() => setSeverityFilter(f.value)}
                  className={`monitoring-severity-tab${severityFilter === f.value ? ' monitoring-severity-tab-active' : ''}`}
                >
                  {f.label}
                </span>
              ))}
            </div>
          )}
        >
          <DataTable
            columns={['Alerte', 'Sévérité', 'État', 'Déclenchée le']}
            rows={filteredAlerts}
            emptyTitle={severityFilter ? 'Aucune alerte pour ce filtre' : 'Aucune alerte active'}
            renderRow={(a, i) => (
              <tr key={i}>
                <td className="monitoring-cell-name">{a.name}</td>
                <td><span className={`badge badge-${a.severity === 'critical' ? 'crit' : a.severity === 'warning' ? 'warn' : 'info'}`}><span className="dot" />{a.severity}</span></td>
                <td>{a.status}</td>
                <td className="mono faint">{a.startsAt ? new Date(a.startsAt).toLocaleString('fr-FR') : '—'}</td>
              </tr>
            )}
          />
        </Panel>

        {nodes && nodes.length > 0 && (
          <Panel title="Hôtes" sub="Charge en direct (nœuds Proxmox)" span={12}>
            <div className="monitoring-host-list">
              {nodes.map((n) => {
                const cpuPct = Math.round((n.cpu || 0) * 100);
                const memPct = Math.round(((n.mem || 0) / (n.maxmem || 1)) * 100);
                return (
                  <div key={n.node} className="monitoring-host-row">
                    <span className="monitoring-host-name">{n.node}</span>
                    <span className={`badge badge-${n.status === 'online' ? 'ok' : 'crit'} monitoring-host-badge`}><span className="dot" />{n.status}</span>
                    <MiniGauge label="CPU" pct={cpuPct} />
                    <MiniGauge label="RAM" pct={memPct} />
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        <Panel title="Tableaux de bord" span={12}>
          <DataTable
            columns={['Titre', 'Dossier', 'Lien']}
            rows={dashboards.data?.items}
            emptyTitle="Aucun tableau de bord"
            renderRow={(d) => (
              <tr key={d.uid}>
                <td className="monitoring-cell-name">{d.title}</td>
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

function MiniGauge({ label, pct }) {
  const color = pct > 85 ? 'var(--tone-crit-dot)' : pct > 65 ? 'var(--tone-warn-dot)' : 'var(--tone-ok-dot)';
  return (
    <div className="monitoring-gauge">
      <span className="faint monitoring-gauge-label">{label}</span>
      <div className="monitoring-gauge-track">
        <div className="monitoring-gauge-fill" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
      <span className="mono monitoring-gauge-value">{pct}%</span>
    </div>
  );
}
