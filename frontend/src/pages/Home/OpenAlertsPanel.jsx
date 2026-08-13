import { useEffect, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { api } from '../../lib/apiClient.js';

const SEVERITY_MAP = {
  critical: 'P1', crit: 'P1', p1: 'P1', high: 'P1',
  warning: 'P2', warn: 'P2', p2: 'P2', medium: 'P2',
  info: 'P3', p3: 'P3', low: 'P3'
};
const TIER_COLOR = { P1: 'var(--tone-crit-dot)', P2: 'var(--tone-warn-dot)', P3: 'var(--tone-mut-dot)' };

function tierFor(severity) {
  return SEVERITY_MAP[(severity || '').toLowerCase()] || 'P2';
}

// "Alertes ouvertes" : alertes Grafana (sévérité tirée du label Alertmanager,
// texte libre côté utilisateur — voir grafanaService.listAlerts) et agents
// Wazuh déconnectés (classés P2, une déconnexion n'est pas nécessairement
// critique), triées par sévérité.
export default function OpenAlertsPanel() {
  const [alerts, setAlerts] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const results = await Promise.allSettled([api.get('/grafana/alerts'), api.get('/wazuh/summary')]);
      if (cancelled) return;
      const grafana = results[0].status === 'fulfilled' ? (results[0].value.items || []) : [];
      const wazuhDisconnected = results[1].status === 'fulfilled' ? (results[1].value.summary?.disconnected || 0) : 0;
      setAlerts({ grafana, wazuhDisconnected });
    }
    load();
    const id = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!alerts) {
    return (
      <Panel title="Alertes ouvertes" sub="Triées par sévérité" span={6}>
        <div style={{ padding: 20, fontSize: 12.5, color: 'var(--text-faint)' }}>Chargement…</div>
      </Panel>
    );
  }

  const items = [
    ...alerts.grafana.map((a) => ({ id: a.name + a.startsAt, title: a.name || a.title, sub: a.startsAt ? `déclenchée ${relativeTime(a.startsAt)}` : '', tier: tierFor(a.severity) })),
    ...(alerts.wazuhDisconnected > 0 ? [{ id: 'wazuh-disc', title: `${alerts.wazuhDisconnected} agent(s) Wazuh déconnecté(s)`, sub: 'cybersécurité', tier: 'P2' }] : [])
  ].sort((a, b) => a.tier.localeCompare(b.tier));

  return (
    <Panel title="Alertes ouvertes" sub="Triées par sévérité" span={6}>
      {items.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Aucune alerte ouverte</div>
      ) : (
        <div style={{ padding: 6 }}>
          {items.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid var(--border-soft)' }}>
              <Icon name="alertTriangle" size={14} style={{ color: TIER_COLOR[a.tier], flex: 'none' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                {a.sub && <div className="faint" style={{ fontSize: 10.5, marginTop: 1 }}>{a.sub}</div>}
              </div>
              <span
                className="mono"
                style={{ flex: 'none', fontSize: 10.5, fontWeight: 700, color: '#fff', background: TIER_COLOR[a.tier], borderRadius: 5, padding: '2px 7px' }}
              >
                {a.tier}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}
