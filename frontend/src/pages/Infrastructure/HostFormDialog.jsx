import { useState } from 'react';
import { api } from '../../lib/apiClient.js';
import './HostFormDialog.css';

export default function HostFormDialog({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', address: '', port: 22, sshUser: 'root', role: '', critical: false });
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
    <div className="hfd-overlay" onClick={onClose}>
      <form className="card hfd-card" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="hfd-title">Ajouter un hôte</div>

        <Field label="Nom"><input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="srv-monitoring" /></Field>
        <Field label="Adresse"><input className="input" required value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="10.0.0.20" /></Field>
        <div className="hfd-row">
          <div className="hfd-row-field"><Field label="Port SSH"><input className="input" type="number" value={form.port} onChange={(e) => set('port', e.target.value)} /></Field></div>
          <div className="hfd-row-field"><Field label="Utilisateur SSH"><input className="input" value={form.sshUser} onChange={(e) => set('sshUser', e.target.value)} /></Field></div>
        </div>

        <Field label="Rôle" hint="Affiché dans la carte « Hôtes critiques » de l'accueil, ex. « Hyperviseur Proxmox »">
          <input className="input" value={form.role} onChange={(e) => set('role', e.target.value)} placeholder="Hyperviseur Proxmox" />
        </Field>

        <label className="hfd-checkbox-label">
          <input type="checkbox" checked={form.critical} onChange={(e) => set('critical', e.target.checked)} />
          Hôte critique — affiché sur la page d'accueil pour tous les administrateurs
        </label>

        <p className="faint hfd-hint">
          Assurez-vous d'avoir copié la clé publique de la console dans le fichier authorized_keys de cet utilisateur avant d'installer un agent.
        </p>

        {error && <div className="hfd-error">{error}</div>}

        <div className="hfd-actions">
          <span className="btn-outline" onClick={onClose}>Annuler</span>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="hfd-field">
      <label className="hfd-field-label">{label}</label>
      {children}
    </div>
  );
}
