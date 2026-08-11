import { useState } from 'react';
import { api } from '../../lib/apiClient.js';

export default function DeploymentFormDialog({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', gitlabProjectId: '', argocdAppName: '', k8sNamespace: '', k8sDeployment: '' });
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
      await api.post('/deployments', form);
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
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Lier une application</div>

        <Field label="Nom de l'application"><input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="ID projet GitLab"><input className="input" value={form.gitlabProjectId} onChange={(e) => set('gitlabProjectId', e.target.value)} /></Field>
        <Field label="Nom application Argo CD"><input className="input" value={form.argocdAppName} onChange={(e) => set('argocdAppName', e.target.value)} /></Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><Field label="Namespace K8s"><input className="input" value={form.k8sNamespace} onChange={(e) => set('k8sNamespace', e.target.value)} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Deployment K8s"><input className="input" value={form.k8sDeployment} onChange={(e) => set('k8sDeployment', e.target.value)} /></Field></div>
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
