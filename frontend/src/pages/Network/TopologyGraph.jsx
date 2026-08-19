import { useNavigate } from 'react-router-dom';

const COL_WIDTH = 260;
const NODE_HEIGHT = 46;
const NODE_GAP = 14;
const NODE_WIDTH = 210;
const TOP_PADDING = 40;
const LABEL_HEIGHT = 26;

// Rendu SVG fait main (pas de dépendance graphe) : une colonne par couche,
// un nœud par élément réel renvoyé par networkTopologyService.js. Les arêtes
// relient chaque nœud d'une couche à tous les nœuds de la couche suivante —
// c'est la même relation de chaînage qui était déjà représentée par les
// flèches "→" de la vue liste, pas une relation de routage précise inventée.
export default function TopologyGraph({ layers }) {
  const navigate = useNavigate();
  if (!layers.length) return null;

  const maxNodes = Math.max(...layers.map((l) => l.nodes.length));
  const width = layers.length * COL_WIDTH;
  const height = TOP_PADDING + LABEL_HEIGHT + maxNodes * (NODE_HEIGHT + NODE_GAP);

  const positions = layers.map((layer, li) => {
    const x = li * COL_WIDTH + (COL_WIDTH - NODE_WIDTH) / 2;
    return layer.nodes.map((n, ni) => ({
      node: n,
      x,
      y: TOP_PADDING + LABEL_HEIGHT + ni * (NODE_HEIGHT + NODE_GAP)
    }));
  });

  const edges = [];
  for (let li = 0; li < positions.length - 1; li++) {
    for (const from of positions[li]) {
      for (const to of positions[li + 1]) {
        edges.push({ from, to, key: `${from.node.id}->${to.node.id}` });
      }
    }
  }

  return (
    <div className="topo-graph-scroll">
      <svg width={width} height={height} className="topo-graph-svg">
        {edges.map((e) => {
          const x1 = e.from.x + NODE_WIDTH;
          const y1 = e.from.y + NODE_HEIGHT / 2;
          const x2 = e.to.x;
          const y2 = e.to.y + NODE_HEIGHT / 2;
          const mx = (x1 + x2) / 2;
          return (
            <path
              key={e.key}
              d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
              className="topo-graph-edge"
            />
          );
        })}

        {layers.map((layer, li) => (
          <text key={layer.id} x={li * COL_WIDTH + COL_WIDTH / 2} y={20} textAnchor="middle" className="topo-graph-layer-label">
            {layer.label}
          </text>
        ))}

        {positions.flat().map(({ node, x, y }) => (
          <g
            key={node.id}
            transform={`translate(${x},${y})`}
            className={node.linkTo ? 'topo-graph-node topo-graph-node-clickable' : 'topo-graph-node'}
            onClick={() => node.linkTo && navigate(node.linkTo)}
          >
            <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx={8} className={`topo-graph-rect topo-graph-tone-${node.tone || 'mut'}`} />
            <text x={12} y={19} className="topo-graph-node-label">{truncate(node.label, 26)}</text>
            {node.meta && <text x={12} y={35} className="topo-graph-node-meta">{truncate(node.meta, 32)}</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}
