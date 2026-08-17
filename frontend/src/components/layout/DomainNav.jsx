import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useNavItems } from '../../context/NavPrefsContext.jsx';
import Icon from '../ui/Icon.jsx';
import NavCustomizeModal from './NavCustomizeModal.jsx';
import './DomainNav.css';

const ADMIN_DOT_SEEN_KEY = 'nexus.adminDot.seen';

export default function DomainNav({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }) {
  const nav = useNavItems();
  const visible = nav.sidebarItems;
  const [customizing, setCustomizing] = useState(false);
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
          {visible.map((d) => {
            const isExternal = d.isCustom && /^https?:\/\//.test(d.url || '');
            const content = (
              <>
                <span className="domnav-icon-wrap">
                  {d.isCustom
                    ? <span className="domnav-custom-emoji">{d.icon}</span>
                    : <Icon name={d.id} size={19} strokeWidth={1.7} />}
                  {d.id === 'adm' && !adminDotSeen && (
                    <span title="Accès administrateur" className="domnav-admin-dot" />
                  )}
                </span>
                {effectiveCollapsed
                  ? <span className="domnav-code">{d.code || d.label.slice(0, 3).toUpperCase()}</span>
                  : <span className="domnav-label">{d.label}</span>}
              </>
            );
            if (isExternal) {
              return (
                <a
                  key={d.id}
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  title={effectiveCollapsed ? d.label : undefined}
                  onClick={onCloseMobile}
                  className={`domain-nav-item domnav-item${effectiveCollapsed ? ' domnav-item-collapsed' : ''}`}
                >
                  {content}
                </a>
              );
            }
            return (
              <NavLink
                key={d.id}
                to={d.isCustom ? d.url : d.path}
                title={effectiveCollapsed ? d.label : undefined}
                onClick={() => { onCloseMobile(); if (d.id === 'adm') dismissAdminDot(); }}
                className={`domain-nav-item domnav-item${effectiveCollapsed ? ' domnav-item-collapsed' : ''}`}
                style={({ isActive }) => ({
                  background: isActive ? 'var(--primary-soft)' : 'transparent',
                  color: isActive ? 'var(--primary)' : 'var(--text-muted)'
                })}
              >
                {content}
              </NavLink>
            );
          })}
        </div>

        <div className="domnav-footer">
          <button
            onClick={() => setCustomizing(true)}
            title="Personnaliser la navigation"
            className="desktop-only domnav-toggle-btn"
          >
            <Icon name="edit" size={15} />
          </button>
          <button
            onClick={onToggleCollapsed}
            title={collapsed ? 'Déployer la barre latérale' : 'Réduire la barre latérale'}
            className="desktop-only domnav-toggle-btn"
          >
            <Icon name={collapsed ? 'chevronsRight' : 'chevronsLeft'} size={16} />
          </button>
        </div>
      </nav>

      <div className={`nav-backdrop${mobileOpen ? ' open' : ''}`} onClick={onCloseMobile} />
      {customizing && <NavCustomizeModal nav={nav} onClose={() => setCustomizing(false)} />}
    </>
  );
}
