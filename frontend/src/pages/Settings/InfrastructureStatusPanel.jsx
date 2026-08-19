import { Link } from 'react-router-dom';
import Panel from '../../components/ui/Panel.jsx';
import StatusBadge, { toneFromStatus } from '../../components/ui/StatusBadge.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import './InfrastructureStatusPanel.css';

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
        <div className="infra-status-loading">Chargement…</div>
      ) : (
        <div className="infra-status-list">
          {data?.integrations.map((entry) => (
            <Link
              key={entry.key}
              to={DOMAIN_PATH[entry.domain] || '/settings'}
              className="home-integration-row infra-status-row"
            >
              <span className="infra-status-icon"><Icon name={DOMAIN_ICON[entry.domain] || 'server'} size={16} /></span>
              <span className="infra-status-label">{entry.label}</span>
              <StatusBadge tone={toneFromStatus(entry)} label={entry.configured ? (entry.ok ? 'Opérationnel' : 'Erreur') : 'Non configuré'} />
              <span className="infra-status-message" title={entry.message}>{entry.message}</span>
              <span className="mono infra-status-latency">{entry.latencyMs} ms</span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}
