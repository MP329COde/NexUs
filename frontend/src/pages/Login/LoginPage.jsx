import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { startAuthentication } from '@simplewebauthn/browser';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../lib/apiClient.js';
import LoginVisual from './LoginVisual.jsx';
import BrandMark from '../../components/ui/BrandMark.jsx';

export default function LoginPage() {
  const { user, login, setUserFromSession } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Clé d'accès (passkey) : options envoyées même sans identifiant renseigné
  // (le navigateur propose alors les passkeys "découvrables" qu'il connaît
  // pour ce site) — jamais de mot de passe impliqué dans ce flux.
  async function onPasskey() {
    setPasskeyBusy(true);
    setError(null);
    try {
      const { requestId, options } = await api.post('/auth/webauthn/login-options', { identifier: email || undefined });
      const response = await startAuthentication({ optionsJSON: options });
      const data = await api.post('/auth/webauthn/login-verify', { requestId, response });
      setUserFromSession(data.user);
    } catch (err) {
      if (err.name !== 'NotAllowedError') setError(err.message);
    } finally {
      setPasskeyBusy(false);
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', background: 'var(--bg)' }}>
      <div style={{ flex: '1 1 440px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <form onSubmit={onSubmit} style={{ width: '100%', maxWidth: 340, animation: 'riseIn .4s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <BrandMark size={32} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Nexus Console</div>
              <div className="mono faint" style={{ fontSize: 11 }}>homelab.local</div>
            </div>
          </div>
          <p className="faint" style={{ fontSize: 13, margin: '4px 0 26px' }}>Connectez-vous pour accéder à votre infrastructure.</p>

          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 6 }}>E-mail ou nom de connexion</label>
          <input className="input" type="text" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 14 }} autoFocus />

          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 6 }}>Mot de passe</label>
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} style={{ marginBottom: 18 }} />

          {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)', marginBottom: 14 }}>{error}</div>}

          <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border-soft)' }} />
            <span className="faint" style={{ fontSize: 11 }}>ou</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-soft)' }} />
          </div>

          <button className="btn-outline" type="button" onClick={onPasskey} disabled={passkeyBusy} style={{ width: '100%', height: 36 }}>
            {passkeyBusy ? 'En attente de la clé d\'accès…' : 'Se connecter avec une clé d\'accès'}
          </button>
        </form>
      </div>

      <div className="login-visual" style={{ flex: '1 1 55%' }}>
        <LoginVisual />
      </div>
    </div>
  );
}
