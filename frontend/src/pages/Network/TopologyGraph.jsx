import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './TopologyGraph.css';

const GROUP_LABELS = {
  network: 'Réseau',
  kubernetes: 'Kubernetes',
  proxmox: 'Proxmox'
};

const COL_WIDTH = 230;
const ROW_HEIGHT = 74;
const GROUP_GAP = 60;

// Nœud custom : deux handles (haut/bas) pour un layout vertical par groupe,
// couleur de bordure dérivée du `tone` déjà calculé côté backend (jamais
// recalculée ici, pour ne jamais diverger du vrai statut).
function TopoNode({ data }) {
  return (
    <div className={`rf-topo-node rf-topo-tone-${data.tone || 'mut'}${data.dimmed ? ' rf-topo-dimmed' : ''}${data.highlighted ? ' rf-topo-highlighted' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="rf-topo-node-label">{data.label}</div>
      {data.meta && <div className="rf-topo-node-meta">{data.meta}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { topo: TopoNode };

// Layout déterministe simple : une colonne par groupe d'infrastructure
// (regroupement visuel demandé), les nœuds d'un groupe empilés verticalement
// dans leur ordre d'arrivée. Pas de librairie de layout automatique — le
// graphe reste petit (dizaines de nœuds), un placement en grille suffit et
// reste stable d'un rafraîchissement à l'autre (mêmes ids → mêmes positions).
function layoutNodes(graphNodes) {
  const groups = [];
  const byGroup = new Map();
  for (const n of graphNodes) {
    const g = n.group || 'autre';
    if (!byGroup.has(g)) {
      byGroup.set(g, []);
      groups.push(g);
    }
    byGroup.get(g).push(n);
  }

  const positioned = [];
  groups.forEach((g, gi) => {
    const x = gi * (COL_WIDTH + GROUP_GAP);
    byGroup.get(g).forEach((n, ni) => {
      positioned.push({ ...n, x, y: ni * ROW_HEIGHT });
    });
  });
  return { positioned, groups, byGroup };
}

function GraphInner({ graph, filters, search, onSelect }) {
  const { fitView } = useReactFlow();

  const visibleGraphNodes = useMemo(
    () => graph.nodes.filter((n) => filters[n.group] !== false),
    [graph.nodes, filters]
  );
  const visibleIds = useMemo(() => new Set(visibleGraphNodes.map((n) => n.id)), [visibleGraphNodes]);
  const visibleEdges = useMemo(
    () => graph.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)),
    [graph.edges, visibleIds]
  );

  const matchesSearch = useCallback((n) => {
    if (!search.trim()) return false;
    const q = search.trim().toLowerCase();
    return n.label?.toLowerCase().includes(q) || n.meta?.toLowerCase().includes(q) || n.type?.toLowerCase().includes(q);
  }, [search]);

  const { positioned } = useMemo(() => layoutNodes(visibleGraphNodes), [visibleGraphNodes]);

  const rfNodes = useMemo(() => positioned.map((n) => ({
    id: n.id,
    type: 'topo',
    position: { x: n.x, y: n.y },
    data: {
      label: n.label,
      meta: n.meta,
      tone: n.tone,
      dimmed: Boolean(search.trim()) && !matchesSearch(n),
      highlighted: matchesSearch(n)
    },
    draggable: true
  })), [positioned, search, matchesSearch]);

  const rfEdges = useMemo(() => visibleEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: false,
    style: { stroke: 'var(--border)', opacity: 0.75 }
  })), [visibleEdges]);

  const handleNodeClick = useCallback((_evt, node) => {
    const original = graph.nodes.find((n) => n.id === node.id);
    if (original) onSelect(original);
  }, [graph.nodes, onSelect]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      fitView
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable className="rf-topo-minimap" />
    </ReactFlow>
  );
}

// Graphe interactif de la topologie (zoom, déplacement, recherche, filtrage
// par groupe d'infrastructure) — remplace le rendu SVG fait main du Lot 44
// par un vrai graphe (react-flow) capable de gérer des relations non
// linéaires (VM → hôte, pod → nœud K8s, Argo CD → cluster...), pas seulement
// un chaînage couche→couche.
export default function TopologyGraph({ graph }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const availableGroups = useMemo(() => {
    const set = new Set(graph.nodes.map((n) => n.group).filter(Boolean));
    return [...set];
  }, [graph.nodes]);

  const [filters, setFilters] = useState({});
  const isVisible = (g) => filters[g] !== false;
  const toggleGroup = (g) => setFilters((f) => ({ ...f, [g]: !isVisible(g) }));

  if (!graph.nodes.length) return null;

  return (
    <div className="rf-topo-wrap">
      <div className="rf-topo-toolbar">
        <input
          className="rf-topo-search"
          type="search"
          placeholder="Rechercher un nœud (nom, type)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="rf-topo-filters">
          {availableGroups.map((g) => (
            <button
              key={g}
              type="button"
              className={`btn-outline net-action-btn rf-topo-filter-btn${isVisible(g) ? ' topo-view-active' : ''}`}
              onClick={() => toggleGroup(g)}
            >
              {GROUP_LABELS[g] || g}
            </button>
          ))}
        </div>
      </div>

      <div className="rf-topo-canvas">
        <ReactFlowProvider>
          <GraphInner graph={graph} filters={filters} search={search} onSelect={setSelected} />
        </ReactFlowProvider>
      </div>

      {selected && (
        <div className="rf-topo-detail-backdrop" onClick={() => setSelected(null)}>
          <div className="rf-topo-detail card" onClick={(e) => e.stopPropagation()}>
            <div className="rf-topo-detail-header">
              <div className="rf-topo-detail-title">{selected.label}</div>
              <button type="button" className="btn-outline net-action-btn" onClick={() => setSelected(null)}>Fermer</button>
            </div>
            {selected.type && <div className="mono faint">{selected.type}</div>}
            {selected.meta && <div className="rf-topo-detail-meta">{selected.meta}</div>}
            {selected.namespace && <div className="faint">Namespace : {selected.namespace}</div>}
            {selected.engine && <div className="faint">Moteur : {selected.engine}</div>}
            <div className="faint" style={{ marginTop: 6 }}>Statut : {selected.tone || 'inconnu'}</div>
            {selected.linkTo && (
              <button
                type="button"
                className="btn-primary rf-topo-detail-link"
                onClick={() => navigate(selected.linkTo)}
              >
                Ouvrir dans l'outil concerné →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
