import { NavLink, Outlet } from 'react-router-dom';
import './InfrastructureShared.css';

const TABS = [
  { to: '/infrastructure', label: 'Proxmox', end: true },
  { to: '/infrastructure/hosts', label: 'Hôtes & agents' }
];

export default function InfrastructureLayout() {
  return (
    <>
      <div className="infra-tabs">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `infra-tab-link${isActive ? ' infra-tab-link-active' : ''}`}
          >
            <span className="infra-tab-link-label">{t.label}</span>
          </NavLink>
        ))}
      </div>
      <Outlet />
    </>
  );
}
