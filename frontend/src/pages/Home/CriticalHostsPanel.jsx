import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import './CriticalHostsPanel.css';

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// "Hôtes critiques" : hôtes marqués importants depuis Infrastructure → Hôtes
// & agents (voir HostsPage.jsx). État = sonde TCP réelle, CPU/RAM/uptime = lecture
// SSH portable (/proc) quand disponible — voir hostMetricsService.js côté backend.
// Réservé aux administrateurs, comme le reste de la gestion des hôtes.
export default function CriticalHostsPanel() {
  const { user } = useAuth();
  const [filter, setFilter] = useState('');
  const { data } = useApi(
    () => (user?.role === 'admin' ? api.get('/hosts/critical') : Promise.resolve(null)),
    [user?.role],
    { pollMs: 15000 }
  );

  if (user?.role !== 'admin') {
    return (
      <Panel title="Hôtes critiques" sub="Nœuds portant des services de production" span={8}>
        <div className="chp-empty">Réservé aux administrateurs</div>
      </Panel>
    );
  }

  const all = data?.items || [];
  const q = normalize(filter.trim());
  const items = q ? all.filter((h) => normalize(`${h.name} ${h.role}`).includes(q)) : all;

  return (
    <Panel
      title="Hôtes critiques"
      sub="Nœuds portant des services de production"
      span={8}
      actions={(
        <div className="chp-actions">
          <input className="input chp-filter-input" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <span className="mono faint chp-count">{items.length} / {all.length}</span>
        </div>
      )}
    >
      {all.length === 0 ? (
        <div className="chp-empty">
          Aucun hôte marqué critique — cochez « Hôte critique » depuis Infrastructure → Hôtes & agents.
        </div>
      ) : (
        <div className="chp-table-wrap">
          <table className="chp-table">
            <thead>
              <tr>
                {['Hôte', 'Rôle', 'État', 'CPU', 'RAM', 'Uptime'].map((c) => (
                  <th key={c} className="chp-th">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((h) => (
                <tr key={h.id} className="chp-row">
                  <td className="chp-td chp-td-name mono">{h.name}</td>
                  <td className="chp-td chp-td-role">{h.role || '—'}</td>
                  <td className="chp-td">
                    {h.reachable === null || h.reachable === undefined ? (
                      <span className="badge badge-mut"><span className="dot" />En attente</span>
                    ) : h.reachable ? (
                      <span className="badge badge-ok"><span className="dot" />En ligne</span>
                    ) : (
                      <span className="badge badge-crit"><span className="dot" />Injoignable</span>
                    )}
                  </td>
                  <td className="chp-td chp-td-stat">
                    <StatBar value={h.cpuPct} />
                  </td>
                  <td className="chp-td chp-td-stat">
                    <StatBar value={h.ramPct} critical />
                  </td>
                  <td className="chp-td mono muted">{formatUptime(h.uptimeSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function StatBar({ value, critical }) {
  if (value === undefined || value === null) return <span className="faint mono chp-stat-empty">—</span>;
  const color = value > 85 ? 'var(--tone-crit-dot)' : value > 65 ? 'var(--tone-warn-dot)' : critical ? '#3B82F6' : '#3B82F6';
  return (
    <div className="chp-stat-bar-row">
      <div className="chp-stat-track">
        <div className="chp-stat-fill" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
      </div>
      <span className="mono chp-stat-value">{value}%</span>
    </div>
  );
}

function formatUptime(seconds) {
  if (seconds === undefined || seconds === null) return '—';
  const days = Math.floor(seconds / 86400);
  if (days > 0) return `${days} j`;
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) return `${hours} h`;
  return `${Math.floor(seconds / 60)} min`;
}
