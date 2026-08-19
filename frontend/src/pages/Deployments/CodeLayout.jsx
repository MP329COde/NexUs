import { NavLink, Outlet } from 'react-router-dom';
import './GroupTabs.css';

const TABS = [
  { to: '/deployments/repos', label: 'Dépôts' },
  { to: '/deployments/reviews', label: 'Revues' }
];

export default function CodeLayout() {
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
