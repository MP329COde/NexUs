import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import StatusBadge, { toneFromStatus } from '../../components/ui/StatusBadge.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

const DOMAIN_PATH = { k8s: '/kubernetes', dev: '/deployments', net: '/network', inf: '/infrastructure', mon: '/monitoring', sec: '/security' };
const DOMAIN_ICON = { k8s: 'k8s', dev: 'dev', net: 'net', inf: 'inf', mon: 'mon', sec: 'sec' };

export default function HomePage() {
  const { data, loading, error, reload } = useApi(() => api.get('/status/overview'), [], { pollMs: 15000 });
  const [spinning, setSpinning] = useState(false);

  const configuredCount = data?.integrations.filter((i) => i.configured).length ?? 0;
  const okCount = data?.integrations.filter((i) => i.ok).length ?? 0;

  async function onRefresh() {
    setSpinning(true);
    await reload();
    setTimeout(() => setSpinning(false), 400);
  }

  return (
    <>
      <PageHeader
        title="Vue générale"
        sub="État global de l'infrastructure : Kubernetes, Argo CD, HAProxy, GitLab, Proxmox, Traefik, Cert-Manager et Grafana."
        actions={(
          <button className="btn-outline" onClick={onRefresh} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="refresh" size={14} className={spinning ? 'spin' : ''} />Actualiser
          </button>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(215px,1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard label="Santé globale" value={data ? `${data.score}` : '—'} unit="%" tint="#3B82F6" note="pondérée sur les intégrations configurées" />
        <KpiCard label="Intégrations configurées" value={configuredCount} unit={`/ ${data?.integrations.length ?? 8}`} tint="#8B5CF6" />
        <KpiCard label="Intégrations en bonne santé" value={okCount} unit={`/ ${configuredCount}`} tint="#10B981" />
        <KpiCard label="Dernière actualisation" value={data ? new Date(data.generatedAt).toLocaleTimeString('fr-FR') : '—'} tint="#F59E0B" />
      </div>

      {error && <div className="card" style={{ padding: 14, marginBottom: 16, color: 'var(--tone-crit-fg)', fontSize: 13 }}>{error}</div>}

      <Panel title="Intégrations d'infrastructure" sub="Cliquez sur un domaine pour gérer le service correspondant" span={12}>
        {loading && !data ? (
          <div style={{ padding: 20, fontSize: 13, color: 'var(--text-faint)' }}>Chargement…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data?.integrations.map((entry) => (
              <Link
                key={entry.key}
                to={DOMAIN_PATH[entry.domain] || '/settings'}
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
