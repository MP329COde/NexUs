import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

const COLLAPSE_KEY = 'nexus-dev-nav-collapsed';

const GROUPS = [
  {
    label: 'Aperçu',
    items: [{ to: '/deployments', label: 'Accès aux outils', icon: 'globe', end: true }]
  },
  {
    label: 'Gestion',
    items: [
      { to: '/deployments/projects', label: 'Projets', icon: 'layers' },
      { to: '/deployments/organizations', label: 'Organisations', icon: 'users' }
    ]
  },
  {
    label: 'Code',
    items: [
      { to: '/deployments/repos', label: 'Dépôts Git', icon: 'gitBranch' },
      { to: '/deployments/reviews', label: 'Revue de code', icon: 'check' }
    ]
  },
  {
    label: 'Livraison',
    items: [
      { to: '/deployments/pipelines', label: 'Pipelines CI/CD', icon: 'sync' },
      { to: '/deployments/environments', label: 'Environnements', icon: 'server' },
      { to: '/deployments/releases', label: 'Déploiements', icon: 'box' }
    ]
  },
  {
    label: 'Qualité',
    items: [{ to: '/deployments/tests', label: 'Tests & qualité', icon: 'flask' }]
  },
  {
    label: 'Exécution',
    items: [
      { to: '/deployments/containers', label: 'Conteneurs', icon: 'cube' },
      { to: '/deployments/images', label: 'Images & registry', icon: 'image' }
    ]
  },
  {
    label: 'Sécurité',
    items: [
      { to: '/deployments/secrets', label: 'Secrets & variables', icon: 'lock' },
      { to: '/deployments/supply-chain', label: 'Supply Chain Security', icon: 'shield' }
    ]
  }
];

export default function DeploymentsLayout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const { data } = useApi(() => api.get('/status/overview'), []);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const externalLinks = (data?.integrations || [])
    .filter((e) => e.domain === 'dev' && e.configured && e.baseUrl)
    .map((e) => ({ label: e.label, url: e.baseUrl }));

  return (
    <div style={{ display: 'flex', gap: collapsed ? 12 : 20, alignItems: 'flex-start' }}>
      <nav
        className="card"
        style={{
          flex: 'none', width: collapsed ? 56 : 210, padding: '10px 8px',
          display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 24,
          transition: 'width .15s ease'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
          {GROUPS.map((g) => (
            <div key={g.label}>
              {!collapsed && (
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-faintest)', padding: '0 8px 5px' }}>
                  {g.label}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {g.items.map((it) => (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    end={it.end}
                    title={collapsed ? it.label : undefined}
                    style={({ isActive }) => ({
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: collapsed ? '9px 0' : '8px 10px',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      borderRadius: 8, fontSize: 12.5, fontWeight: isActive ? 600 : 500,
                      textDecoration: 'none',
                      color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                      background: isActive ? 'var(--primary-soft)' : 'transparent'
                    })}
                  >
                    <Icon name={it.icon} size={15} strokeWidth={1.7} style={{ flex: 'none' }} />
                    {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>

        {externalLinks.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {!collapsed && (
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-faintest)', padding: '0 8px 5px' }}>
                Outils réels
              </div>
            )}
            {externalLinks.map((l) => (
              <a
                key={l.label}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                title={collapsed ? l.label : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: collapsed ? '8px 0' : '7px 10px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  borderRadius: 8, fontSize: 12, fontWeight: 500,
                  textDecoration: 'none', color: 'var(--text-faint)'
                }}
              >
                <Icon name="externalLink" size={13} strokeWidth={1.7} style={{ flex: 'none' }} />
                {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label}</span>}
              </a>
            ))}
          </div>
        )}

        <button
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Déployer' : 'Réduire'}
          className="icon-btn"
          style={{ alignSelf: collapsed ? 'center' : 'flex-end' }}
        >
          <Icon name={collapsed ? 'chevronsRight' : 'chevronsLeft'} size={15} />
        </button>
      </nav>

      <div style={{ flex: 1, minWidth: 0 }}>
        <Outlet />
      </div>
    </div>
  );
}
