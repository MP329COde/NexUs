import { NavLink, Outlet } from 'react-router-dom';
import './GroupTabs.css';

const TABS = [
  { to: '/deployments/pipelines', label: 'Pipelines' },
  { to: '/deployments/environments', label: 'Environnements' },
  { to: '/deployments/releases', label: 'Déploiements' }
];

export default function DeliveryLayout() {
  return (
    <>
      <div className="grp-tabs">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) => `grp-tab-link${isActive ? ' grp-tab-link-active' : ''}`}
          >
            <span className="grp-tab-link-label">{t.label}</span>
          </NavLink>
        ))}
      </div>
      <Outlet />
    </>
  );
}
