import { useState } from 'react';
import { api } from '../../lib/apiClient.js';

export default function HostFormDialog({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', address: '', port: 22, sshUser: 'root' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/hosts', form);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <form className="card" style={{ width: 400, padding: 22 }} onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Ajouter un hôte</div>

        <Field label="Nom"><input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="srv-monitoring" /></Field>
        <Field label="Adresse"><input className="input" required value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="10.0.0.20" /></Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><Field label="Port SSH"><input className="input" type="number" value={form.port} onChange={(e) => set('port', e.target.value)} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Utilisateur SSH"><input className="input" value={form.sshUser} onChange={(e) => set('sshUser', e.target.value)} /></Field></div>
        </div>

        <p className="faint" style={{ fontSize: 11.5, margin: '4px 0 12px' }}>
          Assurez-vous d'avoir copié la clé publique de la console dans le fichier authorized_keys de cet utilisateur avant d'installer un agent.
        </p>

        {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)', marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <span className="btn-outline" onClick={onClose}>Annuler</span>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
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
