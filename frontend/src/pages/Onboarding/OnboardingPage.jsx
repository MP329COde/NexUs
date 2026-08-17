import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import BrandMark from '../../components/ui/BrandMark.jsx';
import './OnboardingPage.css';

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
    <div className="onb-page">
      <form onSubmit={onSubmit} className="card onb-card">
        <div className="onb-brand-row">
          <BrandMark size={32} />
          <div className="onb-brand-title">Bienvenue, {user?.name || user?.email}</div>
        </div>
        <p className="onb-intro">
          Un administrateur a créé votre compte. Finalisez-le avant de continuer — cet écran ne s'affichera plus ensuite.
        </p>

        <Field label="Votre nom">
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="onb-row">
          <div className="onb-row-field">
            <Field label="Nouveau mot de passe (facultatif)">
              <input className="input" type="password" value={form.newPassword} onChange={(e) => set('newPassword', e.target.value)} placeholder="Laisser vide pour conserver" />
            </Field>
          </div>
          <div className="onb-row-field">
            <Field label="Confirmation">
              <input className="input" type="password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} disabled={!form.newPassword} />
            </Field>
          </div>
        </div>

        {error && <div className="onb-error">{error}</div>}

        <button className="btn onb-submit-btn" type="submit" disabled={busy}>
          {busy ? 'Enregistrement…' : 'Continuer vers la console'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="onb-field">
      <label className="onb-field-label">{label}</label>
      {children}
    </div>
  );
}
