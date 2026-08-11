import Icon from '../../components/ui/Icon.jsx';

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
    <div style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden', background: 'radial-gradient(circle at 30% 20%, #16213f 0%, #0B1120 60%)' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: .5, backgroundImage: 'linear-gradient(rgba(148,163,184,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.08) 1px, transparent 1px)', backgroundSize: '40px 40px', animation: 'gridDrift 6s linear infinite' }} />

      <div style={{ position: 'absolute', width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,.35), transparent 70%)', top: '-80px', left: '-60px', animation: 'blobA 14s ease-in-out infinite', filter: 'blur(10px)' }} />
      <div style={{ position: 'absolute', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,.3), transparent 70%)', bottom: '-60px', right: '-40px', animation: 'blobB 16s ease-in-out infinite', filter: 'blur(10px)' }} />

      {NODES.map((n) => (
        <div
          key={n.label}
          style={{ position: 'absolute', top: n.top, left: n.left, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(18,26,44,.75)', border: '1px solid rgba(148,163,184,.18)', backdropFilter: 'blur(6px)', animation: `floatY 5s ease-in-out infinite`, animationDelay: n.delay }}
        >
          <span style={{ color: '#60A5FA' }}><Icon name={n.icon} size={15} /></span>
          <span style={{ fontSize: 11.5, color: '#CBD5E1', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>{n.label}</span>
        </div>
      ))}

      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 56px 64px', background: 'linear-gradient(180deg, transparent 40%, rgba(11,17,32,.85) 90%)' }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 17, marginBottom: 18 }}>N</div>
        <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 600, letterSpacing: '-.02em', margin: 0, lineHeight: 1.25, maxWidth: 380 }}>
          Le centre de contrôle de votre infrastructure
        </h1>
        <p style={{ color: '#94A3B8', fontSize: 13.5, marginTop: 10, maxWidth: 360, lineHeight: 1.5 }}>
          Kubernetes, Argo CD, HAProxy, Traefik, GitLab, GitHub, Proxmox, Wazuh et Grafana, réunis dans une seule console.
        </p>
      </div>
    </div>
  );
}
