import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

export default function Header({ title }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
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

        <div style={{ position: 'relative' }}>
          <div
            onClick={() => setMenuOpen((v) => !v)}
            title={user?.name}
            style={{ width: 32, height: 32, borderRadius: '50%', background: '#0F172A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            {(user?.name || '??').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()}
          </div>
          {menuOpen && (
            <div className="card" style={{ position: 'absolute', top: 44, right: 0, width: 240, boxShadow: 'var(--shadow-pop)', zIndex: 60, overflow: 'hidden' }}>
              <div style={{ padding: '14px 15px', borderBottom: '1px solid var(--border-soft)' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{user?.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{user?.email}</div>
              </div>
              <div style={{ padding: 6 }}>
                <div
                  onClick={logout}
                  style={{ padding: '9px 10px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--tone-crit-fg)' }}
                >
                  Se déconnecter
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
