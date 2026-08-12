import { NavLink } from 'react-router-dom';
import { DOMAINS } from '../../config/domains.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Icon from '../ui/Icon.jsx';

export default function DomainNav({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }) {
  const { user } = useAuth();
  const visible = DOMAINS.filter((d) => !d.adminOnly || user?.role === 'admin');
  // Le tiroir mobile est toujours en labels complets (indépendant de la
  // préférence "réduite" de la barre desktop, qui n'a pas de sens en overlay).
  const effectiveCollapsed = collapsed && !mobileOpen;
  const width = effectiveCollapsed ? 64 : 208;

  return (
    <>
      <nav
        className={`app-domain-nav${mobileOpen ? ' open' : ''}`}
        style={{
          flex: 'none',
          width,
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '10px 8px',
          overflowY: 'auto',
          overflowX: 'hidden',
          transition: 'width .18s ease, transform .2s ease'
        }}
      >
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, alignItems: effectiveCollapsed ? 'center' : 'stretch' }}>
          {visible.map((d) => (
            <NavLink
              key={d.id}
              to={d.path}
              title={effectiveCollapsed ? d.label : undefined}
              onClick={onCloseMobile}
              className="domain-nav-item"
              style={({ isActive }) => ({
                width: effectiveCollapsed ? 44 : '100%',
                height: effectiveCollapsed ? 44 : 40,
                borderRadius: 11,
                display: 'flex',
                flexDirection: effectiveCollapsed ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
                gap: effectiveCollapsed ? 3 : 10,
                padding: effectiveCollapsed ? 0 : '0 11px',
                textDecoration: 'none',
                background: isActive ? 'var(--primary-soft)' : 'transparent',
                color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                transition: 'all .15s ease'
              })}
            >
              <span style={{ position: 'relative', display: 'flex', flex: 'none' }}>
                <Icon name={d.id} size={19} strokeWidth={1.7} />
                {d.id === 'adm' && (
                  <span
                    title="Accès administrateur"
                    style={{ position: 'absolute', top: -2, right: -3, width: 6, height: 6, borderRadius: '50%', background: 'var(--tone-crit-dot)' }}
                  />
                )}
              </span>
              {effectiveCollapsed
                ? <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.02em' }}>{d.code}</span>
                : <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>{d.label}</span>}
            </NavLink>
          ))}
        </div>

        <button
          onClick={onToggleCollapsed}
          title={collapsed ? 'Déployer la barre latérale' : 'Réduire la barre latérale'}
          className="desktop-only"
          style={{
            flex: 'none', marginTop: 8, height: 36, borderRadius: 9, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
          }}
        >
          <Icon name={collapsed ? 'chevronsRight' : 'chevronsLeft'} size={16} />
        </button>
      </nav>

      <div className={`nav-backdrop${mobileOpen ? ' open' : ''}`} onClick={onCloseMobile} />
    </>
  );
}
