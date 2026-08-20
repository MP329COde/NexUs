import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { startAuthentication } from '@simplewebauthn/browser';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../lib/apiClient.js';
import LoginVisual from './LoginVisual.jsx';
import BrandMark from '../../components/ui/BrandMark.jsx';
import './LoginPage.css';

export default function LoginPage() {
  const { user, login, setUserFromSession } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [mfaToken, setMfaToken] = useState(null);
  const [mfaCode, setMfaCode] = useState('');

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await login(email, password);
      if (data.mfaRequired) setMfaToken(data.mfaToken);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onMfaSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api.post('/auth/mfa/verify', { mfaToken, code: mfaCode.trim() });
      setUserFromSession(data.user);
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
    <div className="login-page">
      <div className="login-form-col">
        {mfaToken ? (
          <form onSubmit={onMfaSubmit} className="login-form">
            <div className="login-brand-row">
              <BrandMark size={32} />
              <div>
                <div className="login-brand-name">Nexus Console</div>
                <div className="mono faint login-brand-domain">homelab.local</div>
              </div>
            </div>
            <p className="faint login-intro">Entrez le code à 6 chiffres de votre application d'authentification, ou un code de secours.</p>

            <label className="login-field-label">Code MFA</label>
            <input
              className="input login-field-email"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              required
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              autoFocus
            />

            {error && <div className="login-error">{error}</div>}

            <button className="btn login-submit-btn" type="submit" disabled={busy}>
              {busy ? 'Vérification…' : 'Vérifier'}
            </button>
            <span className="btn-outline login-passkey-btn" onClick={() => { setMfaToken(null); setMfaCode(''); setError(null); }}>
              ← Revenir à la connexion
            </span>
          </form>
        ) : (
        <form onSubmit={onSubmit} className="login-form">
          <div className="login-brand-row">
            <BrandMark size={32} />
            <div>
              <div className="login-brand-name">Nexus Console</div>
              <div className="mono faint login-brand-domain">homelab.local</div>
            </div>
          </div>
          <p className="faint login-intro">Connectez-vous pour accéder à votre infrastructure.</p>

          <label className="login-field-label">E-mail ou nom de connexion</label>
          <input className="input login-field-email" type="text" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />

          <label className="login-field-label">Mot de passe</label>
          <input className="input login-field-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />

          {error && <div className="login-error">{error}</div>}

          <button className="btn login-submit-btn" type="submit" disabled={busy}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>

          <div className="login-divider-row">
            <div className="login-divider-line" />
            <span className="faint login-divider-label">ou</span>
            <div className="login-divider-line" />
          </div>

          <button className="btn-outline login-passkey-btn" type="button" onClick={onPasskey} disabled={passkeyBusy}>
            {passkeyBusy ? 'En attente de la clé d\'accès…' : 'Se connecter avec une clé d\'accès'}
          </button>
        </form>
        )}
      </div>

      <div className="login-visual login-visual-col">
        <LoginVisual />
      </div>
    </div>
  );
}
