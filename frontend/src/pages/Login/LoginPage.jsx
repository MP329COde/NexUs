import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import LoginVisual from './LoginVisual.jsx';

export default function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <div style={{ height: '100vh', display: 'flex', background: 'var(--bg)' }}>
      <div style={{ flex: '1 1 440px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <form onSubmit={onSubmit} style={{ width: '100%', maxWidth: 340, animation: 'riseIn .4s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>N</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Nexus Console</div>
              <div className="mono faint" style={{ fontSize: 11 }}>homelab.local</div>
            </div>
          </div>
          <p className="faint" style={{ fontSize: 13, margin: '4px 0 26px' }}>Connectez-vous pour accéder à votre infrastructure.</p>

          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 6 }}>Adresse e-mail</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 14 }} autoFocus />

          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 6 }}>Mot de passe</label>
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} style={{ marginBottom: 18 }} />

          {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)', marginBottom: 14 }}>{error}</div>}

          <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>

      <div className="login-visual" style={{ flex: '1 1 55%' }}>
        <LoginVisual />
      </div>
    </div>
  );
}
