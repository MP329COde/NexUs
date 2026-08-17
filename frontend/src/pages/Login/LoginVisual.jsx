import Icon from '../../components/ui/Icon.jsx';
import BrandMark from '../../components/ui/BrandMark.jsx';
import './LoginVisual.css';

// Panneau décoratif de la page de connexion : toujours sur fond sombre
// (indépendant du thème clair/sombre choisi par l'utilisateur, comme un
// panneau de marque), avec des formes animées en CSS pur (aucune dépendance
// supplémentaire) pour donner une impression de console "vivante".
const NODES = [
  { icon: 'k8s', label: 'Kubernetes', top: '10%', left: '18%', delay: '0s' },
  { icon: 'net', label: 'Réseaux', top: '22%', left: '68%', delay: '.6s' },
  { icon: 'dev', label: 'Développement', top: '42%', left: '10%', delay: '1.1s' },
  { icon: 'inf', label: 'Infrastructure', top: '48%', left: '64%', delay: '.3s' },
  { icon: 'sec', label: 'Sécurité', top: '6%', left: '46%', delay: '.9s' },
  { icon: 'mon', label: 'Monitoring', top: '34%', left: '38%', delay: '1.4s' }
];

export default function LoginVisual() {
  return (
    <div className="lv-root">
      <div className="lv-grid" />

      <div className="lv-blob-a" />
      <div className="lv-blob-b" />

      {NODES.map((n) => (
        <div
          key={n.label}
          className="lv-node"
          style={{ top: n.top, left: n.left, animationDelay: n.delay }}
        >
          <span className="lv-node-icon"><Icon name={n.icon} size={15} /></span>
          <span className="lv-node-label">{n.label}</span>
        </div>
      ))}

      <div className="lv-overlay">
        <BrandMark size={40} style={{ marginBottom: 18 }} />
        <h1 className="lv-title">
          Le centre de contrôle de votre infrastructure
        </h1>
        <p className="lv-desc">
          Kubernetes, Argo CD, HAProxy, Traefik, GitLab, GitHub, Proxmox, Wazuh et Grafana, réunis dans une seule console.
        </p>
      </div>
    </div>
  );
}
