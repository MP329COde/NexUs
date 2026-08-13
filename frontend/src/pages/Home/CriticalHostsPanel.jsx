import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';

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
        <div style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Réservé aux administrateurs</div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input className="input" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ height: 28, fontSize: 12, width: 140 }} />
          <span className="mono faint" style={{ fontSize: 11.5, flex: 'none' }}>{items.length} / {all.length}</span>
        </div>
      )}
    >
      {all.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>
          Aucun hôte marqué critique — cochez « Hôte critique » depuis Infrastructure → Hôtes & agents.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                {['Hôte', 'Rôle', 'État', 'CPU', 'RAM', 'Uptime'].map((c) => (
                  <th key={c} style={{ textAlign: 'left', padding: '8px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-soft)' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((h) => (
                <tr key={h.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600 }} className="mono">{h.name}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{h.role || '—'}</td>
                  <td style={{ padding: '10px 16px' }}>
                    {h.reachable === null || h.reachable === undefined ? (
                      <span className="badge badge-mut"><span className="dot" />En attente</span>
                    ) : h.reachable ? (
                      <span className="badge badge-ok"><span className="dot" />En ligne</span>
                    ) : (
                      <span className="badge badge-crit"><span className="dot" />Injoignable</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 16px', width: 140 }}>
                    <StatBar value={h.cpuPct} />
                  </td>
                  <td style={{ padding: '10px 16px', width: 140 }}>
                    <StatBar value={h.ramPct} critical />
                  </td>
                  <td style={{ padding: '10px 16px' }} className="mono muted">{formatUptime(h.uptimeSeconds)}</td>
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
  if (value === undefined || value === null) return <span className="faint mono" style={{ fontSize: 11.5 }}>—</span>;
  const color = value > 85 ? 'var(--tone-crit-dot)' : value > 65 ? 'var(--tone-warn-dot)' : critical ? '#3B82F6' : '#3B82F6';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 999, background: 'var(--border-soft)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', borderRadius: 999, background: color }} />
      </div>
      <span className="mono" style={{ fontSize: 11.5, width: 30, textAlign: 'right' }}>{value}%</span>
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
