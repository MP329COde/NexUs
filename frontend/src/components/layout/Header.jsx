import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import Icon from '../ui/Icon.jsx';

const TONE_ICON = { ok: 'check', warn: 'alertTriangle', crit: 'xCircle', info: 'info' };

export default function Header({ title }) {
  const { user, logout } = useAuth();
  const { resolved, toggle } = useTheme();
  const { history, clearHistory } = useNotifications();
  const [userMenu, setUserMenu] = useState(false);
  const [notifMenu, setNotifMenu] = useState(false);
  const { data } = useApi(() => api.get('/status/overview'), [], { pollMs: 20000 });
  const score = data?.score ?? null;
  const tone = score === null ? 'mut' : score >= 90 ? 'ok' : score >= 60 ? 'warn' : 'crit';

  return (
    <header style={{ flex: 'none', height: 56, display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'relative', zIndex: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 246, flex: 'none' }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>N</div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Nexus Console</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>homelab.local</span>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div title="Santé globale de l'infrastructure" className={`badge badge-${tone}`} style={{ height: 30 }}>
          <span className="dot" style={{ animation: 'pulseDot 2s ease-in-out infinite' }} />
          Santé globale
          <span className="mono">{score === null ? '—' : `${score} %`}</span>
        </div>

        <Link to="/manual" title="Manuel d'utilisation" style={iconBtn}>
          <Icon name="book" size={16} />
        </Link>

        <button
          onClick={toggle}
          title={resolved === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
          style={iconBtn}
        >
          <Icon name={resolved === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>

        <div style={{ position: 'relative' }}>
          <button onClick={() => { setNotifMenu((v) => !v); setUserMenu(false); }} title="Notifications" style={{ ...iconBtn, position: "relative" }}>
            <Icon name="bell" size={16} />
            {history.length > 0 && <span style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: '50%', background: 'var(--tone-crit-dot)', border: '2px solid var(--surface)' }} />}
          </button>
          {notifMenu && (
            <div className="card" style={{ position: 'absolute', top: 44, right: 0, width: 340, boxShadow: 'var(--shadow-pop)', zIndex: 60, overflow: 'hidden', animation: 'popIn .15s ease both' }}>
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

        <div style={{ position: 'relative' }}>
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
          {userMenu && (
            <div className="card" style={{ position: 'absolute', top: 44, right: 0, width: 260, boxShadow: 'var(--shadow-pop)', zIndex: 60, overflow: 'hidden', animation: 'popIn .15s ease both' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 15px', borderBottom: '1px solid var(--border-soft)' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: user?.avatarEmoji ? 'var(--border-soft)' : (user?.avatarColor || '#0F172A'), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: user?.avatarEmoji ? 17 : 13, fontWeight: 600 }}>
                  {user?.avatarEmoji || (user?.name || '??').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{user?.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{user?.email}</div>
                </div>
              </div>

              <div style={{ padding: 6 }}>
                <Link to="/account" onClick={() => setUserMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'inherit', textDecoration: 'none' }}>
                  <Icon name="edit" size={15} />Mon compte
                </Link>
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

const iconBtn = { width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
