import { NavLink, Outlet } from 'react-router-dom';
import Icon from '../../components/ui/Icon.jsx';
import './KubernetesLayout.css';

// Barre latérale propre à Kubernetes : elle vit dans ce layout et ne doit pas
// être mutualisée avec les autres domaines, chacun définit la sienne.
const ITEMS = [
  { to: '/kubernetes', label: 'Charges de travail', icon: 'box', end: true },
  { to: '/kubernetes/services', label: 'Services', icon: 'net' },
  { to: '/kubernetes/terminal', label: 'Terminal sécurisé', icon: 'terminal' }
];

export default function KubernetesLayout() {
  return (
    <div className="k8s-layout">
      <nav className="k8s-layout-nav">
        {ITEMS.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) => `k8s-layout-nav-link${isActive ? ' k8s-layout-nav-link-active' : ''}`}
          >
            <Icon name={it.icon} size={16} strokeWidth={1.7} />
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="k8s-layout-content">
        <Outlet />
      </div>
    </div>
  );
}
