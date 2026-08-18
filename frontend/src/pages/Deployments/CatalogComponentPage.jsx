import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './CatalogComponentPage.css';

const LIFECYCLE_BADGE = { experimental: 'warn', production: 'ok', deprecated: 'mut' };
const LIFECYCLE_LABEL = { experimental: 'Expérimental', production: 'Production', deprecated: 'Déprécié' };
const KIND_LABEL = { service: 'Service', api: 'API', website: 'Site web', worker: 'Worker', library: 'Librairie', cronjob: 'Tâche planifiée', infrastructure: 'Infrastructure' };
const DEP_KIND_LABEL = { runtime: 'runtime', build: 'build', data: 'data' };
const BINDING_TYPE_LABEL = { postgres: 'PostgreSQL', redis: 'Redis', object_storage: 'Stockage objet', api: 'API', other: 'Autre' };

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
  const deps = useApi(() => api.get(`/catalog/components/${id}/dependencies`), [id]);
  const policyCheck = useApi(() => api.get(`/catalog/components/${id}/policy-check`), [id]);
  const allComponents = useApi(() => api.get('/catalog/components'), []);
  const [addingDep, setAddingDep] = useState(false);
  const [depTarget, setDepTarget] = useState('');
  const [depKind, setDepKind] = useState('runtime');
  const [depBusy, setDepBusy] = useState(false);
  const bindings = useApi(() => api.get(`/catalog/components/${id}/bindings`), [id]);
  const [addingBinding, setAddingBinding] = useState(false);
  const [bindingForm, setBindingForm] = useState({ bindingType: 'postgres', envVarName: '', vaultEntryId: '', description: '' });
  const [bindingBusy, setBindingBusy] = useState(false);

  const component = data?.component;
  const canManage = component?.my_role === 'maintainer' || component?.my_role === 'owner';
  const dependsOn = deps.data?.dependsOn || [];
  const dependents = deps.data?.dependents || [];
  const dependencyCandidates = (allComponents.data?.items || []).filter(
    (c) => c.id !== id && !dependsOn.some((d) => d.component_id === c.id)
  );
  const projectVault = useApi(
    () => (component?.project_legacy_id ? api.get(`/projects/${component.project_legacy_id}/vault`) : Promise.resolve(null)),
    [component?.project_legacy_id]
  );
  const vaultEntries = projectVault.data?.items || [];
  const componentBindings = bindings.data?.items || [];

  async function addBinding(e) {
    e.preventDefault();
    setBindingBusy(true);
    try {
      await api.post(`/catalog/components/${id}/bindings`, { ...bindingForm, vaultEntryId: bindingForm.vaultEntryId || null });
      notify('Binding ajouté', { type: 'ok' });
      setBindingForm({ bindingType: 'postgres', envVarName: '', vaultEntryId: '', description: '' });
      setAddingBinding(false);
      bindings.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBindingBusy(false);
    }
  }

  async function removeBinding(bindingId) {
    try {
      await api.del(`/catalog/components/${id}/bindings/${bindingId}`);
      notify('Binding retiré', { type: 'info' });
      bindings.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function addDependency(e) {
    e.preventDefault();
    if (!depTarget) return;
    setDepBusy(true);
    try {
      await api.post(`/catalog/components/${id}/dependencies`, { dependsOnComponentId: depTarget, kind: depKind });
      notify('Dépendance ajoutée', { type: 'ok' });
      setDepTarget('');
      setAddingDep(false);
      deps.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setDepBusy(false);
    }
  }

  async function removeDependency(depId) {
    try {
      await api.del(`/catalog/components/${id}/dependencies/${depId}`);
      notify('Dépendance retirée', { type: 'info' });
      deps.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

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

        {policyCheck.data && (
          <div className="card catalog-detail-card">
            <div className="catalog-deps-header">
              <span className="faint">Policy Engine (ÉTAPE 16 IDP)</span>
              <span className="btn-outline catalog-deps-add-btn" onClick={() => policyCheck.reload()}>
                <Icon name="sync" size={12} />Réévaluer
              </span>
            </div>
            {policyCheck.data.results.length === 0 ? (
              <p className="faint catalog-deps-empty">Aucune policy activée pour l'organisation de ce composant — voir Paramètres → Policies.</p>
            ) : (
              <>
                <span className={`badge ${policyCheck.data.allowed ? 'badge-ok' : 'badge-crit'}`} style={{ marginBottom: 10, display: 'inline-flex' }}>
                  <span className="dot" />{policyCheck.data.allowed ? 'ALLOWED' : 'BLOCKED'}
                </span>
                <div className="catalog-scorecard-checks">
                  {policyCheck.data.results.map((r) => (
                    <div key={r.policyId} className="catalog-scorecard-check">
                      <Icon name={r.passed ? 'check' : 'x'} size={14} color={r.passed ? 'var(--tone-ok-fg, #10b981)' : 'var(--tone-crit-fg, #ef4444)'} />
                      <span>{r.name}{r.detail ? ` — ${r.detail}` : ''}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="card catalog-detail-card">
          <div className="catalog-deps-header">
            <span className="faint">Dépendances (ÉTAPE 14 IDP)</span>
            {canManage && !addingDep && (
              <span className="btn-outline catalog-deps-add-btn" onClick={() => setAddingDep(true)}>
                <Icon name="plus" size={12} />Ajouter
              </span>
            )}
          </div>

          {addingDep && (
            <form onSubmit={addDependency} className="catalog-deps-form">
              <select className="input" required value={depTarget} onChange={(e) => setDepTarget(e.target.value)}>
                <option value="">Ce composant dépend de…</option>
                {dependencyCandidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.project_name})</option>)}
              </select>
              <select className="input" value={depKind} onChange={(e) => setDepKind(e.target.value)}>
                <option value="runtime">runtime</option>
                <option value="build">build</option>
                <option value="data">data</option>
              </select>
              <div className="projects-form-actions">
                <span className="btn-outline" onClick={() => setAddingDep(false)}>Annuler</span>
                <button className="btn" type="submit" disabled={depBusy}>{depBusy ? 'Ajout…' : 'Ajouter'}</button>
              </div>
            </form>
          )}

          <div className="catalog-deps-section">
            <div className="faint catalog-deps-section-title">Dépend de ({dependsOn.length})</div>
            {dependsOn.length === 0 ? (
              <p className="faint catalog-deps-empty">Aucune dépendance déclarée.</p>
            ) : dependsOn.map((d) => (
              <div key={d.id} className="catalog-deps-row">
                <Link to={`/deployments/catalog/${d.component_id}`} className="catalog-deps-link">
                  <Icon name="box" size={12} />{d.name}
                </Link>
                <span className="badge badge-mut">{DEP_KIND_LABEL[d.kind]}</span>
                {canManage && (
                  <span className="btn-outline catalog-deps-remove-btn" onClick={() => removeDependency(d.id)}>
                    <Icon name="trash" size={11} />
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="catalog-deps-section">
            <div className="faint catalog-deps-section-title">Dont dépend ({dependents.length})</div>
            {dependents.length === 0 ? (
              <p className="faint catalog-deps-empty">Aucun composant ne dépend de celui-ci.</p>
            ) : dependents.map((d) => (
              <div key={d.id} className="catalog-deps-row">
                <Link to={`/deployments/catalog/${d.component_id}`} className="catalog-deps-link">
                  <Icon name="box" size={12} />{d.name}
                </Link>
                <span className="badge badge-mut">{DEP_KIND_LABEL[d.kind]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card catalog-detail-card">
          <div className="catalog-deps-header">
            <span className="faint">Service Bindings (ÉTAPE 15 IDP)</span>
            {canManage && !addingBinding && (
              <span className="btn-outline catalog-deps-add-btn" onClick={() => setAddingBinding(true)}>
                <Icon name="plus" size={12} />Ajouter
              </span>
            )}
          </div>

          {addingBinding && (
            <form onSubmit={addBinding} className="catalog-deps-form">
              <select className="input" value={bindingForm.bindingType} onChange={(e) => setBindingForm((f) => ({ ...f, bindingType: e.target.value }))}>
                {Object.entries(BINDING_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input
                className="input mono"
                required
                placeholder="DATABASE_URL"
                value={bindingForm.envVarName}
                onChange={(e) => setBindingForm((f) => ({ ...f, envVarName: e.target.value.toUpperCase() }))}
              />
              <select className="input" value={bindingForm.vaultEntryId} onChange={(e) => setBindingForm((f) => ({ ...f, vaultEntryId: e.target.value }))}>
                <option value="">Sans secret relié</option>
                {vaultEntries.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
              <input className="input" placeholder="Description (optionnel)" value={bindingForm.description} onChange={(e) => setBindingForm((f) => ({ ...f, description: e.target.value }))} />
              <div className="projects-form-actions">
                <span className="btn-outline" onClick={() => setAddingBinding(false)}>Annuler</span>
                <button className="btn" type="submit" disabled={bindingBusy}>{bindingBusy ? 'Ajout…' : 'Ajouter'}</button>
              </div>
            </form>
          )}

          {componentBindings.length === 0 ? (
            <p className="faint catalog-deps-empty">Aucun binding déclaré.</p>
          ) : componentBindings.map((b) => (
            <div key={b.id} className="catalog-deps-row">
              <span className="catalog-deps-link mono">{b.env_var_name}</span>
              <span className="badge badge-mut">{BINDING_TYPE_LABEL[b.binding_type]}</span>
              {b.vault_entry_label ? (
                <span className="faint" style={{ fontSize: 12 }}><Icon name="lock" size={11} />{b.vault_entry_label}</span>
              ) : (
                <span className="faint" style={{ fontSize: 12 }}>Sans secret relié</span>
              )}
              {canManage && (
                <span className="btn-outline catalog-deps-remove-btn" onClick={() => removeBinding(b.id)}>
                  <Icon name="trash" size={11} />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
