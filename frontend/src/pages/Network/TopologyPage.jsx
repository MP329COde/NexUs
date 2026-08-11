import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

// Topologie construite à partir des intégrations réellement configurées
// (voir backend/src/services/networkTopologyService.js) : rien n'est illustré
// tant qu'aucune donnée réelle n'est disponible.
export default function TopologyPage() {
  const { data } = useApi(() => api.get('/network/topology'), [], { pollMs: 20000 });
  const navigate = useNavigate();
  const layers = data?.layers || [];

  return (
    <>
      <PageHeader title="Topologie" sub="Chaîne réseau reconstituée à partir des intégrations configurées : proxies, HAProxy, Traefik, Kubernetes, Proxmox" />

      <Panel span={12}>
        {layers.length === 0 ? (
          <EmptyState title="Aucune donnée à afficher" hint="Configurez au moins un proxy ou une intégration réseau (HAProxy, Traefik, Kubernetes, Proxmox) pour voir apparaître la topologie." />
        ) : (
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, overflowX: 'auto', padding: 20 }}>
            {layers.map((layer, i) => (
              <div key={layer.id} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 220 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 2 }}>{layer.label}</div>
                  {layer.nodes.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => n.linkTo && navigate(n.linkTo)}
                      className="card"
                      style={{ padding: '10px 12px', borderLeft: `3px solid var(--tone-${n.tone || 'mut'}-dot)`, cursor: n.linkTo ? 'pointer' : 'default', animation: 'riseIn .3s ease both' }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{n.label}</div>
                      {n.meta && <div className="mono faint" style={{ fontSize: 11, marginTop: 2 }}>{n.meta}</div>}
                    </div>
                  ))}
                </div>
                {i < layers.length - 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0 18px', color: 'var(--text-faintest)', fontSize: 20 }}>→</div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
