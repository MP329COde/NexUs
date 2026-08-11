import { useState } from 'react';
import { api } from '../../lib/apiClient.js';

export default function SetupPage() {
  const [form, setForm] = useState({ consoleName: 'Nexus Console', name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }
    if (form.password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }
    setBusy(true);
    try {
      await api.post('/setup', form);
      // Rechargement complet plutôt qu'une navigation client : SetupGate ne
      // revérifie needsSetup qu'au montage, ce qui provoquerait sinon une
      // redirection immédiate vers /setup juste après sa propre résolution.
      window.location.href = '/';
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 }}>
      <form onSubmit={onSubmit} className="card" style={{ width: 420, padding: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>N</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Bienvenue sur votre console</div>
        </div>
        <p style={{ margin: '0 0 22px', fontSize: 12.5, color: 'var(--text-faint)' }}>
          Aucun administrateur n'existe encore. Créez le premier compte pour terminer l'installation.
        </p>

        <Field label="Nom de la console">
          <input className="input" value={form.consoleName} onChange={(e) => set('consoleName', e.target.value)} />
        </Field>
        <Field label="Votre nom">
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Administrateur" />
        </Field>
        <Field label="Adresse e-mail">
          <input className="input" type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="Mot de passe">
              <input className="input" type="password" required value={form.password} onChange={(e) => set('password', e.target.value)} />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Confirmation">
              <input className="input" type="password" required value={form.confirm} onChange={(e) => set('confirm', e.target.value)} />
            </Field>
          </div>
        </div>

        {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)', margin: '4px 0 14px' }}>{error}</div>}

        <button className="btn" type="submit" disabled={busy} style={{ width: '100%', marginTop: 8 }}>
          {busy ? 'Création…' : 'Créer le compte administrateur'}
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
