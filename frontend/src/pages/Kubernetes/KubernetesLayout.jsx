import { NavLink, Outlet } from 'react-router-dom';
import Icon from '../../components/ui/Icon.jsx';

// Barre latérale propre à Kubernetes : elle vit dans ce layout et ne doit pas
// être mutualisée avec les autres domaines, chacun définit la sienne.
const ITEMS = [
  { to: '/kubernetes', label: 'Charges de travail', icon: 'box', end: true },
  { to: '/kubernetes/services', label: 'Services', icon: 'net' }
];

export default function KubernetesLayout() {
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      <nav style={{ flex: 'none', width: 190, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {ITEMS.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 11px',
              borderRadius: 9,
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              textDecoration: 'none',
              color: isActive ? 'var(--primary)' : 'var(--text-muted)',
              background: isActive ? 'var(--primary-soft)' : 'transparent'
            })}
          >
            <Icon name={it.icon} size={16} strokeWidth={1.7} />
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Outlet />
      </div>
    </div>
  );
}
