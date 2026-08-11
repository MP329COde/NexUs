import { NavLink } from 'react-router-dom';
import { DOMAINS } from '../../config/domains.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Icon from '../ui/Icon.jsx';

export default function DomainNav() {
  const { user } = useAuth();
  const visible = DOMAINS.filter((d) => !d.adminOnly || user?.role === 'admin');

  return (
    <nav style={{ flex: 'none', width: 64, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 0', overflowY: 'auto' }}>
      {visible.map((d) => (
        <NavLink
          key={d.id}
          to={d.path}
          title={d.label}
          className="domain-nav-item"
          style={({ isActive }) => ({
            width: 44,
            height: 44,
            borderRadius: 11,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
            textDecoration: 'none',
            background: isActive ? 'var(--primary-soft)' : 'transparent',
            color: isActive ? 'var(--primary)' : 'var(--text-muted)',
            transition: 'all .15s ease'
          })}
        >
          <Icon name={d.id} size={19} strokeWidth={1.7} />
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.02em' }}>{d.code}</span>
        </NavLink>
      ))}
    </nav>
  );
}
