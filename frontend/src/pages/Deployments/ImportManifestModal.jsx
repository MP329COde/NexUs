import { useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

const EXAMPLE = `apiVersion: nexus.dev/v1
kind: Service
metadata:
  name: billing-api
  description: API de facturation
spec:
  type: api
  lifecycle: production
  owner: team-finance
  language: TypeScript
  framework: NestJS
  repository:
    provider: github
    url: https://github.com/company/billing-api
  tags: [finance, critical]
`;

// Import déclaratif : collage d'un service.yaml (voir
// services/serviceManifest.js côté backend) plutôt que le formulaire pas à
// pas — utile pour committer la déclaration du service avec son code et la
// réimporter telle quelle. Idempotent (POST /catalog/components/import) :
// un second import du même metadata.name dans le même projet met à jour le
// composant existant au lieu d'échouer.
export default function ImportManifestModal({ projects, onClose, onImported }) {
  const notify = useNotify();
  const [legacyProjectId, setLegacyProjectId] = useState('');
  const [yaml, setYaml] = useState(EXAMPLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/catalog/components/import', { legacyProjectId, yaml });
      notify(res.created ? `${res.component.name} importé dans le catalogue` : `${res.component.name} mis à jour`, { type: 'ok' });
      onImported();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Importer un service.yaml" sub="Format déclaratif — un import répété met à jour le composant existant" onClose={onClose} width={560}>
      <form onSubmit={submit}>
        <label className="projects-form-label">Projet</label>
        <select className="input" required value={legacyProjectId} onChange={(e) => setLegacyProjectId(e.target.value)} style={{ marginBottom: 12 }}>
          <option value="">Sélectionner un projet…</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="projects-form-label">Contenu YAML</label>
        <textarea
          className="input"
          required
          rows={14}
          value={yaml}
          onChange={(e) => setYaml(e.target.value)}
          style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, marginBottom: 8, resize: 'vertical' }}
        />
        {error && <p style={{ color: 'var(--danger, #ef4444)', marginBottom: 8, fontSize: 13 }}>{error}</p>}
        <div className="projects-form-actions">
          <span className="btn-outline" onClick={onClose}>Annuler</span>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Import…' : 'Importer'}</button>
        </div>
      </form>
    </Modal>
  );
}
