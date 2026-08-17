import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { DOMAINS } from '../../config/domains.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Icon from '../ui/Icon.jsx';
import './DomainNav.css';

const ADMIN_DOT_SEEN_KEY = 'nexus.adminDot.seen';

export default function DomainNav({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }) {
  const { user, homeRestrictedToAdmins, hasPermission } = useAuth();
  // Paramètres reste listé pour les adminOnly, mais aussi pour tout compte
  // "user" ayant au moins une permission RBAC sur un des domaines exposés
  // par cette page (settings/identity/users/inventory) — sinon le lien
  // disparaîtrait alors que l'utilisateur a un onglet accessible.
  const SETTINGS_DOMAINS = ['settings', 'identity', 'users', 'inventory'];
  const visible = DOMAINS.filter((d) => {
    if (d.id === 'home' && homeRestrictedToAdmins) return user?.role === 'admin';
    if (d.id === 'adm') return user?.role === 'admin' || SETTINGS_DOMAINS.some((domain) => hasPermission(domain, 'read'));
    return !d.adminOnly || user?.role === 'admin';
  });
  // Le point rouge sur Paramètres signale un accès admin nouvellement disponible ;
  // il ne doit être visible qu'une fois, jusqu'au premier clic sur l'onglet.
  const [adminDotSeen, setAdminDotSeen] = useState(() => localStorage.getItem(ADMIN_DOT_SEEN_KEY) === '1');
  const dismissAdminDot = () => {
    if (!adminDotSeen) {
      localStorage.setItem(ADMIN_DOT_SEEN_KEY, '1');
      setAdminDotSeen(true);
    }
  };
  // Le tiroir mobile est toujours en labels complets (indépendant de la
  // préférence "réduite" de la barre desktop, qui n'a pas de sens en overlay).
  const effectiveCollapsed = collapsed && !mobileOpen;
  const width = effectiveCollapsed ? 64 : 208;

  return (
    <>
      <nav
        className={`app-domain-nav domnav-nav${mobileOpen ? ' open' : ''}`}
        style={{ width }}
      >
        <div className={`domnav-list${effectiveCollapsed ? ' domnav-list-collapsed' : ''}`}>
          {visible.map((d) => (
            <NavLink
              key={d.id}
              to={d.path}
              title={effectiveCollapsed ? d.label : undefined}
              onClick={() => { onCloseMobile(); if (d.id === 'adm') dismissAdminDot(); }}
              className={`domain-nav-item domnav-item${effectiveCollapsed ? ' domnav-item-collapsed' : ''}`}
              style={({ isActive }) => ({
                background: isActive ? 'var(--primary-soft)' : 'transparent',
                color: isActive ? 'var(--primary)' : 'var(--text-muted)'
              })}
            >
              <span className="domnav-icon-wrap">
                <Icon name={d.id} size={19} strokeWidth={1.7} />
                {d.id === 'adm' && !adminDotSeen && (
                  <span
                    title="Accès administrateur"
                    className="domnav-admin-dot"
                  />
                )}
              </span>
              {effectiveCollapsed
                ? <span className="domnav-code">{d.code}</span>
                : <span className="domnav-label">{d.label}</span>}
            </NavLink>
          ))}
        </div>

        <button
          onClick={onToggleCollapsed}
          title={collapsed ? 'Déployer la barre latérale' : 'Réduire la barre latérale'}
          className="desktop-only domnav-toggle-btn"
        >
          <Icon name={collapsed ? 'chevronsRight' : 'chevronsLeft'} size={16} />
        </button>
      </nav>

      <div className={`nav-backdrop${mobileOpen ? ' open' : ''}`} onClick={onCloseMobile} />
    </>
  );
}
