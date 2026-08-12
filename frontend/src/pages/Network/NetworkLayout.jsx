import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/network', label: 'Topologie', end: true },
  { to: '/network/proxies', label: 'Proxies & domaines' },
  { to: '/network/haproxy', label: 'HAProxy' },
  { to: '/network/certificates', label: 'Certificats' }
];

export default function NetworkLayout() {
  return (
    <>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            style={({ isActive }) => ({
              padding: '9px 4px',
              marginBottom: -1,
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
              textDecoration: 'none'
            })}
          >
            <span style={{ padding: '0 8px' }}>{t.label}</span>
          </NavLink>
        ))}
      </div>
      <Outlet />
    </>
  );
}
