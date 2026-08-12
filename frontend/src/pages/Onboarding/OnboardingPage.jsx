import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import BrandMark from '../../components/ui/BrandMark.jsx';

// Écran minimal affiché une seule fois, à la première connexion d'un compte
// créé par un admin (voir mustOnboard côté backend) — pas pour le premier
// admin de la console, qui passe par SetupPage.
export default function OnboardingPage() {
  const { user, completeOnboarding } = useAuth();
  const [form, setForm] = useState({ name: user?.name || '', newPassword: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (form.newPassword && form.newPassword !== form.confirm) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }
    if (form.newPassword && form.newPassword.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }
    setBusy(true);
    try {
      await completeOnboarding({
        name: form.name,
        newPassword: form.newPassword || undefined
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 }}>
      <form onSubmit={onSubmit} className="card" style={{ width: 400, padding: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <BrandMark size={32} />
          <div style={{ fontWeight: 600, fontSize: 15 }}>Bienvenue, {user?.name || user?.email}</div>
        </div>
        <p style={{ margin: '0 0 22px', fontSize: 12.5, color: 'var(--text-faint)' }}>
          Un administrateur a créé votre compte. Finalisez-le avant de continuer — cet écran ne s'affichera plus ensuite.
        </p>

        <Field label="Votre nom">
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="Nouveau mot de passe (facultatif)">
              <input className="input" type="password" value={form.newPassword} onChange={(e) => set('newPassword', e.target.value)} placeholder="Laisser vide pour conserver" />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Confirmation">
              <input className="input" type="password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} disabled={!form.newPassword} />
            </Field>
          </div>
        </div>

        {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)', margin: '4px 0 14px' }}>{error}</div>}

        <button className="btn" type="submit" disabled={busy} style={{ width: '100%', marginTop: 8 }}>
          {busy ? 'Enregistrement…' : 'Continuer vers la console'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 5, color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  );
}
