import { NavLink } from 'react-router-dom';
import { DOMAINS } from '../../config/domains.js';

export default function DomainNav() {
  return (
    <nav style={{ flex: 'none', width: 64, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 0', overflowY: 'auto' }}>
      {DOMAINS.map((d) => (
        <NavLink
          key={d.id}
          to={d.path}
          title={d.label}
          style={({ isActive }) => ({
            width: 44,
            height: 44,
            borderRadius: 11,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            textDecoration: 'none',
            background: isActive ? 'var(--primary-soft)' : 'transparent',
            color: isActive ? 'var(--primary)' : '#475569'
          })}
        >
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.02em' }}>{d.code}</span>
        </NavLink>
      ))}
    </nav>
  );
}
