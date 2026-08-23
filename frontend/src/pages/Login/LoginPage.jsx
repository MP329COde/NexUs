import { useEffect, useRef, useState } from 'react';
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

  // Préchargement des options de connexion par clé d'accès (voir le
  // commentaire détaillé sur `onPasskey` plus bas) : ces hooks doivent être
  // déclarés avant tout `return` conditionnel (règle des Hooks React), donc
  // ici, avant le court-circuit `if (user) return <Navigate />` juste en
  // dessous.
  const passkeyOptionsRef = useRef(null);
  const passkeyOptionsPromiseRef = useRef(null);

  function fetchPasskeyOptions() {
    const promise = api.post('/auth/webauthn/login-options', { identifier: email || undefined })
      .then((data) => { passkeyOptionsRef.current = data; return data; })
      .catch(() => { passkeyOptionsRef.current = null; return null; });
    passkeyOptionsPromiseRef.current = promise;
    return promise;
  }

  useEffect(() => {
    if (user) return undefined;
    fetchPasskeyOptions();
    const interval = setInterval(fetchPasskeyOptions, 4 * 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
  //
  // IMPORTANT (bug Safari/WebKit corrigé ici) : `navigator.credentials.get()`
  // doit être appelé de façon quasi synchrone dans le gestionnaire de clic,
  // sinon Safari considère l'activation utilisateur ("user gesture") comme
  // expirée et rejette la cérémonie avec `NotAllowedError` — silencieusement,
  // puisque ce code l'ignore volontairement pour ne pas gêner un clic annulé
  // par l'utilisateur. Avant ce correctif, un aller-retour réseau
  // (`await api.post('/auth/webauthn/login-options', ...)`) avait lieu AVANT
  // l'appel à `startAuthentication`, ce qui casse ce lien pour Safari (et,
  // de façon moins systématique, pour Chrome sur connexion lente). Les
  // options sont donc désormais préchargées en amont via `fetchPasskeyOptions`
  // (déclaré plus haut, avant le `return` anticipé imposé par les règles des
  // Hooks) et rafraîchies périodiquement tant que le défi reste valide côté
  // serveur — TTL de 5 min, voir `CHALLENGE_TTL_MS` dans
  // `webauthn.routes.js` — pour que le clic déclenche `startAuthentication`
  // immédiatement, sans attente réseau intercalée.
  async function onPasskey() {
    setPasskeyBusy(true);
    setError(null);
    try {
      // Utilise les options déjà en cache (chargées au montage/en tâche de
      // fond) pour ne jamais insérer d'attente réseau entre le clic et
      // l'appel WebAuthn. Si aucune option n'est encore disponible (échec
      // réseau ou premier rendu trop rapide), on retombe sur l'ancien
      // comportement en dernier recours — mieux vaut tenter avec le risque
      // Safari connu que ne rien proposer du tout.
      const cached = passkeyOptionsRef.current || await (passkeyOptionsPromiseRef.current || fetchPasskeyOptions());
      if (!cached) throw new Error('Impossible de préparer la cérémonie WebAuthn (réseau indisponible)');
      const { requestId, options } = cached;
      const response = await startAuthentication({ optionsJSON: options });
      const data = await api.post('/auth/webauthn/login-verify', { requestId, response });
      setUserFromSession(data.user);
    } catch (err) {
      if (err.name !== 'NotAllowedError') setError(err.message);
    } finally {
      setPasskeyBusy(false);
      fetchPasskeyOptions();
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
