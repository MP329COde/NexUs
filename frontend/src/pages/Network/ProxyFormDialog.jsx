import { useState } from 'react';
import { api } from '../../lib/apiClient.js';

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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <form className="card" style={{ width: 440, padding: 22 }} onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{proxy ? 'Modifier le proxy' : 'Nouveau proxy'}</div>

        <Field label="Nom"><input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Domaine"><input className="input" required placeholder="app.homelab.local" value={form.domain} onChange={(e) => set('domain', e.target.value)} /></Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 2 }}><Field label="Service cible"><input className="input" required value={form.targetService} onChange={(e) => set('targetService', e.target.value)} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Port"><input className="input" required type="number" value={form.targetPort} onChange={(e) => set('targetPort', e.target.value)} /></Field></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="Moteur">
              <select className="input" value={form.engine} onChange={(e) => set('engine', e.target.value)}>
                <option value="traefik">Traefik</option>
                <option value="haproxy">HAProxy</option>
              </select>
            </Field>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, paddingTop: 22 }}>
            <input type="checkbox" checked={form.tls} onChange={(e) => set('tls', e.target.checked)} id="tls" />
            <label htmlFor="tls" style={{ fontSize: 13 }}>HTTPS (TLS)</label>
          </div>
        </div>

        {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)', margin: '8px 0' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
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
