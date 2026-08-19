import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import './DeploymentsLayout.css';

const COLLAPSE_KEY = 'nexus-dev-nav-collapsed';

const GROUPS = [
  {
    label: 'Aperçu',
    items: [{ to: '/deployments/my-work', label: 'Mon travail', icon: 'users' }]
  },
  {
    label: 'Catalogue',
    items: [{ to: '/deployments/catalog', label: 'Catalogue', icon: 'box' }]
  },
  {
    label: 'Projets',
    items: [
      { to: '/deployments/projects', label: 'Projets', icon: 'layers' },
      { to: '/deployments/organizations', label: 'Organisations', icon: 'users' }
    ]
  },
  {
    label: 'Code',
    items: [{ to: '/deployments/repos', label: 'Code', icon: 'gitBranch' }]
  },
  {
    label: 'Livraison',
    items: [{ to: '/deployments/pipelines', label: 'Livraison', icon: 'sync' }]
  },
  {
    label: 'Qualité & sécurité',
    items: [{ to: '/deployments/tests', label: 'Qualité & sécurité', icon: 'flask' }]
  },
  {
    label: 'Outils',
    items: [{ to: '/deployments', label: 'Outils', icon: 'globe', end: true }]
  }
];

export default function DeploymentsLayout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const { data } = useApi(() => api.get('/status/overview'), []);
  const { data: myTeams } = useApi(() => api.get('/teams/mine'), []);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const externalLinks = (data?.integrations || [])
    .filter((e) => e.domain === 'dev' && e.configured && e.baseUrl)
    .map((e) => ({ label: e.label, url: e.baseUrl }));

  const myTeam = (myTeams?.items || [])[0] || null;
  const groups = GROUPS.map((g) => {
    if (g.label !== 'Aperçu') return g;
    if (!myTeam) return g;
    return {
      ...g,
      items: [
        ...g.items,
        { to: `/deployments/teams/${myTeam.id}`, label: 'Mon équipe', icon: 'users' }
      ]
    };
  });

  return (
    <div className={`dev-layout${collapsed ? ' dev-layout-collapsed' : ''}`}>
      <nav className={`card dev-nav${collapsed ? ' dev-nav-collapsed' : ''}`}>
        <div className="dev-nav-groups">
          {groups.map((g) => (
            <div key={g.label}>
              {!collapsed && <div className="dev-nav-group-label">{g.label}</div>}
              <div className="dev-nav-group-items">
                {g.items.map((it) => (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    end={it.end}
                    title={collapsed ? it.label : undefined}
                    className={({ isActive }) => `dev-nav-link${collapsed ? ' dev-nav-link-collapsed' : ''}${isActive ? ' dev-nav-link-active' : ''}`}
                  >
                    <Icon name={it.icon} size={15} strokeWidth={1.7} className="dev-nav-link-icon" />
                    {!collapsed && <span className="dev-nav-link-label">{it.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>

        {externalLinks.length > 0 && (
          <div className="dev-nav-external">
            {!collapsed && <div className="dev-nav-group-label">Outils réels</div>}
            {externalLinks.map((l) => (
              <a
                key={l.label}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                title={collapsed ? l.label : undefined}
                className={`dev-nav-external-link${collapsed ? ' dev-nav-external-link-collapsed' : ''}`}
              >
                <Icon name="externalLink" size={13} strokeWidth={1.7} className="dev-nav-link-icon" />
                {!collapsed && <span className="dev-nav-link-label">{l.label}</span>}
              </a>
            ))}
          </div>
        )}

        <button
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Déployer' : 'Réduire'}
          className={`icon-btn dev-nav-toggle${collapsed ? ' dev-nav-toggle-collapsed' : ''}`}
        >
          <Icon name={collapsed ? 'chevronsRight' : 'chevronsLeft'} size={15} />
        </button>
      </nav>

      <div className="dev-layout-content">
        <Outlet />
      </div>
    </div>
  );
}
