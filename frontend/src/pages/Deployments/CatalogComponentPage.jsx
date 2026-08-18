import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './CatalogComponentPage.css';

const LIFECYCLE_BADGE = { experimental: 'warn', production: 'ok', deprecated: 'mut' };
const LIFECYCLE_LABEL = { experimental: 'Expérimental', production: 'Production', deprecated: 'Déprécié' };
const KIND_LABEL = { service: 'Service', api: 'API', website: 'Site web', worker: 'Worker', library: 'Librairie', cronjob: 'Tâche planifiée', infrastructure: 'Infrastructure' };

// Fiche composant : centre de travail du composant dans le Software
// Catalog. Volontairement minimale pour l'instant (métadonnées + accès
// rapide au projet parent) — les onglets déploiements/observabilité/sécurité
// se rattacheront ici au fur et à mesure que ces briques existeront pour de
// vrai côté backend (voir todo IDP : ne jamais afficher un onglet vide comme
// s'il fonctionnait).
export default function CatalogComponentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { data, error, loading } = useApi(() => api.get(`/catalog/components/${id}`), [id]);
  const [deleting, setDeleting] = useState(false);

  const component = data?.component;
  const canManage = component?.my_role === 'maintainer' || component?.my_role === 'owner';

  // Le manifeste est servi en text/yaml (pas JSON) : contourne apiClient.js,
  // conçu pour des réponses JSON — voir routes/catalog.routes.js.
  async function handleExport() {
    try {
      const res = await fetch(`/api/catalog/components/${id}/manifest`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${component.slug}.service.yaml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Supprimer « ${component.name} » du catalogue ? Cette action est irréversible.`)) return;
    setDeleting(true);
    try {
      await api.del(`/catalog/components/${id}`);
      notify('Composant supprimé du catalogue', { type: 'ok' });
      navigate('/deployments/catalog');
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <div className="card catalog-detail-empty">Chargement…</div>;
  if (error?.status === 404) return <div className="card catalog-detail-empty">Composant introuvable.</div>;
  if (error) return <div className="card catalog-detail-empty">{error.message}</div>;
  if (!component) return null;

  return (
    <>
      <PageHeader
        title={component.name}
        sub={component.description || 'Aucune description'}
        actions={(
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-outline" onClick={handleExport}>
              <Icon name="box" size={14} />Exporter en service.yaml
            </button>
            {canManage && (
              <button className="btn-outline" onClick={handleDelete} disabled={deleting}>
                <Icon name="trash" size={14} />{deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            )}
          </div>
        )}
      />

      <div className="catalog-detail-grid">
        <div className="card catalog-detail-card">
          <div className="catalog-detail-row">
            <span className="faint">Type</span>
            <span>{KIND_LABEL[component.kind] || component.kind}</span>
          </div>
          <div className="catalog-detail-row">
            <span className="faint">Cycle de vie</span>
            <span className={`badge badge-${LIFECYCLE_BADGE[component.lifecycle]}`}><span className="dot" />{LIFECYCLE_LABEL[component.lifecycle]}</span>
          </div>
          <div className="catalog-detail-row">
            <span className="faint">Projet</span>
            <span>{component.project_name}</span>
          </div>
          <div className="catalog-detail-row">
            <span className="faint">Équipe propriétaire</span>
            <span>{component.owner_team_name || 'Non définie'}</span>
          </div>
          <div className="catalog-detail-row">
            <span className="faint">Langage</span>
            <span>{component.language || '—'}</span>
          </div>
          <div className="catalog-detail-row">
            <span className="faint">Framework</span>
            <span>{component.framework || '—'}</span>
          </div>
          <div className="catalog-detail-row">
            <span className="faint">Dépôt</span>
            {component.repository_url ? (
              <a href={component.repository_url} target="_blank" rel="noreferrer">{component.repository_url}</a>
            ) : <span>—</span>}
          </div>
        </div>

        {component.scorecard && (
          <div className="card catalog-detail-card">
            <div className="catalog-scorecard-header">
              <span className={`catalog-score-badge catalog-score-${component.scorecard.score >= 80 ? 'good' : component.scorecard.score >= 50 ? 'mid' : 'low'}`} style={{ fontSize: 16, padding: '4px 10px' }}>
                {component.scorecard.score}/100
              </span>
              <span className={`badge ${component.scorecard.productionEligible ? 'badge-ok' : 'badge-crit'}`}>
                <span className="dot" />{component.scorecard.productionEligible ? 'Production eligible' : 'Production blocked'}
              </span>
            </div>
            <div className="catalog-scorecard-checks">
              {component.scorecard.checks.map((c) => (
                <div key={c.id} className="catalog-scorecard-check">
                  <Icon name={c.passed ? 'check' : 'x'} size={14} color={c.passed ? 'var(--tone-ok-fg, #10b981)' : 'var(--tone-crit-fg, #ef4444)'} />
                  <span>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
