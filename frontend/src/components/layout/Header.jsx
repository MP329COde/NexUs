import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useClosablePopover } from '../../hooks/useClosablePopover.js';
import { useNavItems } from '../../context/NavPrefsContext.jsx';
import { api } from '../../lib/apiClient.js';
import Icon from '../ui/Icon.jsx';
import Avatar from '../ui/Avatar.jsx';
import BrandMark from '../ui/BrandMark.jsx';
import { toneFromScore, toneLabel, buildDomainRows } from '../../lib/health.js';
import './Header.css';

const TONE_ICON = { ok: 'check', warn: 'alertTriangle', crit: 'xCircle', info: 'info' };
const DOMAIN_ICON = { k8s: 'k8s', dev: 'dev', net: 'net', inf: 'inf', mon: 'mon', sec: 'sec', sto: 'inf' };

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const SEARCH_SHORTCUT = IS_MAC ? '⌘K' : 'Ctrl K';

export default function Header({ title, onOpenSearch, onOpenNav }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const nav = useNavItems();
  const { resolved, toggle } = useTheme();
  const { history, clearHistory } = useNotifications();
  const [userMenu, setUserMenu] = useState(false);
  const [notifMenu, setNotifMenu] = useState(false);
  const [healthMenu, setHealthMenu] = useState(false);
  const health = useClosablePopover(healthMenu, setHealthMenu);
  const notif = useClosablePopover(notifMenu, setNotifMenu);
  const userP = useClosablePopover(userMenu, setUserMenu);
  const { data } = useApi(() => api.get('/status/overview'), [], { pollMs: 20000 });
  // Alertes de sécurité persistantes côté serveur (verrouillage de compte,
  // bannissement IP, secret committé, vulnérabilité critique) — distinctes
  // de `history` (toasts de la session en cours, perdus au rechargement) et
  // réservées aux admins, comme les événements qui les déclenchent.
  const isAdmin = user?.role === 'admin';
  const serverNotifs = useApi(() => (isAdmin ? api.get('/notifications') : Promise.resolve(null)), [isAdmin], { pollMs: 30000 });
  const serverItems = serverNotifs.data?.items || [];
  const unreadCount = serverNotifs.data?.unreadCount || 0;

  async function markAllServerRead() {
    if (unreadCount === 0) return;
    await api.post('/notifications/read-all');
    serverNotifs.reload();
  }

  // Notifications de développement persistantes, pour tout utilisateur —
  // distinctes des alertes de sécurité (admin uniquement, ci-dessus) et de
  // `history` (session en cours, perdue au rechargement, ci-dessous).
  const myNotifs = useApi(() => api.get('/my-notifications'), [], { pollMs: 30000 });
  const myItems = myNotifs.data?.items || [];
  const myUnreadCount = myNotifs.data?.unreadCount || 0;

  async function markAllMineRead() {
    if (myUnreadCount === 0) return;
    await api.post('/my-notifications/read-all');
    myNotifs.reload();
  }
  const { data: consoleData } = useApi(() => api.get('/console'), []);
  const score = data?.score ?? null;
  const tone = toneFromScore(score);

  const integrations = data?.integrations || [];
  const domainRows = buildDomainRows(integrations);
  const healthyDomains = domainRows.filter((d) => d.score !== null && d.score >= 90).length;
  const activeAlerts = integrations.filter((e) => e.configured && !e.ok).length;

  return (
    <header className="header-bar">
      <button onClick={onOpenNav} title="Ouvrir la navigation" className="icon-btn mobile-only header-nav-btn">
        <Icon name="menu" size={18} />
      </button>

      <div className="header-brand">
        <BrandMark size={28} />
        <div className="header-brand-text">
          <span className="header-brand-name">{consoleData?.name || 'Nexus Console'}</span>
          <span className="mono header-brand-sub header-brand-domain">homelab.local</span>
        </div>
      </div>

      <div className="header-title-wrap">
        <span className="header-title">{title}</span>
      </div>

      <div className="header-actions">
        <div className="header-popover-anchor" ref={health.ref}>
          <div
            onClick={() => { setHealthMenu((v) => !v); setUserMenu(false); setNotifMenu(false); }}
            title="Santé globale de l'infrastructure"
            className={`badge badge-${tone} header-health-badge`}
          >
            <span className="dot header-health-dot" />
            Santé globale
            <span className="mono">{score === null ? '—' : `${score} %`}</span>
          </div>

          {health.visible && (
            <div className={`card header-popover-card ${health.closing ? 'header-popover-closing' : 'header-popover-opening'}`}>
              <div className="header-health-summary">
                <div>
                  <div className="header-health-summary-title">Résumé de l'infrastructure</div>
                  <div className="header-health-summary-sub">Moyenne pondérée des {domainRows.length} domaines supervisés</div>
                </div>
                <div className="header-health-summary-score">
                  <div className="mono header-health-summary-score-value" style={{ color: `var(--tone-${tone}-fg)` }}>{score === null ? '—' : `${score} %`}</div>
                  <div className="header-health-summary-score-label">{toneLabel(score)}</div>
                </div>
              </div>

              <div className="header-health-kpis">
                <div className="header-health-kpi">
                  <div className="header-health-kpi-label">Domaines sains</div>
                  <div className="mono header-health-kpi-value">{healthyDomains} / {domainRows.length}</div>
                </div>
                <div className="header-health-kpi">
                  <div className="header-health-kpi-label">Alertes actives</div>
                  <div className={`mono header-health-kpi-value ${activeAlerts > 0 ? 'header-health-kpi-value-crit' : ''}`}>{activeAlerts}</div>
                </div>
              </div>

              <div className="header-health-list">
                {domainRows.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => { navigate(d.path); health.close(); }}
                    className="header-health-row"
                  >
                    <Icon name={DOMAIN_ICON[d.id] || 'info'} size={15} className="header-health-row-icon" />
                    <span className="header-health-row-label">{d.label}</span>
                    <div className="header-health-row-bar">
                      {d.score !== null && (
                        <div className="header-health-row-bar-fill" style={{ width: `${d.score}%`, background: `var(--tone-${d.tone}-dot)` }} />
                      )}
                    </div>
                    <span className={`mono header-health-row-score ${d.score === null ? 'header-health-row-score-muted' : ''}`} style={d.score !== null ? { color: `var(--tone-${d.tone}-fg)` } : undefined}>
                      {d.score === null ? '—' : `${d.score}%`}
                    </span>
                    <span className="header-health-row-detail">
                      {d.entries.length === 0 ? 'Aucune intégration' : `${d.healthy.length} / ${d.configured.length} services`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {nav.headerItems.length > 0 && (
          <div className="header-custom-nav">
            {nav.headerItems.map((d) => {
              const isExternal = d.isCustom && /^https?:\/\//.test(d.url || '');
              return isExternal ? (
                <a key={d.id} href={d.url} target="_blank" rel="noreferrer" title={d.label} className="icon-btn header-custom-nav-btn">
                  {d.isCustom ? <span className="header-custom-nav-emoji">{d.icon}</span> : <Icon name={d.id} size={16} />}
                </a>
              ) : (
                <Link key={d.id} to={d.isCustom ? d.url : d.path} title={d.label} className="icon-btn header-custom-nav-btn">
                  {d.isCustom ? <span className="header-custom-nav-emoji">{d.icon}</span> : <Icon name={d.id} size={16} />}
                </Link>
              );
            })}
          </div>
        )}

        <button
          onClick={onOpenSearch}
          title={`Command Center — recherche et actions (${SEARCH_SHORTCUT} ou ${IS_MAC ? '⌘⇧F' : 'Ctrl Shift F'})`}
          className="header-search-bar"
        >
          <Icon name="search" size={14} className="header-search-icon" />
          <span className="header-search-text">
            Command Center...
          </span>
          <span className="header-search-label mono">
            {SEARCH_SHORTCUT}
          </span>
        </button>

        <Link to="/monitor-wall" title="Mur de surveillance (à laisser ouvert sur un écran dédié)" className="icon-btn header-manual-link">
          <Icon name="gauge" size={16} />
        </Link>

        <Link to="/manual" title="Manuel d'utilisation" className="icon-btn header-manual-link">
          <Icon name="book" size={16} />
        </Link>

        <button
          onClick={toggle}
          title={resolved === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
          className="icon-btn"
        >
          <Icon name={resolved === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>

        <div className="header-popover-anchor" ref={notif.ref}>
          <button onClick={() => { setNotifMenu((v) => !v); setUserMenu(false); }} title="Notifications" className="icon-btn header-notif-btn">
            <Icon name="bell" size={16} />
            {(history.length > 0 || unreadCount > 0 || myUnreadCount > 0) && <span className="header-notif-dot" />}
          </button>
          {notif.visible && (
            <div className={`card header-popover-card header-popover-card-right header-popover-card-narrow ${notif.closing ? 'header-popover-closing' : 'header-popover-opening'}`}>
              {isAdmin && (
                <>
                  <div className="header-panel-head">
                    <span className="header-panel-head-title">Alertes de sécurité{unreadCount > 0 ? ` (${unreadCount})` : ''}</span>
                    {unreadCount > 0 && <span onClick={markAllServerRead} className="header-panel-head-action">Tout marquer lu</span>}
                  </div>
                  <div className="header-panel-list">
                    {serverItems.length === 0 && <div className="header-panel-empty">Aucune alerte</div>}
                    {serverItems.map((n) => (
                      <div key={n.id} className={`header-notif-item ${!n.read ? 'header-notif-item-unread' : ''}`}>
                        <span className="header-notif-item-icon" style={{ color: `var(--tone-${n.severity}-fg)` }}><Icon name={TONE_ICON[n.severity] || 'info'} size={15} /></span>
                        <div className="header-notif-item-body">
                          {n.title && <div className="header-notif-item-title">{n.title}</div>}
                          <div className="header-notif-item-message">{n.message}</div>
                          <div className="mono header-notif-item-time">{new Date(n.createdAt).toLocaleString('fr-FR')}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="header-panel-head">
                <span className="header-panel-head-title">Mes notifications{myUnreadCount > 0 ? ` (${myUnreadCount})` : ''}</span>
                {myUnreadCount > 0 && <span onClick={markAllMineRead} className="header-panel-head-action">Tout marquer lu</span>}
              </div>
              <div className="header-panel-list">
                {myItems.length === 0 && <div className="header-panel-empty">Aucune notification</div>}
                {myItems.map((n) => (
                  <div key={n.id} className={`header-notif-item ${!n.read ? 'header-notif-item-unread' : ''}`}>
                    <span className="header-notif-item-icon"><Icon name="bell" size={15} /></span>
                    <div className="header-notif-item-body">
                      {n.title && <div className="header-notif-item-title">{n.title}</div>}
                      <div className="header-notif-item-message">{n.message}</div>
                      <div className="mono header-notif-item-time">{new Date(n.created_at).toLocaleString('fr-FR')}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="header-panel-head">
                <span className="header-panel-head-title">Activité de la session</span>
                {history.length > 0 && <span onClick={clearHistory} className="header-panel-head-action">Effacer</span>}
              </div>
              <div className="header-panel-list">
                {history.length === 0 && <div className="header-panel-empty header-panel-empty-lg">Aucune notification récente</div>}
                {history.map((n) => (
                  <div key={n.id} className="header-notif-item">
                    <span className="header-notif-item-icon" style={{ color: `var(--tone-${n.type}-fg)` }}><Icon name={TONE_ICON[n.type]} size={15} /></span>
                    <div className="header-notif-item-body">
                      {n.title && <div className="header-notif-item-title">{n.title}</div>}
                      <div className="header-notif-item-message">{n.message}</div>
                      <div className="mono header-notif-item-time">{new Date(n.time).toLocaleTimeString('fr-FR')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="header-popover-anchor" ref={userP.ref}>
          <div onClick={() => { setUserMenu((v) => !v); setNotifMenu(false); }} title={user?.name} className="header-user-trigger">
            <Avatar user={user} size={32} />
          </div>
          {userP.visible && (
            <div className={`card header-popover-card header-popover-card-right header-popover-card-user ${userP.closing ? 'header-popover-closing' : 'header-popover-opening'}`}>
              <div className="header-user-head">
                <Avatar user={user} size={36} />
                <div className="header-user-head-info">
                  <div className="header-user-head-name">{user?.name}</div>
                  <div className="header-user-head-email">{user?.email}</div>
                </div>
              </div>

              <div className="header-user-role-row">
                <span className="header-user-role-label">Rôle</span>
                <span className={`badge badge-${user?.role === 'admin' ? 'vio' : 'mut'}`}>
                  <span className="dot" />{user?.role === 'admin' ? 'Administrateur' : 'Utilisateur'}
                </span>
              </div>

              <div className="header-user-menu-group">
                <Link to="/account" onClick={() => setUserMenu(false)} className="header-user-menu-link">
                  <Icon name="edit" size={15} />Mon profil
                </Link>
                {user?.role === 'admin' && (
                  <Link to="/settings" onClick={() => setUserMenu(false)} className="header-user-menu-link">
                    <Icon name="layers" size={15} />Paramètres du compte
                  </Link>
                )}
                <Link to="/account" onClick={() => setUserMenu(false)} className="header-user-menu-link">
                  <Icon name="sun" size={15} />Préférences &amp; thème
                </Link>
                <Link to="/setup" onClick={() => setUserMenu(false)} className="header-user-menu-link">
                  <Icon name="plus" size={15} />Configuration initiale
                </Link>
                <Link to="/account" onClick={() => setUserMenu(false)} className="header-user-menu-link">
                  <Icon name="lock" size={15} />Clés API &amp; sessions
                </Link>
              </div>

              <div className="header-user-menu-group header-user-menu-group-last">
                <div onClick={logout} className="header-user-menu-link header-user-menu-link-danger">
                  <Icon name="logout" size={15} />Se déconnecter
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
