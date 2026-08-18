import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import ImportManifestModal from './ImportManifestModal.jsx';
import './CatalogPage.css';

const KINDS = [
  { value: 'service', label: 'Service' },
  { value: 'api', label: 'API' },
  { value: 'website', label: 'Site web' },
  { value: 'worker', label: 'Worker' },
  { value: 'library', label: 'Librairie' },
  { value: 'cronjob', label: 'Tâche planifiée' },
  { value: 'infrastructure', label: 'Infrastructure' }
];
const LIFECYCLES = [
  { value: 'experimental', label: 'Expérimental', badge: 'warn' },
  { value: 'production', label: 'Production', badge: 'ok' },
  { value: 'deprecated', label: 'Déprécié', badge: 'mut' }
];
const EMPTY_FORM = { legacyProjectId: '', ownerTeamId: '', name: '', description: '', kind: 'service', lifecycle: 'experimental', language: '', framework: '', repositoryUrl: '' };

function lifecycleMeta(v) { return LIFECYCLES.find((l) => l.value === v) || LIFECYCLES[0]; }
function kindLabel(v) { return KINDS.find((k) => k.value === v)?.label || v; }

// Software Catalog développeur : référence les composants applicatifs
// (services/APIs/workers/librairies...) possédés par une équipe, distinct
// du catalogue d'installation d'outils d'infrastructure (Prometheus,
// Grafana... via l'onglet Infrastructure). Backend : routes/catalog.routes.js,
// table components (voir db/migrations/0013_components.sql) — visible
// seulement pour les projets auxquels l'utilisateur a accès, comme /projects.
export default function CatalogPage() {
  const notify = useNotify();
  const { data, reload, loading, error } = useApi(() => api.get('/catalog/components'), []);
  const projects = useApi(() => api.get('/projects'), []);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  // L'équipe propriétaire proposée dépend de l'organisation du projet
  // sélectionné (une équipe appartient à une organisation, voir
  // store/orgStore.js) — récupérée en deux temps : projet → orgId → équipes.
  const projectDetail = useApi(() => (form.legacyProjectId ? api.get(`/projects/${form.legacyProjectId}`) : Promise.resolve(null)), [form.legacyProjectId]);
  const orgId = projectDetail.data?.project?.orgId;
  const teams = useApi(() => (orgId ? api.get(`/teams/org/${orgId}`) : Promise.resolve(null)), [orgId]);
  const availableTeams = teams.data?.items || [];
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState('');

  const allComponents = data?.items || [];
  const allProjects = projects.data?.items || [];

  const q = search.trim().toLowerCase();
  const components = allComponents
    .filter((c) => !kindFilter || c.kind === kindFilter)
    .filter((c) => !lifecycleFilter || c.lifecycle === lifecycleFilter)
    .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q) || (c.language || '').toLowerCase().includes(q));

  async function createComponent(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/catalog/components', { ...form, tags: [] });
      notify(`${form.name} ajouté au catalogue`, { type: 'ok' });
      setForm(EMPTY_FORM);
      setFormOpen(false);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  // 503 explicite = socle organisations non configuré (DATABASE_URL absent) :
  // état "non configuré" honnête plutôt qu'une erreur générique incompréhensible.
  if (error?.status === 503) {
    return (
      <>
        <PageHeader title="Catalogue logiciel" sub="Software Catalog développeur" />
        <div className="card catalog-empty">
          Le Software Catalog nécessite le socle organisations/projets relationnel (PostgreSQL), non configuré sur cette instance.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Catalogue logiciel"
        sub="Services, APIs, workers et librairies possédés par vos équipes."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-outline" onClick={() => setImportOpen(true)}>
              <Icon name="upload" size={14} />Importer un service.yaml
            </button>
            <button className="btn" onClick={() => setFormOpen(true)}>
              <Icon name="plus" size={14} />Déclarer un composant
            </button>
          </div>
        }
      />

      <div className="projects-kpi-grid">
        <KpiCard label="Composants" value={allComponents.length} tint="#3B82F6" />
        <KpiCard label="En production" value={allComponents.filter((c) => c.lifecycle === 'production').length} tint="#10B981" />
        <KpiCard label="Expérimentaux" value={allComponents.filter((c) => c.lifecycle === 'experimental').length} tint="#F59E0B" />
        <KpiCard label="Dépréciés" value={allComponents.filter((c) => c.lifecycle === 'deprecated').length} tint="#64748B" />
      </div>

      <div className="projects-filters-row catalog-filters-row">
        <input className="input projects-search-input" placeholder="Rechercher un composant…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input catalog-filter-select" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
          <option value="">Tous les types</option>
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        <div className="projects-status-tabs">
          {[{ value: '', label: 'Tous' }, ...LIFECYCLES].map((f) => (
            <span key={f.value} onClick={() => setLifecycleFilter(f.value)} className={`projects-status-tab${lifecycleFilter === f.value ? ' projects-status-tab-active' : ''}`}>
              {f.label}
            </span>
          ))}
        </div>
      </div>

      {formOpen && (
        <Modal title="Déclarer un composant" sub="Enregistre un service/API/worker existant dans le catalogue" onClose={() => setFormOpen(false)} width={520}>
          <form onSubmit={createComponent}>
            <label className="projects-form-label">Projet</label>
            <select className="input" required value={form.legacyProjectId} onChange={(e) => setForm((f) => ({ ...f, legacyProjectId: e.target.value, ownerTeamId: '' }))} style={{ marginBottom: 12 }}>
              <option value="">Sélectionner un projet…</option>
              {allProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {form.legacyProjectId && (
              <>
                <label className="projects-form-label">Équipe propriétaire (optionnel)</label>
                <select className="input" value={form.ownerTeamId} onChange={(e) => setForm((f) => ({ ...f, ownerTeamId: e.target.value }))} style={{ marginBottom: 12 }}>
                  <option value="">Aucune équipe définie</option>
                  {availableTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {orgId && availableTeams.length === 0 && (
                  <p className="faint" style={{ marginTop: -8, marginBottom: 12 }}>Aucune équipe dans cette organisation — créez-en une depuis la fiche organisation.</p>
                )}
              </>
            )}
            <div className="projects-form-row">
              <div className="projects-form-field-name">
                <label className="projects-form-label">Nom</label>
                <input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="billing-api" />
              </div>
              <div className="projects-form-field-desc">
                <label className="projects-form-label">Description</label>
                <input className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="API de facturation" />
              </div>
            </div>
            <div className="projects-form-row">
              <div className="projects-form-field-name">
                <label className="projects-form-label">Type</label>
                <select className="input" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
                  {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </div>
              <div className="projects-form-field-desc">
                <label className="projects-form-label">Cycle de vie</label>
                <select className="input" value={form.lifecycle} onChange={(e) => setForm((f) => ({ ...f, lifecycle: e.target.value }))}>
                  {LIFECYCLES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>
            <div className="projects-form-row">
              <div className="projects-form-field-name">
                <label className="projects-form-label">Langage</label>
                <input className="input" value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))} placeholder="TypeScript" />
              </div>
              <div className="projects-form-field-desc">
                <label className="projects-form-label">Framework</label>
                <input className="input" value={form.framework} onChange={(e) => setForm((f) => ({ ...f, framework: e.target.value }))} placeholder="NestJS" />
              </div>
            </div>
            <label className="projects-form-label">Dépôt (URL, optionnel)</label>
            <input className="input" value={form.repositoryUrl} onChange={(e) => setForm((f) => ({ ...f, repositoryUrl: e.target.value }))} placeholder="https://github.com/org/billing-api" style={{ marginBottom: 12 }} />
            <div className="projects-form-actions">
              <span className="btn-outline" onClick={() => setFormOpen(false)}>Annuler</span>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Création…' : 'Ajouter au catalogue'}</button>
            </div>
          </form>
        </Modal>
      )}

      {importOpen && (
        <ImportManifestModal projects={allProjects} onClose={() => setImportOpen(false)} onImported={reload} />
      )}

      {loading ? (
        <div className="card catalog-empty">Chargement du catalogue…</div>
      ) : components.length === 0 ? (
        <div className="card catalog-empty">
          {allComponents.length === 0 ? 'Aucun composant déclaré — commencez par en ajouter un.' : 'Aucun composant ne correspond à ce filtre.'}
        </div>
      ) : (
        <div className="projects-grid">
          {components.map((c) => {
            const lc = lifecycleMeta(c.lifecycle);
            return (
              <Link key={c.id} to={`/deployments/catalog/${c.id}`} className="card projects-card">
                <div className="projects-card-header">
                  <span className="projects-card-title">
                    <Icon name="box" size={15} style={{ color: 'var(--text-faint)' }} />
                    {c.name}
                  </span>
                  <span className={`badge badge-${lc.badge}`}><span className="dot" />{lc.label}</span>
                </div>
                <p className="faint projects-card-desc">{c.description || 'Aucune description'}</p>
                <div className="projects-card-meta">
                  <span className="projects-card-meta-item">{kindLabel(c.kind)}</span>
                  {c.language && <><span>·</span><span className="projects-card-meta-item">{c.language}</span></>}
                  <span>·</span>
                  <span className="projects-card-meta-item"><Icon name="layers" size={12} />{c.project_name}</span>
                  {c.owner_team_name && <><span>·</span><span className="projects-card-meta-item"><Icon name="users" size={12} />{c.owner_team_name}</span></>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
