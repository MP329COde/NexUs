import { NavLink, Outlet } from 'react-router-dom';
import './GroupTabs.css';

const TABS = [
  { to: '/deployments/tests', label: 'Tests' },
  { to: '/deployments/iac', label: 'IaC Security' },
  { to: '/deployments/containers', label: 'Conteneurs' },
  { to: '/deployments/images', label: 'Images & registry' },
  { to: '/deployments/secrets', label: 'Secrets' },
  { to: '/deployments/supply-chain', label: 'Supply Chain' }
];

export default function QualitySecurityLayout() {
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
