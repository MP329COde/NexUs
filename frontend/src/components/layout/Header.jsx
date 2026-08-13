import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useClosablePopover } from '../../hooks/useClosablePopover.js';
import { api } from '../../lib/apiClient.js';
import Icon from '../ui/Icon.jsx';
import BrandMark from '../ui/BrandMark.jsx';
import { toneFromScore, toneLabel, buildDomainRows } from '../../lib/health.js';

const TONE_ICON = { ok: 'check', warn: 'alertTriangle', crit: 'xCircle', info: 'info' };
const DOMAIN_ICON = { k8s: 'k8s', dev: 'dev', net: 'net', inf: 'inf', mon: 'mon', sec: 'sec', sto: 'inf' };

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const SEARCH_SHORTCUT = IS_MAC ? '⌘K' : 'Ctrl K';

export default function Header({ title, onOpenSearch, onOpenNav }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { resolved, toggle } = useTheme();
  const { history, clearHistory } = useNotifications();
  const [userMenu, setUserMenu] = useState(false);
  const [notifMenu, setNotifMenu] = useState(false);
  const [healthMenu, setHealthMenu] = useState(false);
  const health = useClosablePopover(healthMenu, setHealthMenu);
  const notif = useClosablePopover(notifMenu, setNotifMenu);
  const userP = useClosablePopover(userMenu, setUserMenu);
  const { data } = useApi(() => api.get('/status/overview'), [], { pollMs: 20000 });
  const { data: consoleData } = useApi(() => api.get('/console'), []);
  const score = data?.score ?? null;
  const tone = toneFromScore(score);

  const integrations = data?.integrations || [];
  const domainRows = buildDomainRows(integrations);
  const healthyDomains = domainRows.filter((d) => d.score !== null && d.score >= 90).length;
  const activeAlerts = integrations.filter((e) => e.configured && !e.ok).length;

  return (
    <header style={{ flex: 'none', height: 56, display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'relative', zIndex: 30 }}>
      <button onClick={onOpenNav} title="Ouvrir la navigation" className="icon-btn mobile-only" style={{ flex: 'none' }}>
        <Icon name="menu" size={18} />
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 'none' }}>
        <BrandMark size={28} />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}>{consoleData?.name || 'Nexus Console'}</span>
          <span className="mono header-brand-sub" style={{ fontSize: 11, color: 'var(--text-faint)' }}>homelab.local</span>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{title}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative' }} ref={health.ref}>
          <div
            onClick={() => { setHealthMenu((v) => !v); setUserMenu(false); setNotifMenu(false); }}
            title="Santé globale de l'infrastructure"
            className={`badge badge-${tone} header-health-badge`}
            style={{ height: 30, cursor: 'pointer' }}
          >
            <span className="dot" style={{ animation: 'pulseDot 2s ease-in-out infinite' }} />
            Santé globale
            <span className="mono">{score === null ? '—' : `${score} %`}</span>
          </div>

          {health.visible && (
            <div className="card" style={{ position: 'absolute', top: 44, left: 0, width: 420, boxShadow: 'var(--shadow-pop)', zIndex: 60, overflow: 'hidden', animation: `${health.closing ? 'popOut' : 'popIn'} .13s ease both` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border-soft)' }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>Résumé de l'infrastructure</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>Moyenne pondérée des {domainRows.length} domaines supervisés</div>
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: `var(--tone-${tone}-fg)`, lineHeight: 1.1 }}>{score === null ? '—' : `${score} %`}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{toneLabel(score)}</div>
                </div>
              </div>

              <div style={{ display: 'flex', borderBottom: '1px solid var(--border-soft)' }}>
                <div style={{ flex: 1, padding: '10px 16px', borderRight: '1px solid var(--border-soft)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Domaines sains</div>
                  <div className="mono" style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>{healthyDomains} / {domainRows.length}</div>
                </div>
                <div style={{ flex: 1, padding: '10px 16px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Alertes actives</div>
                  <div className="mono" style={{ fontSize: 15, fontWeight: 700, marginTop: 3, color: activeAlerts > 0 ? 'var(--tone-crit-fg)' : 'inherit' }}>{activeAlerts}</div>
                </div>
              </div>

              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                {domainRows.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => { navigate(d.path); health.close(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid var(--border-soft)', cursor: 'pointer' }}
                  >
                    <Icon name={DOMAIN_ICON[d.id] || 'info'} size={15} style={{ flex: 'none', color: 'var(--text-faint)' }} />
                    <span style={{ fontSize: 12.5, fontWeight: 500, width: 130, flex: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--border-soft)', overflow: 'hidden' }}>
                      {d.score !== null && (
                        <div style={{ width: `${d.score}%`, height: '100%', borderRadius: 999, background: `var(--tone-${d.tone}-dot)` }} />
                      )}
                    </div>
                    <span className="mono" style={{ fontSize: 12, fontWeight: 600, width: 34, flex: 'none', textAlign: 'right', color: d.score === null ? 'var(--text-faint)' : `var(--tone-${d.tone}-fg)` }}>
                      {d.score === null ? '—' : `${d.score}%`}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)', width: 110, flex: 'none', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.entries.length === 0 ? 'Aucune intégration' : `${d.healthy.length} / ${d.configured.length} services`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onOpenSearch}
          title={`Recherche globale (${SEARCH_SHORTCUT})`}
          className="header-search-bar"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 8px 0 10px',
            borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-inset, var(--bg))',
            color: 'var(--text-faint)', cursor: 'pointer', width: 220,
          }}
        >
          <Icon name="search" size={14} style={{ flex: 'none' }} />
          <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Rechercher hôtes, VM, services...
          </span>
          <span
            className="header-search-label mono"
            style={{ flex: 'none', fontSize: 10.5, fontWeight: 600, color: 'var(--text-faint)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 5px', lineHeight: 1 }}
          >
            {SEARCH_SHORTCUT}
          </span>
        </button>

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

        <div style={{ position: 'relative' }} ref={notif.ref}>
          <button onClick={() => { setNotifMenu((v) => !v); setUserMenu(false); }} title="Notifications" className="icon-btn" style={{ position: 'relative' }}>
            <Icon name="bell" size={16} />
            {history.length > 0 && <span style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: '50%', background: 'var(--tone-crit-dot)', border: '2px solid var(--surface)' }} />}
          </button>
          {notif.visible && (
            <div className="card" style={{ position: 'absolute', top: 44, right: 0, width: 340, boxShadow: 'var(--shadow-pop)', zIndex: 60, overflow: 'hidden', animation: `${notif.closing ? 'popOut' : 'popIn'} .13s ease both` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 15px', borderBottom: '1px solid var(--border-soft)' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Notifications</span>
                {history.length > 0 && <span onClick={clearHistory} style={{ fontSize: 11.5, color: 'var(--text-faint)', cursor: 'pointer' }}>Effacer</span>}
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {history.length === 0 && <div style={{ padding: 20, fontSize: 12.5, color: 'var(--text-faint)', textAlign: 'center' }}>Aucune notification récente</div>}
                {history.map((n) => (
                  <div key={n.id} style={{ display: 'flex', gap: 10, padding: '10px 15px', borderBottom: '1px solid var(--border-soft)' }}>
                    <span style={{ color: `var(--tone-${n.type}-fg)`, flex: 'none', marginTop: 1 }}><Icon name={TONE_ICON[n.type]} size={15} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {n.title && <div style={{ fontSize: 12.5, fontWeight: 600 }}>{n.title}</div>}
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{n.message}</div>
                      <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-faintest)', marginTop: 2 }}>{new Date(n.time).toLocaleTimeString('fr-FR')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }} ref={userP.ref}>
          <div
            onClick={() => { setUserMenu((v) => !v); setNotifMenu(false); }}
            title={user?.name}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: user?.avatarEmoji ? 'var(--border-soft)' : (user?.avatarColor || '#0F172A'),
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: user?.avatarEmoji ? 15 : 12, fontWeight: 600, cursor: 'pointer'
            }}
          >
            {user?.avatarEmoji || (user?.name || '??').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()}
          </div>
          {userP.visible && (
            <div className="card" style={{ position: 'absolute', top: 44, right: 0, width: 280, boxShadow: 'var(--shadow-pop)', zIndex: 60, overflow: 'hidden', animation: `${userP.closing ? 'popOut' : 'popIn'} .13s ease both` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 15px', borderBottom: '1px solid var(--border-soft)' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: user?.avatarEmoji ? 'var(--border-soft)' : (user?.avatarColor || '#0F172A'), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: user?.avatarEmoji ? 17 : 13, fontWeight: 600, flex: 'none' }}>
                  {user?.avatarEmoji || (user?.name || '??').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{user?.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 15px', borderBottom: '1px solid var(--border-soft)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Rôle</span>
                <span className={`badge badge-${user?.role === 'admin' ? 'vio' : 'mut'}`}>
                  <span className="dot" />{user?.role === 'admin' ? 'Administrateur' : 'Utilisateur'}
                </span>
              </div>

              <div style={{ padding: 6, borderBottom: '1px solid var(--border-soft)' }}>
                <Link to="/account" onClick={() => setUserMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'inherit', textDecoration: 'none' }}>
                  <Icon name="edit" size={15} />Mon profil
                </Link>
                {user?.role === 'admin' && (
                  <Link to="/settings" onClick={() => setUserMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'inherit', textDecoration: 'none' }}>
                    <Icon name="layers" size={15} />Paramètres du compte
                  </Link>
                )}
                <Link to="/account" onClick={() => setUserMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'inherit', textDecoration: 'none' }}>
                  <Icon name="sun" size={15} />Préférences &amp; thème
                </Link>
                <Link to="/setup" onClick={() => setUserMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'inherit', textDecoration: 'none' }}>
                  <Icon name="plus" size={15} />Configuration initiale
                </Link>
                <Link to="/account" onClick={() => setUserMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'inherit', textDecoration: 'none' }}>
                  <Icon name="lock" size={15} />Clés API &amp; sessions
                </Link>
              </div>

              <div style={{ padding: 6 }}>
                <div onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--tone-crit-fg)' }}>
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
