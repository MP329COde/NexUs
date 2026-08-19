import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';
import ProjectShortcutsPanel from './ProjectShortcutsPanel.jsx';
import ProjectVaultPanel from './ProjectVaultPanel.jsx';
import './ProjectDetailPage.css';

const STATUS_LABELS = { todo: 'À faire', in_progress: 'En cours', review: 'En revue', done: 'Terminé' };
const STATUS_ORDER = ['todo', 'in_progress', 'review', 'done'];
const PROJECT_STATUS_LABELS = { active: 'Actif', paused: 'En pause', archived: 'Archivé' };
const PROJECT_STATUS_ORDER = ['active', 'paused', 'archived'];

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const notify = useNotify();
  const project = useApi(() => api.get(`/projects/${id}`), [id]);
  const tasks = useApi(() => api.get(`/projects/${id}/tasks`), [id]);
  const repos = useApi(() => api.get('/repos'), []);
  const reviews = useApi(() => api.get('/reviews'), []);
  const workspace = useApi(() => api.get(`/projects/${id}/workspace`), [id]);
  const environments = useApi(() => api.get(`/projects/${id}/environments`), [id]);
  const deployments = useApi(() => api.get(`/projects/${id}/deployments`), [id]);
  const incidents = useApi(() => api.get(`/projects/${id}/incidents`), [id]);
  const changes = useApi(() => api.get(`/projects/${id}/changes`), [id]);
  const maintenanceWindows = useApi(() => api.get(`/projects/${id}/maintenance-windows`), [id]);
  const jobs = useApi(() => api.get(`/projects/${id}/jobs`), [id], { pollMs: 10000 });
  const securityScans = useApi(() => api.get(`/projects/${id}/security-scans`), [id]);
  const members = useApi(() => api.get(`/projects/${id}/members`), [id]);
  const users = useApi(() => (user?.role === 'admin' ? api.get('/users') : Promise.resolve(null)), [user?.role]);
  const [taskTitle, setTaskTitle] = useState('');

  if (project.error) {
    return <div className="card pd-error-state">Projet introuvable ou non accessible.</div>;
  }
  const p = project.data?.project;
  const projectRole = project.data?.role || (user?.role === 'admin' ? 'owner' : null);
  if (!p) return <div className="pd-loading-state">Chargement…</div>;

  const allUsers = users.data?.items || [];
  const userName = (uid) => allUsers.find((u) => u.id === uid)?.name || (uid === user?.id ? user.name : uid);
  const linkedRepos = (repos.data?.items || []).filter((r) => p.repoKeys.includes(r.key));
  const linkedReviews = (reviews.data?.items || []).filter((r) => linkedRepos.some((lr) => lr.path === r.repo));

  async function addTask(e) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    await api.post(`/projects/${id}/tasks`, { title: taskTitle.trim() });
    setTaskTitle('');
    tasks.reload();
  }
  async function setTaskStatus(task, status) {
    await api.put(`/projects/${id}/tasks/${task.id}`, { status });
    tasks.reload();
  }
  async function assignTask(task, assigneeId) {
    await api.put(`/projects/${id}/tasks/${task.id}`, { assigneeId: assigneeId || null });
    tasks.reload();
  }
  async function removeTask(taskId) {
    await api.del(`/projects/${id}/tasks/${taskId}`);
    tasks.reload();
  }
  async function deleteProject() {
    if (!confirm(`Supprimer définitivement le projet "${p.name}" ? Cette action est irréversible.`)) return;
    try {
      await api.del(`/projects/${id}`);
      notify('Projet supprimé', { type: 'info' });
      navigate('/deployments/projects');
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }
  async function setStatus(status) {
    try {
      await api.put(`/projects/${id}`, { status });
      notify('Statut du projet mis à jour', { type: 'ok' });
      project.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }
  async function toggleRepo(key) {
    const repoKeys = p.repoKeys.includes(key) ? p.repoKeys.filter((k) => k !== key) : [...p.repoKeys, key];
    try {
      await api.put(`/projects/${id}`, { repoKeys });
      notify('Dépôts rattachés mis à jour', { type: 'ok' });
      project.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }
  async function saveDescriptionAndTags(description, tags) {
    try {
      await api.put(`/projects/${id}`, { description, tags });
      notify('Fiche projet mise à jour', { type: 'ok' });
      project.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  const taskItems = tasks.data?.items || [];

  return (
    <>
      <PageHeader
        title={(
          <span className="pd-title-row">
            {p.icon ? (
              <span className="pd-title-icon" style={{ background: p.color || 'var(--border-soft)' }}>{p.icon}</span>
            ) : (
              <span className="pd-title-dot" style={{ background: p.color || 'var(--text-faint)' }} />
            )}
            {p.name}
          </span>
        )}
        sub={p.description || 'Fiche projet'}
        actions={(
          <div className="pd-header-actions-row">
            {(user?.role === 'admin' || ['owner', 'maintainer'].includes(projectRole)) ? (
              <select className="input pd-status-select" value={p.status || 'active'} onChange={(e) => setStatus(e.target.value)}>
                {PROJECT_STATUS_ORDER.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>)}
              </select>
            ) : (
              <span className={`badge badge-${p.status === 'active' ? 'ok' : p.status === 'paused' ? 'warn' : 'mut'}`}><span className="dot" />{PROJECT_STATUS_LABELS[p.status] || p.status}</span>
            )}
            {(user?.role === 'admin' || projectRole === 'owner') && (
              <span className="btn-outline pd-delete-btn" onClick={deleteProject} title="Supprimer le projet">
                <Icon name="trash" size={13} />
              </span>
            )}
            <Link to="/deployments/projects" className="btn-outline pd-back-link">← Tous les projets</Link>
          </div>
        )}
      />

      <div className="pd-grid-row">
        <DescriptionTagsPanel
          project={p}
          canManage={user?.role === 'admin' || ['owner', 'maintainer'].includes(projectRole)}
          onSave={saveDescriptionAndTags}
        />
      </div>

      <div className="pd-grid-row">
        <Panel title="Backlog" sub="Tâches d'équipe — chacun peut s'assigner" span={8}>
          {user?.role === 'admin' || p.memberIds.includes(user?.id) ? (
            <form onSubmit={addTask} className="pd-form-row">
              <input className="input pd-form-input" placeholder="Nouvelle tâche…" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
              <button className="btn" type="submit">Ajouter</button>
            </form>
          ) : null}
          {taskItems.length === 0 ? (
            <div className="pd-empty">Aucune tâche</div>
          ) : (
            <div className="pd-list-loose">
              {taskItems.map((t) => (
                <div key={t.id} className="pd-task-row">
                  <select className="input pd-task-status" value={t.status} onChange={(e) => setTaskStatus(t, e.target.value)}>
                    {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                  <span className="pd-task-title">{t.title}</span>
                  {t.assigneeId ? (
                    <span className="badge badge-vio" style={{ cursor: 'pointer' }} onClick={() => assignTask(t, null)} title="Se désassigner">{userName(t.assigneeId)}</span>
                  ) : (
                    <span className="btn-outline pd-action-btn" onClick={() => assignTask(t, user?.id)}>S'assigner</span>
                  )}
                  <span onClick={() => removeTask(t.id)} className="pd-task-remove"><Icon name="trash" size={13} /></span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <TeamPanel
          members={members.data}
          legacyMemberIds={p.memberIds}
          userName={userName}
          allUsers={allUsers}
          projectId={id}
          canManage={user?.role === 'admin'}
          onChanged={members.reload}
        />
      </div>

      <div className="pd-grid-row">
        <Panel title="Dépôts rattachés" span={6} actions={user?.role === 'admin' && <RepoPicker allRepos={repos.data?.items || []} linkedKeys={p.repoKeys} onToggle={toggleRepo} />}>
          {linkedRepos.length === 0 ? (
            <div className="pd-empty">Aucun dépôt rattaché</div>
          ) : (
            <div className="pd-list-loose">
              {linkedRepos.map((r) => (
                <a key={r.key} href={r.webUrl} target="_blank" rel="noreferrer" className="pd-repo-link">
                  <Icon name="gitBranch" size={13} className="pd-repo-link-icon" />
                  <span className="pd-task-title">{r.name}</span>
                  <Icon name="externalLink" size={12} className="pd-repo-link-icon" />
                </a>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Revues liées" sub="MR/PR ouvertes sur les dépôts du projet" span={6}>
          {linkedReviews.length === 0 ? (
            <div className="pd-empty">Aucune revue ouverte</div>
          ) : (
            <div className="pd-list-loose">
              {linkedReviews.map((r) => (
                <a key={r.key} href={r.webUrl} target="_blank" rel="noreferrer" className="pd-repo-link">
                  <span className="pd-review-title">{r.title}</span>
                  <span className="mono faint pd-review-author">{r.author}</span>
                </a>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="pd-grid-row">
        <RepoActivityPanel repos={workspace.data?.repos || []} loading={workspace.loading} projectId={id} onChanged={workspace.reload} />
      </div>

      <div className="pd-grid-row">
        <EnvironmentsPanel
          environments={environments.data?.items || []}
          migrated={environments.data?.migrated}
          deployments={deployments.data?.items || []}
          projectId={id}
          role={projectRole}
          onChanged={deployments.reload}
        />
      </div>

      <div className="pd-grid-row">
        <IncidentsPanel
          incidents={incidents.data?.items || []}
          projectId={id}
          role={projectRole}
          onChanged={incidents.reload}
        />
      </div>

      <div className="pd-grid-row">
        <DocumentationPanel orgId={p.orgId} projectId={p.relationalProjectId} />
      </div>

      <div className="pd-grid-row">
        <DocSitesPanel projectId={id} canManage={user?.role === 'admin' || ['owner', 'maintainer'].includes(projectRole)} />
      </div>

      <div className="pd-grid-row">
        <ChangesPanel
          changes={changes.data?.items || []}
          environments={environments.data?.items || []}
          projectId={id}
          role={projectRole}
          onChanged={changes.reload}
        />
      </div>

      <div className="pd-grid-row">
        <JobsPanel
          jobs={jobs.data?.items || []}
          projectId={id}
          role={projectRole}
          onChanged={jobs.reload}
        />
      </div>

      <div className="pd-grid-row">
        <SecurityScansPanel
          scans={securityScans.data?.items || []}
          repoCount={p.repoKeys.length}
          projectId={id}
          role={projectRole}
          onChanged={securityScans.reload}
        />
      </div>

      <div className="pd-grid-row">
        <MaintenanceWindowsPanel
          windows={maintenanceWindows.data?.items || []}
          environments={environments.data?.items || []}
          projectId={id}
          role={projectRole}
          onChanged={maintenanceWindows.reload}
        />
      </div>

      {(() => {
        const isMember = user?.role === 'admin' || p.memberIds.includes(user?.id);
        return (
          <div className="pd-grid-row">
            <ProjectShortcutsPanel project={p} canManage={isMember} />
            <ProjectVaultPanel project={p} canManage={isMember} onProjectChanged={project.reload} />
          </div>
        );
      })()}

      {roleAtLeast(projectRole, 'maintainer') && (
        <div className="pd-grid-row">
          <WebhookPanel projectId={id} />
        </div>
      )}

      <ApiPreviewPanel project={p} canEdit={user?.role === 'admin'} onSaved={project.reload} />
    </>
  );
}

// Le secret n'est chargé qu'à la demande (clic sur "Afficher"), jamais au
// chargement de la page : cohérent avec la politique du coffre-fort projet
// (ProjectVaultPanel) — un secret capable d'ouvrir des incidents au nom du
// projet ne doit pas transiter par le réseau tant que personne n'en a
// explicitement besoin.
function WebhookPanel({ projectId }) {
  const notify = useNotify();
  const [webhook, setWebhook] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rotating, setRotating] = useState(false);

  async function reveal() {
    setLoading(true);
    try {
      setWebhook(await api.get(`/projects/${projectId}/webhook`));
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setLoading(false);
    }
  }

  async function rotate() {
    if (!confirm("Régénérer le secret ? L'ancienne configuration GitLab/GitHub cessera immédiatement de fonctionner.")) return;
    setRotating(true);
    try {
      const res = await api.post(`/projects/${projectId}/webhook/rotate`);
      setWebhook((w) => ({ ...w, secret: res.secret }));
      notify('Secret régénéré', { type: 'ok' });
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setRotating(false);
    }
  }

  return (
    <Panel title="Webhook" sub="Réagit automatiquement aux pipelines/workflows en échec (ouvre un incident)" span={12}>
      <div className="pd-webhook-body">
        {!webhook ? (
          <button className="btn-outline" onClick={reveal} disabled={loading}>{loading ? 'Chargement…' : 'Afficher la configuration'}</button>
        ) : (
          <div className="pd-webhook-fields">
            <div>
              <div className="faint pd-webhook-field-label">URL GitLab (Project Hooks → URL, activer "Pipeline events")</div>
              <code className="mono pd-webhook-code">{webhook.gitlabUrl}</code>
            </div>
            <div>
              <div className="faint pd-webhook-field-label">URL GitHub (Settings → Webhooks → Payload URL, événement "Workflow runs")</div>
              <code className="mono pd-webhook-code">{webhook.githubUrl}</code>
            </div>
            <div>
              <div className="faint pd-webhook-field-label">Secret (GitLab : "Secret Token" — GitHub : "Secret")</div>
              <code className="mono pd-webhook-code">{webhook.secret}</code>
            </div>
            <div>
              <button className="btn-outline pd-action-btn-danger" onClick={rotate} disabled={rotating}>
                {rotating ? 'Régénération…' : 'Régénérer le secret'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

const SEVERITY_TONE = { low: 'mut', medium: 'warn', high: 'crit', critical: 'crit' };
const SEVERITY_LABEL = { low: 'Faible', medium: 'Moyenne', high: 'Élevée', critical: 'Critique' };
const STATUS_TONE = { open: 'crit', investigating: 'warn', resolved: 'ok' };
const STATUS_LABEL = { open: 'Ouvert', investigating: 'En cours', resolved: 'Résolu' };

// Suivi opérationnel des incidents du projet (voir store/incidentStore.js) :
// gravité, état, résolution documentée. Résoudre un incident exige de
// documenter la résolution (le backend le revérifie — voir
// routes/projects.routes.js PUT /:id/incidents/:incidentId), jamais une
// simple bascule d'état silencieuse.
// Relie ce projet au wiki d'équipe de son organisation (voir WikiPage.jsx) :
// jusqu'ici trois îlots de données séparés (projets, wiki, runbook des
// incidents ci-dessus) sans aucun lien entre eux dans l'UI, alors que le
// backend supporte déjà un projectId optionnel sur une page wiki (voir
// routes/wiki.routes.js, orgStore.listWikiPages). orgId/projectId viennent
// de GET /projects/:id (résolus via le projet relationnel miroir — voir
// routes/projects.routes.js) : projectId ici est l'id RELATIONNEL du projet
// (jamais le legacy id utilisé dans l'URL de cette page), requis par la
// contrainte de clé étrangère de wiki_pages.project_id. L'un ou l'autre
// peut être null si Postgres n'est pas configuré, ou si ce projet n'a
// jamais été provisionné côté socle relationnel (échec silencieux à la
// création — voir routes/projects.routes.js POST /).
function DocumentationPanel({ orgId, projectId }) {
  const pages = useApi(
    () => (orgId && projectId ? api.get(`/wiki?orgId=${orgId}&projectId=${projectId}`) : Promise.resolve({ items: [] })),
    [orgId, projectId]
  );
  const items = pages.data?.items || [];
  const wikiLink = orgId ? `/deployments/organizations/${orgId}/wiki${projectId ? `?projectId=${projectId}` : ''}` : null;

  return (
    <Panel
      title="Documentation"
      sub={orgId && projectId ? `${items.length} page(s) liée(s) à ce projet` : 'Organisation non rattachée'}
      span={12}
      actions={wikiLink && (
        <Link to={wikiLink} className="btn-outline pd-header-action-btn">Ouvrir le wiki</Link>
      )}
    >
      {!orgId || !projectId ? (
        <div className="pd-empty">Ce projet n'est rattaché à aucune organisation — le wiki d'équipe n'est disponible que pour les projets liés à une organisation (voir Organisations).</div>
      ) : items.length === 0 ? (
        <div className="pd-empty">Aucune page wiki liée à ce projet pour le moment.</div>
      ) : (
        <div className="pd-list">
          {items.map((page) => (
            <Link key={page.id} to={wikiLink} className="pd-row pd-row-link">
              <span className="pd-row-title">{page.title}</span>
              <span className="faint pd-row-date">{new Date(page.updated_at).toLocaleDateString('fr-FR')}</span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

const DOC_SITE_LABELS = { docusaurus: 'Documentation technique (Docusaurus)', storybook: 'Design System (Storybook)' };

// Liens vers la documentation Docusaurus et le Storybook du projet —
// repositories externes gérés par la plateforme dans la cible produit,
// mais dont la création automatisée nécessite un compte GitHub de
// plateforme non fourni ici (voir backend/src/routes/projects.routes.js
// GET/PUT /:id/doc-sites) : ce panneau enregistre et affiche les liens
// saisis manuellement, en attendant la génération automatique.
function DocSitesPanel({ projectId, canManage }) {
  const notify = useNotify();
  const sites = useApi(() => api.get(`/projects/${projectId}/doc-sites`), [projectId]);
  const [editing, setEditing] = useState(null);
  const items = sites.data?.items || [];
  const siteFor = (kind) => items.find((s) => s.kind === kind);

  async function save(kind, url, repoUrl) {
    try {
      await api.put(`/projects/${projectId}/doc-sites/${kind}`, { url: url || null, repoUrl: repoUrl || null });
      notify('Lien enregistré', { type: 'ok' });
      setEditing(null);
      sites.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <Panel title="Design System & Documentation technique" sub="Docusaurus et Storybook — repositories externes gérés par la plateforme" span={12}>
      <div className="pd-list-loose" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {['docusaurus', 'storybook'].map((kind) => {
          const site = siteFor(kind);
          const isEditing = editing === kind;
          return (
            <div key={kind} className="card" style={{ padding: 12 }}>
              <div className="pd-row-title" style={{ marginBottom: 8 }}>{DOC_SITE_LABELS[kind]}</div>
              {isEditing ? (
                <DocSiteEditForm site={site} onCancel={() => setEditing(null)} onSave={(url, repoUrl) => save(kind, url, repoUrl)} />
              ) : (
                <>
                  {site?.url || site?.repo_url ? (
                    <div className="pd-list-loose">
                      {site.url && <a className="btn-outline" href={site.url} target="_blank" rel="noreferrer">Ouvrir la documentation</a>}
                      {site.repo_url && <a className="btn-outline" href={site.repo_url} target="_blank" rel="noreferrer">Voir le repository</a>}
                      {site.updated_at && <div className="faint">Dernière mise à jour : {new Date(site.updated_at).toLocaleDateString('fr-FR')}</div>}
                    </div>
                  ) : (
                    <div className="pd-empty">Aucun lien enregistré.</div>
                  )}
                  {canManage && (
                    <span className="btn-outline pd-action-btn" style={{ marginTop: 8, display: 'inline-block' }} onClick={() => setEditing(kind)}>
                      {site?.url || site?.repo_url ? 'Modifier' : 'Enregistrer un lien'}
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function DocSiteEditForm({ site, onCancel, onSave }) {
  const [url, setUrl] = useState(site?.url || '');
  const [repoUrl, setRepoUrl] = useState(site?.repo_url || '');
  return (
    <div className="pd-list-loose">
      <input className="input" placeholder="URL du site publié" value={url} onChange={(e) => setUrl(e.target.value)} />
      <input className="input" placeholder="URL du repository" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
      <div className="pd-form-row">
        <button className="btn" onClick={() => onSave(url, repoUrl)}>Enregistrer</button>
        <span className="btn-outline pd-action-btn" onClick={onCancel}>Annuler</span>
      </div>
    </div>
  );
}

function IncidentsPanel({ incidents, projectId, role, onChanged }) {
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState(null);
  const canCreate = roleAtLeast(role, 'developer');
  const canResolve = roleAtLeast(role, 'maintainer');
  const openCount = incidents.filter((i) => i.status !== 'resolved').length;

  return (
    <Panel
      title="Incidents"
      sub={openCount > 0 ? `${openCount} incident(s) ouvert(s)` : 'Aucun incident ouvert'}
      span={12}
      actions={canCreate && <span className="btn-outline pd-header-action-btn" onClick={() => setOpen(true)}>Déclarer</span>}
    >
      {incidents.length === 0 ? (
        <div className="pd-empty">Aucun incident déclaré sur ce projet.</div>
      ) : (
        <div className="pd-list">
          {incidents.map((inc) => (
            <div key={inc.id} className="pd-row">
              <span className={`badge badge-${SEVERITY_TONE[inc.severity]}`}>{SEVERITY_LABEL[inc.severity]}</span>
              <span className={`badge badge-${STATUS_TONE[inc.status]}`}><span className="dot" />{STATUS_LABEL[inc.status]}</span>
              <span className="pd-row-title">{inc.title}</span>
              {inc.runbook_url && (
                <a href={inc.runbook_url} target="_blank" rel="noreferrer" title="Ouvrir le runbook" className="pd-runbook-link">
                  <Icon name="externalLink" size={13} />
                </a>
              )}
              <span className="faint pd-row-date">{new Date(inc.created_at).toLocaleDateString('fr-FR')}</span>
              {inc.status !== 'resolved' && canResolve && (
                <span className="btn-outline pd-action-btn" onClick={() => setResolving(inc)}>Résoudre</span>
              )}
            </div>
          ))}
        </div>
      )}

      {open && (
        <DeclareIncidentModal
          onClose={() => setOpen(false)}
          onCreated={() => { setOpen(false); onChanged(); }}
          projectId={projectId}
          notify={notify}
        />
      )}
      {resolving && (
        <ResolveIncidentModal
          incident={resolving}
          onClose={() => setResolving(null)}
          onResolved={() => { setResolving(null); onChanged(); }}
          projectId={projectId}
          notify={notify}
        />
      )}
    </Panel>
  );
}

const CHANGE_STATUS_TONE = { pending: 'warn', approved: 'ok', rejected: 'crit', executed: 'mut', cancelled: 'mut' };
const CHANGE_STATUS_LABEL = { pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté', executed: 'Exécuté', cancelled: 'Annulé' };

// Changement contrôlé (voir store/changeStore.js) : distinct d'un incident
// (qui documente un problème déjà survenu) — ici, une modification
// planifiée avec impact attendu, décision et exécution séparées. Proposer
// est ouvert à developer+, décider (approuver/rejeter) à maintainer+, avec
// une garde supplémentaire côté backend si l'environnement visé est en
// production (owner requis pour approuver, pas pour rejeter) — jamais
// contournable depuis cette UI, uniquement revérifiée par le serveur.
function ChangesPanel({ changes, environments, projectId, role, onChanged }) {
  const notify = useNotify();
  const [proposing, setProposing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const canPropose = roleAtLeast(role, 'developer');
  const canDecide = roleAtLeast(role, 'maintainer');
  const pendingCount = changes.filter((c) => c.status === 'pending').length;

  async function decide(change, status) {
    setBusyId(change.id);
    try {
      await api.put(`/projects/${projectId}/changes/${change.id}/decide`, { status });
      notify(status === 'approved' ? 'Changement approuvé' : 'Changement rejeté', { type: 'ok' });
      onChanged();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusyId(null);
    }
  }

  async function execute(change) {
    setBusyId(change.id);
    try {
      await api.post(`/projects/${projectId}/changes/${change.id}/execute`);
      notify('Changement marqué comme exécuté', { type: 'ok' });
      onChanged();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusyId(null);
    }
  }

  const envName = (envId) => environments.find((e) => e.id === envId)?.name;

  return (
    <Panel
      title="Changements"
      sub={pendingCount > 0 ? `${pendingCount} en attente d'approbation` : 'Aucun changement en attente'}
      span={12}
      actions={canPropose && <span className="btn-outline pd-header-action-btn" onClick={() => setProposing(true)}>Proposer</span>}
    >
      {changes.length === 0 ? (
        <div className="pd-empty">Aucun changement proposé sur ce projet.</div>
      ) : (
        <div className="pd-list">
          {changes.map((c) => (
            <div key={c.id} className="pd-row">
              <span className={`badge badge-${CHANGE_STATUS_TONE[c.status]}`}><span className="dot" />{CHANGE_STATUS_LABEL[c.status]}</span>
              {c.environment_id && <span className="badge badge-mut">{envName(c.environment_id) || 'environnement'}</span>}
              <span className="pd-row-title">{c.title}</span>
              {c.impact && <span className="faint pd-row-date">{c.impact}</span>}
              {c.status === 'pending' && canDecide && (
                <>
                  <span className="btn-outline pd-action-btn" onClick={() => decide(c, 'approved')}>
                    {busyId === c.id ? '…' : 'Approuver'}
                  </span>
                  <span className="btn-outline pd-action-btn pd-action-btn-danger" onClick={() => decide(c, 'rejected')}>
                    Rejeter
                  </span>
                </>
              )}
              {c.status === 'approved' && canDecide && (
                <span className="btn-outline pd-action-btn" onClick={() => execute(c)}>
                  {busyId === c.id ? '…' : 'Marquer exécuté'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {proposing && (
        <ProposeChangeModal
          projectId={projectId}
          environments={environments}
          onClose={() => setProposing(false)}
          onCreated={() => { setProposing(false); onChanged(); }}
          notify={notify}
        />
      )}
    </Panel>
  );
}

function ProposeChangeModal({ projectId, environments, onClose, onCreated, notify }) {
  const [title, setTitle] = useState('');
  const [impact, setImpact] = useState('');
  const [description, setDescription] = useState('');
  const [environmentId, setEnvironmentId] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.post(`/projects/${projectId}/changes`, { title: title.trim(), impact, description, environmentId: environmentId || undefined });
      notify('Changement proposé', { type: 'ok' });
      onCreated();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Proposer un changement" onClose={onClose} width={420}>
      <form onSubmit={submit} className="pd-webhook-fields">
        <input className="input" placeholder="Titre" required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <select className="input" value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)}>
          <option value="">Aucun environnement précis</option>
          {environments.map((env) => <option key={env.id} value={env.id}>{env.name}{env.is_production ? ' (production)' : ''}</option>)}
        </select>
        <input className="input" placeholder="Impact attendu (ex. indisponibilité 5 min)" value={impact} onChange={(e) => setImpact(e.target.value)} />
        <textarea className="input" placeholder="Description (optionnel)" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Envoi…' : 'Proposer'}</button>
      </form>
    </Modal>
  );
}

const JOB_STATUS_TONE = { pending: 'mut', running: 'warn', succeeded: 'ok', failed: 'crit' };
const JOB_STATUS_LABEL = { pending: 'En attente', running: 'En cours', succeeded: 'Réussi', failed: 'Échoué' };
const JOB_TYPE_LABEL = { 'deployment.sync': 'Synchronisation', 'deployment.rollback': 'Rollback', 'security.scan': 'Scan réseau' };
const RETRYABLE_JOB_TYPES = new Set(['deployment.sync', 'deployment.rollback']);

// Historique des opérations asynchrones du projet (voir services/jobService.js) :
// un job en échec peut être relancé explicitement (POST .../jobs/:jobId/retry,
// maintainer+ requis, owner si l'action d'origine visait la production) —
// crée toujours un NOUVEAU job plutôt que de muter l'original, pour garder
// la trace de l'échec initial. idempotencyKey côté backend empêche deux
// relances concurrentes du même job (double-clic).
function JobsPanel({ jobs, projectId, role, onChanged }) {
  const notify = useNotify();
  const [retryingId, setRetryingId] = useState(null);
  const canRetry = roleAtLeast(role, 'maintainer');
  const runningCount = jobs.filter((j) => j.status === 'pending' || j.status === 'running').length;

  async function retry(job) {
    setRetryingId(job.id);
    try {
      await api.post(`/projects/${projectId}/jobs/${job.id}/retry`);
      notify('Relance lancée', { type: 'ok' });
      onChanged();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setRetryingId(null);
    }
  }

  if (jobs.length === 0) return null;

  return (
    <Panel
      title="Jobs"
      sub={runningCount > 0 ? `${runningCount} en cours` : 'Historique des opérations asynchrones'}
      span={12}
    >
      <div className="pd-list">
        {jobs.slice(0, 15).map((j) => (
          <div key={j.id} className="pd-row">
            <span className={`badge badge-${JOB_STATUS_TONE[j.status]}`}>
              {(j.status === 'running' || j.status === 'pending') && <Icon name="refresh" size={11} className="spin" />}
              {JOB_STATUS_LABEL[j.status] || j.status}
            </span>
            <span className="pd-row-title">
              {JOB_TYPE_LABEL[j.type] || j.type}
              {j.retry_of && <span className="faint pd-job-retry-tag"> (relance)</span>}
            </span>
            {j.status === 'failed' && j.error && (
              <span className="faint pd-job-error" title={j.error}>{j.error}</span>
            )}
            <span className="faint pd-row-date">{new Date(j.created_at).toLocaleString('fr-FR')}</span>
            {j.status === 'failed' && canRetry && RETRYABLE_JOB_TYPES.has(j.type) && (
              <span className="btn-outline pd-action-btn" onClick={() => retry(j)}>
                {retryingId === j.id ? '…' : 'Relancer'}
              </span>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

// DevSecOps par projet : SAST (Semgrep) + SCA (Trivy fs) + IaC (Checkov) sur
// les dépôts réellement liés au projet, exécutés en clonant temporairement
// chaque dépôt côté backend (voir routes/projects.routes.js
// GET/POST /:id/security-scans) — distinct des scans "plateforme entière"
// de Supply Chain Security.
function SecurityScansPanel({ scans, repoCount, projectId, role, onChanged }) {
  const notify = useNotify();
  const [running, setRunning] = useState(false);
  const canRun = roleAtLeast(role, 'maintainer');
  const latest = scans[0];

  async function run() {
    setRunning(true);
    try {
      await api.post(`/projects/${projectId}/security-scans`, {});
      notify('Scan de sécurité terminé', { type: 'ok' });
      onChanged();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Panel
      title="Sécurité du code (SAST / SCA / IaC)"
      sub="Semgrep, Trivy et Checkov sur les dépôts liés à ce projet"
      span={12}
      actions={canRun && (
        <span className={`btn-outline pd-header-action-btn pd-security-header${repoCount === 0 ? ' pd-security-btn-disabled' : ''}`} onClick={repoCount > 0 ? run : undefined}>
          <Icon name={running ? 'refresh' : 'shield'} size={12} className={running ? 'spin' : ''} />{running ? 'Analyse en cours…' : 'Lancer un scan'}
        </span>
      )}
    >
      {repoCount === 0 ? (
        <div className="pd-empty">Aucun dépôt rattaché à ce projet.</div>
      ) : scans.length === 0 ? (
        <div className="pd-empty">Aucun scan lancé pour l'instant.</div>
      ) : (
        <div className="pd-security-body">
          <div className="faint pd-security-scanned-at">Dernier scan : {new Date(latest.createdAt).toLocaleString('fr-FR')}</div>
          {latest.results.map((r) => (
            <div key={r.repoKey} className="pd-security-repo-block">
              <div className="mono pd-security-repo-key">{r.repoKey}</div>
              {r.error ? (
                <div className="pd-security-error">{r.error}</div>
              ) : (
                <div className="pd-security-badges">
                  <ScanResultBadge label="SAST (Semgrep)" result={r.sast} />
                  <ScanResultBadge label="SCA (Trivy)" result={r.sca} />
                  <ScanResultBadge label="IaC (Checkov)" result={r.iac} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ScanResultBadge({ label, result }) {
  if (result?.error) {
    return <div className="pd-scan-badge"><span className="faint">{label} : </span><span className="pd-scan-badge-error">{result.error}</span></div>;
  }
  const total = result?.total ?? 0;
  return (
    <div className="pd-scan-badge pd-scan-badge-row">
      <span className="faint">{label}</span>
      <span className={`badge badge-${total > 0 ? 'warn' : 'ok'}`}><span className="dot" />{total} problème(s)</span>
    </div>
  );
}

// Fenêtre de maintenance planifiée (voir store/maintenanceStore.js) : purement
// déclaratif, informe l'équipe qu'une intervention est prévue sur une période
// donnée. N'a aucun effet sur les autres gardes (ne dispense jamais de
// l'approbation owner sur un changement production) — deux notions
// distinctes, l'une informe, l'autre autorise.
const now = () => new Date();
function windowStatus(w) {
  if (w.cancelled_at) return { label: 'Annulée', tone: 'mut' };
  const start = new Date(w.starts_at);
  const end = new Date(w.ends_at);
  const n = now();
  if (n < start) return { label: 'À venir', tone: 'mut' };
  if (n >= start && n <= end) return { label: 'En cours', tone: 'warn' };
  return { label: 'Terminée', tone: 'mut' };
}

function MaintenanceWindowsPanel({ windows, environments, projectId, role, onChanged }) {
  const notify = useNotify();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const canManage = roleAtLeast(role, 'maintainer');
  const activeCount = windows.filter((w) => windowStatus(w).label === 'En cours').length;
  const envName = (envId) => environments.find((e) => e.id === envId)?.name;

  async function cancelWindow(w) {
    setBusyId(w.id);
    try {
      await api.post(`/projects/${projectId}/maintenance-windows/${w.id}/cancel`);
      notify('Fenêtre de maintenance annulée', { type: 'ok' });
      onChanged();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      title="Fenêtres de maintenance"
      sub={activeCount > 0 ? `${activeCount} en cours` : 'Aucune maintenance en cours'}
      span={12}
      actions={canManage && <span className="btn-outline pd-header-action-btn" onClick={() => setCreating(true)}>Planifier</span>}
    >
      {windows.length === 0 ? (
        <div className="pd-empty">Aucune fenêtre de maintenance planifiée sur ce projet.</div>
      ) : (
        <div className="pd-list">
          {windows.map((w) => {
            const status = windowStatus(w);
            return (
              <div key={w.id} className="pd-row">
                <span className={`badge badge-${status.tone}`}>{status.label}</span>
                {w.environment_id && <span className="badge badge-mut">{envName(w.environment_id) || 'environnement'}</span>}
                <span className="pd-row-title">{w.title}</span>
                <span className="faint pd-row-date">
                  {new Date(w.starts_at).toLocaleString('fr-FR')} → {new Date(w.ends_at).toLocaleString('fr-FR')}
                </span>
                {!w.cancelled_at && status.label !== 'Terminée' && canManage && (
                  <span className="btn-outline pd-action-btn pd-action-btn-danger" onClick={() => cancelWindow(w)}>
                    {busyId === w.id ? '…' : 'Annuler'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <PlanMaintenanceWindowModal
          projectId={projectId}
          environments={environments}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); onChanged(); }}
          notify={notify}
        />
      )}
    </Panel>
  );
}

function PlanMaintenanceWindowModal({ projectId, environments, onClose, onCreated, notify }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [environmentId, setEnvironmentId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim() || !startsAt || !endsAt) return;
    setBusy(true);
    try {
      await api.post(`/projects/${projectId}/maintenance-windows`, {
        title: title.trim(),
        description,
        environmentId: environmentId || undefined,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString()
      });
      notify('Fenêtre de maintenance planifiée', { type: 'ok' });
      onCreated();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Planifier une fenêtre de maintenance" onClose={onClose} width={420}>
      <form onSubmit={submit} className="pd-webhook-fields">
        <input className="input" placeholder="Titre" required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <select className="input" value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)}>
          <option value="">Aucun environnement précis</option>
          {environments.map((env) => <option key={env.id} value={env.id}>{env.name}{env.is_production ? ' (production)' : ''}</option>)}
        </select>
        <div className="pd-mw-time-row">
          <label className="faint pd-mw-time-field">
            Début
            <input className="input" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label className="faint pd-mw-time-field">
            Fin
            <input className="input" type="datetime-local" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
        </div>
        <textarea className="input" placeholder="Description (optionnel)" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Envoi…' : 'Planifier'}</button>
      </form>
    </Modal>
  );
}

function DeclareIncidentModal({ onClose, onCreated, projectId, notify }) {
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [runbookUrl, setRunbookUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.post(`/projects/${projectId}/incidents`, { title: title.trim(), severity, description, runbookUrl: runbookUrl.trim() || undefined });
      notify('Incident déclaré', { type: 'ok' });
      onCreated();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Déclarer un incident" onClose={onClose} width={420}>
      <form onSubmit={submit} className="pd-webhook-fields">
        <input className="input" placeholder="Titre" required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          {Object.entries(SEVERITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <textarea className="input" placeholder="Description (optionnel)" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        <input className="input" type="url" placeholder="Lien vers un runbook (optionnel)" value={runbookUrl} onChange={(e) => setRunbookUrl(e.target.value)} />
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Envoi…' : 'Déclarer'}</button>
      </form>
    </Modal>
  );
}

function ResolveIncidentModal({ incident, onClose, onResolved, projectId, notify }) {
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!resolution.trim()) return;
    setBusy(true);
    try {
      await api.put(`/projects/${projectId}/incidents/${incident.id}`, { status: 'resolved', resolution: resolution.trim() });
      notify('Incident résolu', { type: 'ok' });
      onResolved();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Résoudre : ${incident.title}`} sub="La résolution doit être documentée avant de clore l'incident" onClose={onClose} width={420}>
      <form onSubmit={submit} className="pd-webhook-fields">
        <textarea className="input" placeholder="Résolution (cause, correctif appliqué...)" required rows={4} value={resolution} onChange={(e) => setResolution(e.target.value)} autoFocus />
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Envoi…' : 'Clore l\'incident'}</button>
      </form>
    </Modal>
  );
}

// Description libre + étiquettes technologiques (langages/frameworks/outils)
// du projet. Le backend supporte déjà ces deux champs sur PUT /projects/:id
// (store/projectsStore.js, orgStore.updateProjectByLegacyId) — seule l'UI
// d'édition manquait.
function DescriptionTagsPanel({ project, canManage, onSave }) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(project.description || '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState(project.tags || []);

  function startEditing() {
    setDescription(project.description || '');
    setTags(project.tags || []);
    setEditing(true);
  }
  function addTag(e) {
    e.preventDefault();
    const value = tagInput.trim();
    if (!value || tags.includes(value)) { setTagInput(''); return; }
    setTags([...tags, value]);
    setTagInput('');
  }
  function removeTag(value) {
    setTags(tags.filter((t) => t !== value));
  }
  async function save() {
    await onSave(description, tags);
    setEditing(false);
  }

  return (
    <Panel
      title="Aperçu"
      sub="Description et étiquettes technologiques"
      span={12}
      actions={canManage && !editing ? (
        <span className="btn-outline pd-action-btn" onClick={startEditing}>Modifier</span>
      ) : null}
    >
      {editing ? (
        <div className="pd-list-loose">
          <textarea
            className="input"
            rows={3}
            placeholder="Description du projet…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <form onSubmit={addTag} className="pd-form-row">
            <input className="input pd-form-input" placeholder="Ajouter une étiquette (ex. React, PostgreSQL)…" value={tagInput} onChange={(e) => setTagInput(e.target.value)} />
            <button className="btn" type="submit">Ajouter</button>
          </form>
          <div className="pd-list-loose" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags.map((t) => (
              <span key={t} className="badge badge-vio" style={{ cursor: 'pointer' }} onClick={() => removeTag(t)} title="Retirer">{t} ×</span>
            ))}
          </div>
          <div className="pd-form-row">
            <button className="btn" onClick={save}>Enregistrer</button>
            <span className="btn-outline pd-action-btn" onClick={() => setEditing(false)}>Annuler</span>
          </div>
        </div>
      ) : (
        <div className="pd-list-loose">
          <p>{project.description || <span className="pd-empty">Aucune description</span>}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(project.tags || []).length === 0 ? (
              <span className="pd-empty">Aucune étiquette technologique</span>
            ) : (
              (project.tags || []).map((t) => <span key={t} className="badge badge-mut">{t}</span>)
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

const TEAM_ROLE_LABEL = { viewer: 'Lecture', developer: 'Développeur', maintainer: 'Mainteneur', owner: 'Propriétaire' };

// Affiche l'appartenance réelle au projet. Une fois le projet migré vers le
// socle relationnel (GET /projects/:id/members renvoie migrated: true), la
// source de vérité est project_members (avec rôle granulaire) — pas
// project.memberIds, qui n'a alors plus aucun effet sur l'accès réel (voir
// middleware/projectAccess.js) et ne doit donc plus être présenté comme
// "l'équipe" du projet pour éviter de faire croire qu'il reflète l'accès
// effectif.
function TeamPanel({ members, legacyMemberIds, userName, allUsers, projectId, canManage, onChanged }) {
  const notify = useNotify();
  const [adding, setAdding] = useState(false);
  const migrated = members?.migrated;
  const items = migrated ? members.items : null;
  const grants = useApi(() => (migrated && canManage ? api.get(`/projects/${projectId}/resource-grants`) : Promise.resolve(null)), [projectId, migrated, canManage]);
  const grantFor = (userId) => grants.data?.items?.find((g) => g.user_id === userId && g.resource === 'vault');

  async function setRole(userId, role) {
    try {
      await api.put(`/projects/${projectId}/members/${userId}`, { role });
      notify('Rôle mis à jour', { type: 'ok' });
      onChanged();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  // Octroi ponctuel d'accès au coffre-fort du projet, indépendant du rôle
  // global — utile pour un viewer/developer qui doit consulter ou éditer des
  // secrets sans être promu maintainer sur tout le reste (voir
  // orgStore.hasResourceAccess, vault.routes.js).
  async function removeMember(userId) {
    if (!confirm('Retirer ce membre du projet ?')) return;
    try {
      await api.del(`/projects/${projectId}/members/${userId}`);
      notify('Membre retiré', { type: 'info' });
      onChanged();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }
  async function setVaultGrant(userId, level) {
    try {
      await api.put(`/projects/${projectId}/resource-grants/${userId}/vault`, { level: level || undefined });
      notify(level ? 'Accès coffre-fort accordé' : 'Accès coffre-fort retiré', { type: 'ok' });
      grants.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <Panel
      title="Équipe"
      sub={migrated ? `${items.length} membre(s) — rôles granulaires` : `${legacyMemberIds.length} membre(s)`}
      span={4}
      actions={migrated && canManage && <span className="btn-outline pd-header-action-btn" onClick={() => setAdding(true)}>Ajouter</span>}
    >
      <div className="pd-team-body">
        {migrated ? (
          items.length === 0
            ? <span className="faint pd-scan-badge-inline">Aucun membre</span>
            : items.map((m) => (
                canManage ? (
                  <div key={m.user_id} className="pd-team-member-col">
                    <label className="badge badge-vio pd-team-role-badge">
                      <span className="dot" />{userName(m.user_id)}
                      <select
                        value={m.role}
                        onChange={(e) => setRole(m.user_id, e.target.value)}
                        className="pd-team-role-select"
                      >
                        {Object.entries(TEAM_ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <span onClick={() => removeMember(m.user_id)} className="pd-team-remove-icon" title="Retirer du projet">
                        <Icon name="x" size={11} />
                      </span>
                    </label>
                    {roleAtLeast(m.role, 'developer') ? null : (
                      <select
                        value={grantFor(m.user_id)?.level || ''}
                        onChange={(e) => setVaultGrant(m.user_id, e.target.value)}
                        title="Accès ponctuel au coffre-fort du projet, sans changer le rôle global"
                        className="pd-team-vault-grant"
                      >
                        <option value="">Coffre-fort : aucun accès</option>
                        <option value="read">Coffre-fort : lecture</option>
                        <option value="write">Coffre-fort : lecture + édition</option>
                      </select>
                    )}
                  </div>
                ) : (
                  <span key={m.user_id} className="badge badge-vio">
                    <span className="dot" />{userName(m.user_id)} · {TEAM_ROLE_LABEL[m.role] || m.role}
                  </span>
                )
              ))
        ) : (
          legacyMemberIds.length === 0
            ? <span className="faint pd-scan-badge-inline">Aucun membre</span>
            : legacyMemberIds.map((mid) => <span key={mid} className="badge badge-vio"><span className="dot" />{userName(mid)}</span>)
        )}
      </div>

      {adding && (
        <Modal title="Ajouter un membre" onClose={() => setAdding(false)} width={360}>
          {allUsers.filter((u) => !items.some((m) => m.user_id === u.id)).length === 0 ? (
            <div className="faint pd-team-add-empty">Tous les utilisateurs sont déjà membres.</div>
          ) : (
            <div className="pd-team-add-list">
              {allUsers.filter((u) => !items.some((m) => m.user_id === u.id)).map((u) => (
                <div key={u.id} className="pd-team-add-row">
                  <span className="pd-team-add-name">{u.name}</span>
                  <span className="btn-outline pd-action-btn" onClick={async () => { await setRole(u.id, 'developer'); setAdding(false); }}>
                    Ajouter (Développeur)
                  </span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </Panel>
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Interroge GET /projects/:id/jobs/:jobId jusqu'à ce qu'il quitte
// pending/running — 90 tentatives à 1,5 s (~2 min 15) avant d'abandonner
// pour ne jamais bloquer indéfiniment l'utilisateur devant un bouton figé
// si le job reste anormalement bloqué côté serveur.
async function pollJob(projectId, jobId, maxAttempts = 90) {
  for (let i = 0; i < maxAttempts; i++) {
    const { job } = await api.get(`/projects/${projectId}/jobs/${jobId}`);
    if (job.status === 'succeeded' || job.status === 'failed') return job;
    await sleep(1500);
  }
  throw new Error('Le job met anormalement longtemps à se terminer — vérifiez son état dans quelques instants.');
}

const ROLE_RANK = { viewer: 1, developer: 2, maintainer: 3, owner: 4 };
const roleAtLeast = (role, min) => (ROLE_RANK[role] || 0) >= (ROLE_RANK[min] || 0);

// Environnements + déploiements Argo CD rattachés au projet (socle
// relationnel — voir store/orgStore.js#listEnvironments et
// store/deploymentStore.js). N'affiche les boutons Synchroniser/Rollback que
// si le rôle local le permettrait — purement indicatif : le backend revérifie
// systématiquement le rôle ET l'appartenance du déploiement au projet à
// chaque appel (routes/projects.routes.js), donc masquer un bouton ici
// n'accorde jamais un droit que l'API refuserait.
function EnvironmentsPanel({ environments, migrated, deployments, projectId, role, onChanged }) {
  const notify = useNotify();
  const [busyId, setBusyId] = useState(null);
  const [pipelineLink, setPipelineLink] = useState(null);

  // La synchronisation peut prendre plusieurs secondes à plusieurs minutes
  // (voir services/jobService.js côté backend) : la requête POST renvoie
  // immédiatement un job en attente (202), on interroge ensuite son état
  // jusqu'à ce qu'il se termine plutôt que de prétendre que "Synchronisation
  // lancée" équivaut à "Synchronisation réussie".
  async function sync(link) {
    setBusyId(link.id);
    try {
      const { job } = await api.post(`/projects/${projectId}/deployments/${link.id}/sync`);
      const finalJob = await pollJob(projectId, job.id);
      if (finalJob.status === 'succeeded') {
        notify(`Synchronisation réussie pour ${link.name}`, { type: 'ok' });
      } else {
        notify(finalJob.error || 'Échec de la synchronisation', { type: 'crit' });
      }
      onChanged();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusyId(null);
    }
  }

  if (!migrated) {
    return (
      <Panel title="Environnements & déploiements" span={12}>
        <div className="pd-empty">
          Ce projet n'est pas encore rattaché au socle relationnel (organisations/environnements). Voir <code>npm run migrate:postgres</code> côté backend.
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Environnements & déploiements" sub="Un environnement de production exige le rôle propriétaire pour toute action" span={12}>
      {environments.length === 0 ? (
        <div className="pd-empty">Aucun environnement.</div>
      ) : (
        <div className="pd-list">
          {environments.map((env) => {
            const links = deployments.filter((l) => l.environmentId === env.id);
            const canSync = env.is_production ? roleAtLeast(role, 'owner') : roleAtLeast(role, 'maintainer');
            return (
              <div key={env.id} className="pd-env-block">
                <div className={`pd-env-block-header${links.length ? ' pd-env-block-header-spaced' : ''}`}>
                  <span className={`badge ${env.is_production ? 'badge-crit' : 'badge-mut'}`}>{env.is_production ? 'Production' : env.kind}</span>
                  <span className="pd-env-name">{env.name}</span>
                  <span className="faint pd-env-links-count">{links.length} déploiement(s) rattaché(s)</span>
                </div>
                {links.map((link) => (
                  <div key={link.id} className="pd-env-link-row">
                    <Icon name="box" size={12} className="pd-repo-link-icon" />
                    <span className="pd-env-link-name">{link.name}</span>
                    <span className="btn-outline pd-action-btn" onClick={() => setPipelineLink(link)}>Chemin réseau</span>
                    {link.argocdAppName ? (
                      canSync ? (
                        <button className="btn-outline pd-action-btn" disabled={busyId === link.id} onClick={() => sync(link)}>
                          {busyId === link.id ? '…' : 'Synchroniser'}
                        </button>
                      ) : (
                        <span className="faint pd-row-date" title="Rôle insuffisant pour cette action">Synchronisation réservée</span>
                      )
                    ) : (
                      <span className="faint pd-row-date">Aucune app Argo CD associée</span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {pipelineLink && <PipelineModal link={pipelineLink} projectId={projectId} onClose={() => setPipelineLink(null)} />}
    </Panel>
  );
}

// Chemin réseau complet d'un déploiement (Git → Argo CD → Kubernetes →
// reverse proxy) — voir GET /projects/:id/deployments/:linkId/pipeline,
// qui reconstitue chaque étape indépendamment côté backend
// (deploymentService.getPipeline). Chaque étape affiche son état exact,
// y compris "non configuré", plutôt qu'une icône générique.
function PipelineModal({ link, projectId, onClose }) {
  const { data, loading, error } = useApi(() => api.get(`/projects/${projectId}/deployments/${link.id}/pipeline`), [link.id]);
  const stages = data?.stages;

  return (
    <Modal title={`Chemin réseau — ${link.name}`} onClose={onClose} width={480}>
      {loading && <div className="pd-modal-loading">Chargement…</div>}
      {error && <div className="pd-modal-error">{error}</div>}
      {stages && (
        <div className="pd-webhook-fields">
          <PipelineStageRow
            label="Git"
            configured={stages.git.configured}
            detail={stages.git.latestPipeline ? `Dernier pipeline : ${stages.git.latestPipeline.status || '—'}` : null}
            error={stages.git.error}
          />
          <PipelineStageRow
            label="Argo CD"
            configured={stages.argocd.configured}
            detail={stages.argocd.syncStatus ? `Sync : ${stages.argocd.syncStatus} · Santé : ${stages.argocd.healthStatus || '—'}` : null}
            webUrl={stages.argocd.webUrl}
            error={stages.argocd.error}
          />
          <PipelineStageRow
            label="Kubernetes"
            configured={stages.kubernetes.configured}
            detail={stages.kubernetes.deployment ? `${stages.kubernetes.deployment.replicas ?? '?'} réplique(s)` : null}
            error={stages.kubernetes.error}
          />
          <PipelineStageRow
            label="Reverse proxy"
            configured={stages.proxy.configured}
            detail={stages.proxy.proxy ? stages.proxy.proxy.domain : null}
            error={stages.proxy.error}
          />
        </div>
      )}
    </Modal>
  );
}

function PipelineStageRow({ label, configured, detail, webUrl, error }) {
  const tone = error ? 'crit' : configured ? 'ok' : 'mut';
  const status = error ? 'Erreur' : configured ? 'Configuré' : 'Non configuré';
  return (
    <div className="pd-stage-row">
      <span className="pd-stage-label">{label}</span>
      <span className={`badge badge-${tone}`}><span className="dot" />{status}</span>
      <span className="faint pd-stage-detail" title={error || detail || ''}>
        {error || detail || ''}
      </span>
      {webUrl && <a href={webUrl} target="_blank" rel="noreferrer"><Icon name="externalLink" size={13} /></a>}
    </div>
  );
}

const PIPELINE_TONE = { success: 'ok', failed: 'crit', running: 'info', cancelled: 'mut', other: 'mut' };
const PIPELINE_LABEL = { success: 'Succès', failed: 'Échec', running: 'En cours', cancelled: 'Annulé', other: '—' };

// État réel des dépôts liés au projet (branches, dernier commit, MR/PR
// ouvertes, dernier pipeline) — voir GET /projects/:id/workspace et
// services/projectWorkspaceService.js côté backend. Un dépôt inaccessible
// (forge non configurée, token invalide, dépôt supprimé) affiche son
// message d'erreur exact plutôt que d'être masqué ou de faire planter tout
// le panneau — jamais de donnée inventée à sa place.
function RepoActivityPanel({ repos, loading, projectId, onChanged }) {
  const notify = useNotify();
  const [busyKey, setBusyKey] = useState(null);

  // Les deux actions ci-dessous appellent les routes scopées au projet
  // (POST /projects/:id/workspace/pipelines/:runKey/retry et
  // .../reviews/:reviewKey/approve — voir routes/projects.routes.js) : le
  // backend revérifie systématiquement le rôle projet ET que le dépôt ciblé
  // fait bien partie de ce projet, donc un 403 ici est un refus réel, pas
  // seulement un bouton masqué côté UI.
  async function retryPipeline(runId) {
    setBusyKey(runId);
    try {
      await api.post(`/projects/${projectId}/workspace/pipelines/${encodeURIComponent(runId)}/retry`);
      notify('Pipeline relancé', { type: 'ok' });
      onChanged();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusyKey(null);
    }
  }
  async function approveReview(reviewKey) {
    setBusyKey(reviewKey);
    try {
      await api.post(`/projects/${projectId}/workspace/reviews/${encodeURIComponent(reviewKey)}/approve`);
      notify('Revue approuvée', { type: 'ok' });
      onChanged();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Panel title="Activité des dépôts" sub="Commits, branches, revues et pipelines — par dépôt rattaché" span={12}>
      {loading ? (
        <div className="pd-empty">Chargement…</div>
      ) : repos.length === 0 ? (
        <div className="pd-empty">Aucun dépôt rattaché à ce projet.</div>
      ) : (
        <div className="pd-list">
          {repos.map((r) => (
            <div key={r.key} className="pd-repo-block">
              {r.error ? (
                <div className="pd-repo-error-row">
                  <Icon name="gitBranch" size={13} className="pd-repo-link-icon" />
                  <span className="mono pd-repo-error-key">{r.key}</span>
                  <span className="badge badge-crit" title={r.error}>Indisponible</span>
                </div>
              ) : (
                <>
                  <div className="pd-repo-head">
                    <a href={r.webUrl} target="_blank" rel="noreferrer" className="pd-repo-name-link">{r.name}</a>
                    <span className="badge badge-mut">{r.branches?.length ?? 0} branche(s)</span>
                    {r.dependencyAlerts?.length > 0 && (
                      <span className={`badge badge-${r.dependencyAlerts.some((a) => a.severity === 'critical' || a.severity === 'high') ? 'crit' : 'warn'}`} title="Dépendances vulnérables (Dependabot)">
                        {r.dependencyAlerts.length} dépendance(s) vulnérable(s)
                      </span>
                    )}
                    {r.pipelines?.[0] && (
                      <>
                        <a href={r.pipelines[0].webUrl} target="_blank" rel="noreferrer" className={`badge badge-${PIPELINE_TONE[r.pipelines[0].status]} pd-repo-pipeline-badge`}>
                          <span className="dot" />{PIPELINE_LABEL[r.pipelines[0].status]}
                        </a>
                        {r.pipelines[0].retryable && (
                          <button className="btn-outline pd-action-btn" disabled={busyKey === r.pipelines[0].id} onClick={() => retryPipeline(r.pipelines[0].id)}>
                            {busyKey === r.pipelines[0].id ? '…' : 'Relancer'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {r.commits?.[0] && (
                    <div className="pd-repo-commit-row">
                      <span className="mono">{r.commits[0].sha}</span>
                      <span className="pd-repo-commit-message">{r.commits[0].message}</span>
                      <span className="faint">{r.commits[0].author}</span>
                    </div>
                  )}
                  {r.mergeRequests?.map((mr) => {
                    const reviewKey = `${r.provider}:${r.id}:${mr.id}`;
                    return (
                      <div key={mr.id} className="pd-repo-mr-row">
                        <Icon name="gitBranch" size={12} className="pd-repo-link-icon" />
                        <a href={mr.webUrl} target="_blank" rel="noreferrer" className="pd-repo-mr-title">{mr.title}</a>
                        <span className="faint mono pd-repo-mr-branches">{mr.sourceBranch} → {mr.targetBranch}</span>
                        <button className="btn-outline pd-action-btn" disabled={busyKey === reviewKey} onClick={() => approveReview(reviewKey)}>
                          {busyKey === reviewKey ? '…' : 'Approuver'}
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// Rendu via le Modal partagé (portail hors de la page) plutôt qu'une carte
// en position absolue : imbriquée dans un Panel (overflow: hidden), une
// liste de dépôts un peu longue se retrouvait coupée net au lieu de défiler.
function RepoPicker({ allRepos, linkedKeys, onToggle }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span className="btn-outline pd-header-action-btn" onClick={() => setOpen(true)}>Rattacher</span>
      {open && (
        <Modal title="Rattacher des dépôts" sub="Cochez les dépôts liés à ce projet" onClose={() => setOpen(false)} width={380}>
          {allRepos.length === 0 ? (
            <div className="pd-picker-empty">Aucun dépôt disponible</div>
          ) : (
            <div className="pd-team-member-col">
              {allRepos.map((r) => (
                <label key={r.key} className="pd-picker-row">
                  <input type="checkbox" checked={linkedKeys.includes(r.key)} onChange={() => onToggle(r.key)} />
                  {r.name}
                </label>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

// Panneau "endpoints + logs en direct" : liste d'endpoints saisie par
// l'équipe (réelle, pas de découverte automatique) + lecture en direct des
// logs d'un pod Kubernetes réel rattaché au projet (mêmes endpoints que
// Kubernetes → Charges de travail), tant que ce panneau reste ouvert.
function ApiPreviewPanel({ project, canEdit, onSaved }) {
  const [namespace, setNamespace] = useState(project.k8sNamespace || '');
  const [podName, setPodName] = useState('');
  const [logs, setLogs] = useState(null);
  const [live, setLive] = useState(false);
  const pods = useApi(() => (namespace ? api.get(`/kubernetes/pods?namespace=${encodeURIComponent(namespace)}`) : Promise.resolve(null)), [namespace]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!live || !namespace || !podName) return undefined;
    const fetchLogs = () => api.get(`/kubernetes/pods/${namespace}/${podName}/logs?tail=200`).then((r) => setLogs(r.logs)).catch((err) => setLogs(`Erreur: ${err.message}`));
    fetchLogs();
    timerRef.current = setInterval(fetchLogs, 4000);
    return () => clearInterval(timerRef.current);
  }, [live, namespace, podName]);

  async function saveNamespace() {
    await api.put(`/projects/${project.id}`, { k8sNamespace: namespace });
    onSaved();
  }

  return (
    <Panel title="Endpoints & logs en direct" sub="Prévisualisation API du projet" span={12}>
      <div className="pd-webhook-body">
        {canEdit && (
          <div className="pd-api-namespace-row">
            <div className="pd-api-namespace-field">
              <label className="pd-api-field-label">Namespace Kubernetes rattaché</label>
              <input className="input" value={namespace} onChange={(e) => setNamespace(e.target.value)} placeholder="prod-api-gateway" />
            </div>
            <button className="btn-outline" onClick={saveNamespace}>Enregistrer</button>
          </div>
        )}

        {namespace ? (
          <div className="pd-api-pod-row">
            <select className="input pd-api-pod-select" value={podName} onChange={(e) => setPodName(e.target.value)}>
              <option value="">Sélectionner un pod…</option>
              {(pods.data?.items || []).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
            <button className={live ? 'btn' : 'btn-outline'} onClick={() => setLive((v) => !v)} disabled={!podName}>
              {live ? 'Arrêter le direct' : 'Voir les logs en direct'}
            </button>
            {live && <span className="badge badge-ok"><span className="dot pd-api-live-dot" />LIVE — tant que la page reste ouverte</span>}
          </div>
        ) : (
          <div className="faint pd-api-no-namespace">Aucun namespace Kubernetes rattaché à ce projet.</div>
        )}

        {logs !== null && (
          <pre className="mono pd-api-logs">
            {logs || '(aucun log)'}
          </pre>
        )}
      </div>
    </Panel>
  );
}
