import { useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { api } from '../../lib/apiClient.js';

export default function DeploymentFormDialog({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', gitProvider: 'gitlab', gitlabProjectId: '', githubOwner: '', githubRepo: '', argocdAppName: '', k8sNamespace: '', k8sDeployment: '' });
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
    <Modal
      title="Lier une application"
      sub="Rattache un dépôt Git, une application Argo CD et un déploiement Kubernetes"
      onClose={onClose}
      width={460}
      actions={(
        <>
          <span className="btn-outline" onClick={onClose}>Annuler</span>
          <button className="btn" type="submit" form="deployment-form" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      )}
    >
      <form id="deployment-form" onSubmit={onSubmit}>
        <Field label="Nom de l'application"><input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>

        <Field label="Fournisseur Git">
          <select className="input" value={form.gitProvider} onChange={(e) => set('gitProvider', e.target.value)}>
            <option value="gitlab">GitLab</option>
            <option value="github">GitHub</option>
          </select>
        </Field>

        {form.gitProvider === 'gitlab' ? (
          <Field label="ID projet GitLab"><input className="input" value={form.gitlabProjectId} onChange={(e) => set('gitlabProjectId', e.target.value)} /></Field>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="Propriétaire GitHub"><input className="input" placeholder="org-ou-utilisateur" value={form.githubOwner} onChange={(e) => set('githubOwner', e.target.value)} /></Field></div>
            <div style={{ flex: 1 }}><Field label="Dépôt GitHub"><input className="input" placeholder="mon-app" value={form.githubRepo} onChange={(e) => set('githubRepo', e.target.value)} /></Field></div>
          </div>
        )}

        <Field label="Nom application Argo CD"><input className="input" value={form.argocdAppName} onChange={(e) => set('argocdAppName', e.target.value)} /></Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><Field label="Namespace K8s"><input className="input" value={form.k8sNamespace} onChange={(e) => set('k8sNamespace', e.target.value)} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Deployment K8s"><input className="input" value={form.k8sDeployment} onChange={(e) => set('k8sDeployment', e.target.value)} /></Field></div>
        </div>

        {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)', margin: '8px 0 0' }}>{error}</div>}
      </form>
    </Modal>
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
