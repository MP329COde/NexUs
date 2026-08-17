import { useState } from 'react';
import { api } from '../../lib/apiClient.js';
import './ProxyFormDialog.css';

const emptyForm = { name: '', domain: '', targetService: '', targetPort: '', tls: true, engine: 'traefik', certResolver: 'default' };

export default function ProxyFormDialog({ proxy, onClose, onSaved }) {
  const [form, setForm] = useState(proxy ? { ...emptyForm, ...proxy } : emptyForm);
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
      if (proxy) await api.put(`/proxies/${proxy.id}`, form);
      else await api.post('/proxies', form);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pfd-overlay" onClick={onClose}>
      <form className="card pfd-card" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="pfd-title">{proxy ? 'Modifier le proxy' : 'Nouveau proxy'}</div>

        <Field label="Nom"><input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Domaine"><input className="input" required placeholder="app.homelab.local" value={form.domain} onChange={(e) => set('domain', e.target.value)} /></Field>
        <div className="pfd-row">
          <div className="pfd-row-service"><Field label="Service cible"><input className="input" required value={form.targetService} onChange={(e) => set('targetService', e.target.value)} /></Field></div>
          <div className="pfd-row-port"><Field label="Port"><input className="input" required type="number" value={form.targetPort} onChange={(e) => set('targetPort', e.target.value)} /></Field></div>
        </div>
        <div className="pfd-row">
          <div className="pfd-row-port">
            <Field label="Moteur">
              <select className="input" value={form.engine} onChange={(e) => set('engine', e.target.value)}>
                <option value="traefik">Traefik</option>
                <option value="haproxy">HAProxy</option>
              </select>
            </Field>
          </div>
          <div className="pfd-row-tls">
            <input type="checkbox" checked={form.tls} onChange={(e) => set('tls', e.target.checked)} id="tls" />
            <label htmlFor="tls" className="pfd-tls-label">HTTPS (TLS)</label>
          </div>
        </div>

        {error && <div className="pfd-error">{error}</div>}

        <div className="pfd-actions">
          <span className="btn-outline" onClick={onClose}>Annuler</span>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="pfd-field">
      <label className="pfd-field-label">{label}</label>
      {children}
    </div>
  );
}
