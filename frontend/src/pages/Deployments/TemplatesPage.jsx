import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import ScaffolderModal from './ScaffolderModal.jsx';
import './TemplatesPage.css';

const KIND_ICON = { service: 'server', api: 'globe', website: 'box', worker: 'sync', library: 'cube', cronjob: 'clock', infrastructure: 'layers' };

// Golden paths (ÉTAPE 8/9 IDP) : un développeur choisit un template plutôt
// que de configurer lui-même dépôt + Dockerfile + CI + service.yaml — voir
// services/scaffolderTemplates.js côté backend pour le contenu généré.
export default function TemplatesPage() {
  const { data, loading, error } = useApi(() => api.get('/catalog/templates'), []);
  const [scaffolding, setScaffolding] = useState(null);

  const templates = data?.items || [];

  if (error?.status === 503) {
    return (
      <>
        <PageHeader title="Templates" sub="Golden paths pour créer un nouveau service" />
        <div className="card templates-empty">
          Les templates nécessitent le socle organisations/projets relationnel (PostgreSQL), non configuré sur cette instance.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Templates" sub="Choisissez un golden path : dépôt, Dockerfile, CI et service.yaml générés automatiquement." />

      {loading ? (
        <div className="card templates-empty">Chargement des templates…</div>
      ) : (
        <div className="templates-grid">
          {templates.map((t) => (
            <div key={t.id} className="card templates-card">
              <div className="templates-card-header">
                <Icon name={KIND_ICON[t.kind] || 'box'} size={20} style={{ color: 'var(--text-faint)' }} />
                <span className="templates-card-title">{t.name}</span>
              </div>
              <p className="faint templates-card-desc">{t.description}</p>
              <div className="templates-card-meta">
                {t.language && <span className="badge badge-mut">{t.language}</span>}
                {t.framework && <span className="badge badge-mut">{t.framework}</span>}
              </div>
              <button className="btn templates-card-btn" onClick={() => setScaffolding(t)}>
                <Icon name="plus" size={14} />Utiliser ce template
              </button>
            </div>
          ))}
        </div>
      )}

      {scaffolding && <ScaffolderModal template={scaffolding} onClose={() => setScaffolding(null)} />}
    </>
  );
}
