import { NavLink, Outlet } from 'react-router-dom';
import Icon from '../../components/ui/Icon.jsx';
import './NetworkLayout.css';

// Barre latérale propre à Réseaux : elle vit dans ce layout et ne doit pas
// être mutualisée avec les autres domaines, chacun définit la sienne.
const ITEMS = [
  { to: '/network', label: 'Topologie', icon: 'layers', end: true },
  { to: '/network/proxies', label: 'Proxies & domaines', icon: 'globe' },
  { to: '/network/services', label: 'Réseaux internes', icon: 'net' },
  { to: '/network/haproxy', label: 'HAProxy', icon: 'server' },
  { to: '/network/haproxy/config', label: 'Éditeur HAProxy', icon: 'edit' },
  { to: '/network/certificates', label: 'Certificats', icon: 'lock' },
  { to: '/network/firewall', label: 'Pare-feu', icon: 'shield' }
];

export default function NetworkLayout() {
  return (
    <div className="network-layout">
      <nav className="network-layout-nav">
        {ITEMS.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) => `network-layout-nav-link${isActive ? ' network-layout-nav-link-active' : ''}`}
          >
            <Icon name={it.icon} size={16} strokeWidth={1.7} />
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="network-layout-content">
        <Outlet />
      </div>
    </div>
  );
}
