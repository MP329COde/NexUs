import { Link } from 'react-router-dom';
import Panel from '../../components/ui/Panel.jsx';
import StatusBadge, { toneFromStatus } from '../../components/ui/StatusBadge.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

const DOMAIN_PATH = { k8s: '/kubernetes', dev: '/deployments', net: '/network', inf: '/infrastructure', mon: '/monitoring', sec: '/security' };
const DOMAIN_ICON = { k8s: 'k8s', dev: 'dev', net: 'net', inf: 'inf', mon: 'mon', sec: 'sec' };

// Anciennement affiché sur la page d'accueil, déplacé ici : c'est un doublon
// direct de la configuration ci-dessous (statut en direct de chaque
// intégration), plus à sa place dans Paramètres → Intégrations que sur le
// tableau de bord général.
export default function InfrastructureStatusPanel() {
  const { data, loading } = useApi(() => api.get('/status/overview'), [], { pollMs: 15000 });

  return (
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
  );
}
