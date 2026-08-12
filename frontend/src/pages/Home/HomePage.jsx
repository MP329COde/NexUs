import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import StatusBadge, { toneFromStatus } from '../../components/ui/StatusBadge.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';

const DOMAIN_PATH = { k8s: '/kubernetes', dev: '/deployments', net: '/network', inf: '/infrastructure', mon: '/monitoring', sec: '/security' };
const DOMAIN_ICON = { k8s: 'k8s', dev: 'dev', net: 'net', inf: 'inf', mon: 'mon', sec: 'sec' };
const ACTION_LABELS = {
  'auth.login': 'Connexion', 'user.create': 'Utilisateur créé', 'user.update': 'Utilisateur modifié',
  'proxy.create': 'Proxy créé', 'proxy.apply': 'Proxy appliqué', 'host.agent.install': 'Agent installé',
  'settings.integration.save': 'Intégration configurée', 'backup.create': 'Sauvegarde créée',
  'backup.restore': 'Base restaurée', 'group.create': 'Groupe créé', 'inventory.create': 'Actif ajouté'
};

export default function HomePage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(() => api.get('/status/overview'), [], { pollMs: 15000 });
  const [spinning, setSpinning] = useState(false);
  const [alerts, setAlerts] = useState(null);
  const audit = useApi(() => (user?.role === 'admin' ? api.get('/audit?limit=6') : Promise.resolve(null)), [user?.role]);

  const configuredCount = data?.integrations.filter((i) => i.configured).length ?? 0;
  const okCount = data?.integrations.filter((i) => i.ok).length ?? 0;
  const warnCount = data?.integrations.filter((i) => i.configured && !i.ok).length ?? 0;
  const notConfiguredCount = (data?.integrations.length ?? 0) - configuredCount;

  useEffect(() => {
    let cancelled = false;
    async function loadAlerts() {
      const results = await Promise.allSettled([api.get('/grafana/alerts'), api.get('/wazuh/summary')]);
      if (cancelled) return;
      const grafanaAlerts = results[0].status === 'fulfilled' ? (results[0].value.items || []) : [];
      const wazuhDisconnected = results[1].status === 'fulfilled' ? (results[1].value.summary?.disconnected || 0) : 0;
      setAlerts({ grafanaAlerts, wazuhDisconnected });
    }
    loadAlerts();
    const id = setInterval(loadAlerts, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  async function onRefresh() {
    setSpinning(true);
    await reload();
    setTimeout(() => setSpinning(false), 400);
  }

  const totalAlerts = (alerts?.grafanaAlerts.length ?? 0) + (alerts?.wazuhDisconnected ?? 0);

  return (
    <>
      <PageHeader
        title="Vue générale"
        sub="État global de l'infrastructure : Kubernetes, Argo CD, HAProxy, GitLab, Proxmox, Traefik, Cert-Manager et Grafana."
        actions={(
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/report" className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
              <Icon name="externalLink" size={14} />Rapport
            </Link>
            <button className="btn-outline" onClick={onRefresh} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Icon name="refresh" size={14} className={spinning ? 'spin' : ''} />Actualiser
            </button>
          </div>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(215px,1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard label="Santé globale" value={data ? `${data.score}` : '—'} unit="%" tint="#3B82F6" note="pondérée sur les intégrations configurées" />
        <KpiCard label="Intégrations configurées" value={configuredCount} unit={`/ ${data?.integrations.length ?? 10}`} tint="#8B5CF6" />
        <KpiCard label="Alertes actives" value={alerts ? totalAlerts : '—'} tint={totalAlerts > 0 ? '#F43F5E' : '#10B981'} note="Grafana + agents Wazuh déconnectés" />
        <KpiCard label="Dernière actualisation" value={data ? new Date(data.generatedAt).toLocaleTimeString('fr-FR') : '—'} tint="#F59E0B" />
      </div>

      {error && <div className="card" style={{ padding: 14, marginBottom: 16, color: 'var(--tone-crit-fg)', fontSize: 13 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16, marginBottom: 16 }}>
        <Panel title="Répartition des intégrations" sub="Par état actuel" span={4}>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', marginBottom: 14 }}>
              {okCount > 0 && <div style={{ flex: okCount, background: 'var(--tone-ok-dot)' }} />}
              {warnCount > 0 && <div style={{ flex: warnCount, background: 'var(--tone-crit-dot)' }} />}
              {notConfiguredCount > 0 && <div style={{ flex: notConfiguredCount, background: 'var(--tone-mut-dot)' }} />}
            </div>
            <LegendRow color="var(--tone-ok-dot)" label="Opérationnelles" value={okCount} />
            <LegendRow color="var(--tone-crit-dot)" label="En erreur" value={warnCount} />
            <LegendRow color="var(--tone-mut-dot)" label="Non configurées" value={notConfiguredCount} />
          </div>
        </Panel>

        <Panel title="Alertes actives" sub="Grafana et Cybersécurité" span={4}>
          {!alerts ? (
            <div style={{ padding: 20, fontSize: 12.5, color: 'var(--text-faint)' }}>Chargement…</div>
          ) : totalAlerts === 0 ? (
            <div style={{ padding: 20, fontSize: 12.5, color: 'var(--text-faint)', textAlign: 'center' }}>Aucune alerte active</div>
          ) : (
            <div style={{ padding: 6 }}>
              {alerts.grafanaAlerts.slice(0, 4).map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px' }}>
                  <Icon name="alertTriangle" size={13} style={{ color: 'var(--tone-warn-fg)', flex: 'none' }} />
                  <span style={{ fontSize: 12.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name || a.title}</span>
                </div>
              ))}
              {alerts.wazuhDisconnected > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px' }}>
                  <Icon name="shield" size={13} style={{ color: 'var(--tone-crit-fg)', flex: 'none' }} />
                  <span style={{ fontSize: 12.5 }}>{alerts.wazuhDisconnected} agent(s) Wazuh déconnecté(s)</span>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Activité récente" sub="Dernières actions administratives" span={4}>
          {user?.role !== 'admin' ? (
            <div style={{ padding: 20, fontSize: 12.5, color: 'var(--text-faint)', textAlign: 'center' }}>Réservé aux administrateurs</div>
          ) : !audit.data?.items.length ? (
            <div style={{ padding: 20, fontSize: 12.5, color: 'var(--text-faint)', textAlign: 'center' }}>Aucune action récente</div>
          ) : (
            <div style={{ padding: 6 }}>
              {audit.data.items.map((e) => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--primary)', flex: 'none' }} />
                  <span style={{ fontSize: 12.5, flex: 1 }}>{ACTION_LABELS[e.action] || e.action}</span>
                  <span className="mono faint" style={{ fontSize: 10.5 }}>{new Date(e.at).toLocaleTimeString('fr-FR')}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Intégrations d'infrastructure" sub="Cliquez sur un domaine pour gérer le service correspondant" span={12}>
        {loading && !data ? (
          <div style={{ padding: 20, fontSize: 13, color: 'var(--text-faint)' }}>Chargement…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data?.integrations.map((entry) => (
              <Link
                key={entry.key}
                to={DOMAIN_PATH[entry.domain] || '/settings'}
                className="home-integration-row"
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderBottom: '1px solid var(--border-soft)', textDecoration: 'none', color: 'inherit' }}
              >
                <span style={{ color: 'var(--text-faint)', flex: 'none' }}><Icon name={DOMAIN_ICON[entry.domain] || 'server'} size={16} /></span>
                <span style={{ fontSize: 13.5, fontWeight: 500, width: 160 }}>{entry.label}</span>
                <StatusBadge tone={toneFromStatus(entry)} label={entry.configured ? (entry.ok ? 'Opérationnel' : 'Erreur') : 'Non configuré'} />
                <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-faint)' }}>{entry.message}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-faintest)' }}>{entry.latencyMs} ms</span>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

function LegendRow({ color, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12.5 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flex: 'none' }} />
      <span style={{ flex: 1, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
