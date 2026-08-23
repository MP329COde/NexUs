import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import TopologyGraph from './TopologyGraph.jsx';
import './NetworkShared.css';

// Topologie construite à partir des intégrations réellement configurées
// (voir backend/src/services/networkTopologyService.js) : rien n'est illustré
// tant qu'aucune donnée réelle n'est disponible.
export default function TopologyPage() {
  const { data } = useApi(() => api.get('/network/topology'), [], { pollMs: 20000 });
  const navigate = useNavigate();
  const [view, setView] = useState('graph');
  const layers = data?.layers || [];
  const graph = data?.graph || { nodes: [], edges: [] };
  const hasData = layers.length > 0 || graph.nodes.length > 0;

  return (
    <>
      <PageHeader
        title="Topologie"
        sub="Chaîne réseau reconstituée à partir des intégrations configurées : proxies, HAProxy, Traefik, Kubernetes, Argo CD, Proxmox"
        actions={hasData && (
          <div className="topo-view-toggle">
            <span className={`btn-outline net-action-btn${view === 'graph' ? ' topo-view-active' : ''}`} onClick={() => setView('graph')}>Graphique</span>
            <span className={`btn-outline net-action-btn${view === 'list' ? ' topo-view-active' : ''}`} onClick={() => setView('list')}>Liste</span>
          </div>
        )}
      />

      <Panel span={12}>
        {!hasData ? (
          <EmptyState title="Aucune donnée à afficher" hint="Configurez au moins un proxy ou une intégration réseau (HAProxy, Traefik, Kubernetes, Argo CD, Proxmox) pour voir apparaître la topologie." />
        ) : view === 'graph' ? (
          <TopologyGraph graph={graph} />
        ) : (
          <div className="topo-scroll">
            {layers.map((layer, i) => (
              <div key={layer.id} className="topo-layer">
                <div className="topo-layer-nodes">
                  <div className="topo-layer-label">{layer.label}</div>
                  {layer.nodes.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => n.linkTo && navigate(n.linkTo)}
                      className={`card topo-node${n.linkTo ? ' topo-node-clickable' : ''}`}
                      style={{ borderLeft: `3px solid var(--tone-${n.tone || 'mut'}-dot)` }}
                    >
                      <div className="topo-node-label">{n.label}</div>
                      {n.meta && <div className="mono faint topo-node-meta">{n.meta}</div>}
                    </div>
                  ))}
                </div>
                {i < layers.length - 1 && <div className="topo-arrow">→</div>}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
