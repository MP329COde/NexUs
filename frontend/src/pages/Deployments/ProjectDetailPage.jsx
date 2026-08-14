import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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

const STATUS_LABELS = { todo: 'À faire', in_progress: 'En cours', review: 'En revue', done: 'Terminé' };
const STATUS_ORDER = ['todo', 'in_progress', 'review', 'done'];

export default function ProjectDetailPage() {
  const { id } = useParams();
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
  const members = useApi(() => api.get(`/projects/${id}/members`), [id]);
  const users = useApi(() => (user?.role === 'admin' ? api.get('/users') : Promise.resolve(null)), [user?.role]);
  const [taskTitle, setTaskTitle] = useState('');

  if (project.error) {
    return <div className="card" style={{ padding: 30, textAlign: 'center' }}>Projet introuvable ou non accessible.</div>;
  }
  const p = project.data?.project;
  const projectRole = project.data?.role || (user?.role === 'admin' ? 'owner' : null);
  if (!p) return <div style={{ padding: 30, fontSize: 13, color: 'var(--text-faint)' }}>Chargement…</div>;

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

  const taskItems = tasks.data?.items || [];

  return (
    <>
      <PageHeader
        title={p.name}
        sub={p.description || 'Fiche projet'}
        actions={<Link to="/deployments/projects" className="btn-outline" style={{ textDecoration: 'none' }}>← Tous les projets</Link>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16, marginBottom: 16 }}>
        <Panel title="Backlog" sub="Tâches d'équipe — chacun peut s'assigner" span={8}>
          {user?.role === 'admin' || p.memberIds.includes(user?.id) ? (
            <form onSubmit={addTask} style={{ display: 'flex', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border-soft)' }}>
              <input className="input" placeholder="Nouvelle tâche…" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} style={{ flex: 1 }} />
              <button className="btn" type="submit">Ajouter</button>
            </form>
          ) : null}
          {taskItems.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Aucune tâche</div>
          ) : (
            <div style={{ padding: 6 }}>
              {taskItems.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px' }}>
                  <select className="input" value={t.status} onChange={(e) => setTaskStatus(t, e.target.value)} style={{ height: 28, fontSize: 11.5, width: 110 }}>
                    {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                  <span style={{ flex: 1, fontSize: 12.5 }}>{t.title}</span>
                  {t.assigneeId ? (
                    <span className="badge badge-vio" style={{ cursor: 'pointer' }} onClick={() => assignTask(t, null)} title="Se désassigner">{userName(t.assigneeId)}</span>
                  ) : (
                    <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11 }} onClick={() => assignTask(t, user?.id)}>S'assigner</span>
                  )}
                  <span onClick={() => removeTask(t.id)} style={{ cursor: 'pointer', color: 'var(--text-faintest)' }}><Icon name="trash" size={13} /></span>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16, marginBottom: 16 }}>
        <Panel title="Dépôts rattachés" span={6} actions={user?.role === 'admin' && <RepoPicker allRepos={repos.data?.items || []} linkedKeys={p.repoKeys} onToggle={toggleRepo} />}>
          {linkedRepos.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Aucun dépôt rattaché</div>
          ) : (
            <div style={{ padding: 6 }}>
              {linkedRepos.map((r) => (
                <a key={r.key} href={r.webUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', textDecoration: 'none', color: 'inherit' }}>
                  <Icon name="gitBranch" size={13} style={{ color: 'var(--text-faint)' }} />
                  <span style={{ flex: 1, fontSize: 12.5 }}>{r.name}</span>
                  <Icon name="externalLink" size={12} style={{ color: 'var(--text-faint)' }} />
                </a>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Revues liées" sub="MR/PR ouvertes sur les dépôts du projet" span={6}>
          {linkedReviews.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Aucune revue ouverte</div>
          ) : (
            <div style={{ padding: 6 }}>
              {linkedReviews.map((r) => (
                <a key={r.key} href={r.webUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', textDecoration: 'none', color: 'inherit' }}>
                  <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  <span className="mono faint" style={{ fontSize: 11 }}>{r.author}</span>
                </a>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16, marginBottom: 16 }}>
        <RepoActivityPanel repos={workspace.data?.repos || []} loading={workspace.loading} projectId={id} onChanged={workspace.reload} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16, marginBottom: 16 }}>
        <EnvironmentsPanel
          environments={environments.data?.items || []}
          migrated={environments.data?.migrated}
          deployments={deployments.data?.items || []}
          projectId={id}
          role={projectRole}
          onChanged={deployments.reload}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16, marginBottom: 16 }}>
        <IncidentsPanel
          incidents={incidents.data?.items || []}
          projectId={id}
          role={projectRole}
          onChanged={incidents.reload}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16, marginBottom: 16 }}>
        <ChangesPanel
          changes={changes.data?.items || []}
          environments={environments.data?.items || []}
          projectId={id}
          role={projectRole}
          onChanged={changes.reload}
        />
      </div>

      {(() => {
        const isMember = user?.role === 'admin' || p.memberIds.includes(user?.id);
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16, marginBottom: 16 }}>
            <ProjectShortcutsPanel project={p} canManage={isMember} />
            <ProjectVaultPanel project={p} canManage={isMember} />
          </div>
        );
      })()}

      {roleAtLeast(projectRole, 'maintainer') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16, marginBottom: 16 }}>
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
      <div style={{ padding: 16 }}>
        {!webhook ? (
          <button className="btn-outline" onClick={reveal} disabled={loading}>{loading ? 'Chargement…' : 'Afficher la configuration'}</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div className="faint" style={{ fontSize: 11, marginBottom: 3 }}>URL GitLab (Project Hooks → URL, activer "Pipeline events")</div>
              <code className="mono" style={{ fontSize: 12 }}>{webhook.gitlabUrl}</code>
            </div>
            <div>
              <div className="faint" style={{ fontSize: 11, marginBottom: 3 }}>URL GitHub (Settings → Webhooks → Payload URL, événement "Workflow runs")</div>
              <code className="mono" style={{ fontSize: 12 }}>{webhook.githubUrl}</code>
            </div>
            <div>
              <div className="faint" style={{ fontSize: 11, marginBottom: 3 }}>Secret (GitLab : "Secret Token" — GitHub : "Secret")</div>
              <code className="mono" style={{ fontSize: 12 }}>{webhook.secret}</code>
            </div>
            <div>
              <button className="btn-outline" style={{ color: 'var(--tone-crit-fg)' }} onClick={rotate} disabled={rotating}>
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
      actions={canCreate && <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, cursor: 'pointer' }} onClick={() => setOpen(true)}>Déclarer</span>}
    >
      {incidents.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Aucun incident déclaré sur ce projet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {incidents.map((inc) => (
            <div key={inc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border-soft)' }}>
              <span className={`badge badge-${SEVERITY_TONE[inc.severity]}`}>{SEVERITY_LABEL[inc.severity]}</span>
              <span className={`badge badge-${STATUS_TONE[inc.status]}`}><span className="dot" />{STATUS_LABEL[inc.status]}</span>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}>{inc.title}</span>
              <span className="faint" style={{ fontSize: 11 }}>{new Date(inc.created_at).toLocaleDateString('fr-FR')}</span>
              {inc.status !== 'resolved' && canResolve && (
                <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11, cursor: 'pointer' }} onClick={() => setResolving(inc)}>Résoudre</span>
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
      actions={canPropose && <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, cursor: 'pointer' }} onClick={() => setProposing(true)}>Proposer</span>}
    >
      {changes.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Aucun changement proposé sur ce projet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {changes.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border-soft)' }}>
              <span className={`badge badge-${CHANGE_STATUS_TONE[c.status]}`}><span className="dot" />{CHANGE_STATUS_LABEL[c.status]}</span>
              {c.environment_id && <span className="badge badge-mut">{envName(c.environment_id) || 'environnement'}</span>}
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}>{c.title}</span>
              {c.impact && <span className="faint" style={{ fontSize: 11 }}>{c.impact}</span>}
              {c.status === 'pending' && canDecide && (
                <>
                  <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11, cursor: 'pointer' }} onClick={() => decide(c, 'approved')}>
                    {busyId === c.id ? '…' : 'Approuver'}
                  </span>
                  <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11, cursor: 'pointer', color: 'var(--tone-crit-fg)' }} onClick={() => decide(c, 'rejected')}>
                    Rejeter
                  </span>
                </>
              )}
              {c.status === 'approved' && canDecide && (
                <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11, cursor: 'pointer' }} onClick={() => execute(c)}>
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
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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

function DeclareIncidentModal({ onClose, onCreated, projectId, notify }) {
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.post(`/projects/${projectId}/incidents`, { title: title.trim(), severity, description });
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
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input className="input" placeholder="Titre" required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          {Object.entries(SEVERITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <textarea className="input" placeholder="Description (optionnel)" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
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
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <textarea className="input" placeholder="Résolution (cause, correctif appliqué...)" required rows={4} value={resolution} onChange={(e) => setResolution(e.target.value)} autoFocus />
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Envoi…' : 'Clore l\'incident'}</button>
      </form>
    </Modal>
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

  async function setRole(userId, role) {
    try {
      await api.put(`/projects/${projectId}/members/${userId}`, { role });
      notify('Rôle mis à jour', { type: 'ok' });
      onChanged();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <Panel
      title="Équipe"
      sub={migrated ? `${items.length} membre(s) — rôles granulaires` : `${legacyMemberIds.length} membre(s)`}
      span={4}
      actions={migrated && canManage && <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, cursor: 'pointer' }} onClick={() => setAdding(true)}>Ajouter</span>}
    >
      <div style={{ padding: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {migrated ? (
          items.length === 0
            ? <span className="faint" style={{ fontSize: 12.5 }}>Aucun membre</span>
            : items.map((m) => (
                canManage ? (
                  <label key={m.user_id} className="badge badge-vio" style={{ gap: 4 }}>
                    <span className="dot" />{userName(m.user_id)}
                    <select
                      value={m.role}
                      onChange={(e) => setRole(m.user_id, e.target.value)}
                      style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: 11, cursor: 'pointer' }}
                    >
                      {Object.entries(TEAM_ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                ) : (
                  <span key={m.user_id} className="badge badge-vio">
                    <span className="dot" />{userName(m.user_id)} · {TEAM_ROLE_LABEL[m.role] || m.role}
                  </span>
                )
              ))
        ) : (
          legacyMemberIds.length === 0
            ? <span className="faint" style={{ fontSize: 12.5 }}>Aucun membre</span>
            : legacyMemberIds.map((mid) => <span key={mid} className="badge badge-vio"><span className="dot" />{userName(mid)}</span>)
        )}
      </div>

      {adding && (
        <Modal title="Ajouter un membre" onClose={() => setAdding(false)} width={360}>
          {allUsers.filter((u) => !items.some((m) => m.user_id === u.id)).length === 0 ? (
            <div className="faint" style={{ fontSize: 12.5, textAlign: 'center', padding: 10 }}>Tous les utilisateurs sont déjà membres.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {allUsers.filter((u) => !items.some((m) => m.user_id === u.id)).map((u) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', fontSize: 12.5 }}>
                  <span style={{ flex: 1 }}>{u.name}</span>
                  <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11, cursor: 'pointer' }} onClick={async () => { await setRole(u.id, 'developer'); setAdding(false); }}>
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
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>
          Ce projet n'est pas encore rattaché au socle relationnel (organisations/environnements). Voir <code>npm run migrate:postgres</code> côté backend.
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Environnements & déploiements" sub="Un environnement de production exige le rôle propriétaire pour toute action" span={12}>
      {environments.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Aucun environnement.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {environments.map((env) => {
            const links = deployments.filter((l) => l.environmentId === env.id);
            const canSync = env.is_production ? roleAtLeast(role, 'owner') : roleAtLeast(role, 'maintainer');
            return (
              <div key={env.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-soft)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: links.length ? 6 : 0 }}>
                  <span className={`badge ${env.is_production ? 'badge-crit' : 'badge-mut'}`}>{env.is_production ? 'Production' : env.kind}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{env.name}</span>
                  <span className="faint" style={{ fontSize: 11.5, flex: 1 }}>{links.length} déploiement(s) rattaché(s)</span>
                </div>
                {links.map((link) => (
                  <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 4px 8px', fontSize: 12 }}>
                    <Icon name="box" size={12} style={{ color: 'var(--text-faint)' }} />
                    <span style={{ flex: 1 }}>{link.name}</span>
                    <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11, cursor: 'pointer' }} onClick={() => setPipelineLink(link)}>Chemin réseau</span>
                    {link.argocdAppName ? (
                      canSync ? (
                        <button className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11 }} disabled={busyId === link.id} onClick={() => sync(link)}>
                          {busyId === link.id ? '…' : 'Synchroniser'}
                        </button>
                      ) : (
                        <span className="faint" style={{ fontSize: 11 }} title="Rôle insuffisant pour cette action">Synchronisation réservée</span>
                      )
                    ) : (
                      <span className="faint" style={{ fontSize: 11 }}>Aucune app Argo CD associée</span>
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
      {loading && <div style={{ padding: 10, fontSize: 12.5, color: 'var(--text-faint)' }}>Chargement…</div>}
      {error && <div style={{ padding: 10, fontSize: 12.5, color: 'var(--tone-crit-fg)' }}>{error}</div>}
      {stages && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
      <span style={{ width: 110, fontSize: 12.5, fontWeight: 600 }}>{label}</span>
      <span className={`badge badge-${tone}`}><span className="dot" />{status}</span>
      <span className="faint" style={{ flex: 1, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={error || detail || ''}>
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
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Chargement…</div>
      ) : repos.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Aucun dépôt rattaché à ce projet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {repos.map((r) => (
            <div key={r.key} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-soft)' }}>
              {r.error ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="gitBranch" size={13} style={{ color: 'var(--text-faint)' }} />
                  <span className="mono" style={{ fontSize: 12, flex: 1 }}>{r.key}</span>
                  <span className="badge badge-crit" title={r.error}>Indisponible</span>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <a href={r.webUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, textDecoration: 'none', color: 'inherit', flex: 1 }}>{r.name}</a>
                    <span className="badge badge-mut">{r.branches?.length ?? 0} branche(s)</span>
                    {r.dependencyAlerts?.length > 0 && (
                      <span className={`badge badge-${r.dependencyAlerts.some((a) => a.severity === 'critical' || a.severity === 'high') ? 'crit' : 'warn'}`} title="Dépendances vulnérables (Dependabot)">
                        {r.dependencyAlerts.length} dépendance(s) vulnérable(s)
                      </span>
                    )}
                    {r.pipelines?.[0] && (
                      <>
                        <a href={r.pipelines[0].webUrl} target="_blank" rel="noreferrer" className={`badge badge-${PIPELINE_TONE[r.pipelines[0].status]}`} style={{ textDecoration: 'none' }}>
                          <span className="dot" />{PIPELINE_LABEL[r.pipelines[0].status]}
                        </a>
                        {r.pipelines[0].retryable && (
                          <button className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11 }} disabled={busyKey === r.pipelines[0].id} onClick={() => retryPipeline(r.pipelines[0].id)}>
                            {busyKey === r.pipelines[0].id ? '…' : 'Relancer'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {r.commits?.[0] && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', marginBottom: r.mergeRequests?.length ? 8 : 0 }}>
                      <span className="mono">{r.commits[0].sha}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.commits[0].message}</span>
                      <span className="faint">{r.commits[0].author}</span>
                    </div>
                  )}
                  {r.mergeRequests?.map((mr) => {
                    const reviewKey = `${r.provider}:${r.id}:${mr.id}`;
                    return (
                      <div key={mr.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12 }}>
                        <Icon name="gitBranch" size={12} style={{ color: 'var(--text-faint)' }} />
                        <a href={mr.webUrl} target="_blank" rel="noreferrer" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'inherit' }}>{mr.title}</a>
                        <span className="faint mono" style={{ fontSize: 11 }}>{mr.sourceBranch} → {mr.targetBranch}</span>
                        <button className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11 }} disabled={busyKey === reviewKey} onClick={() => approveReview(reviewKey)}>
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
      <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, cursor: 'pointer' }} onClick={() => setOpen(true)}>Rattacher</span>
      {open && (
        <Modal title="Rattacher des dépôts" sub="Cochez les dépôts liés à ce projet" onClose={() => setOpen(false)} width={380}>
          {allRepos.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-faint)', textAlign: 'center', padding: 10 }}>Aucun dépôt disponible</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {allRepos.map((r) => (
                <label key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', fontSize: 12.5, borderRadius: 8, cursor: 'pointer' }}>
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
      <div style={{ padding: 16 }}>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 11.5, marginBottom: 4, color: 'var(--text-muted)' }}>Namespace Kubernetes rattaché</label>
              <input className="input" value={namespace} onChange={(e) => setNamespace(e.target.value)} placeholder="prod-api-gateway" />
            </div>
            <button className="btn-outline" onClick={saveNamespace}>Enregistrer</button>
          </div>
        )}

        {namespace ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <select className="input" value={podName} onChange={(e) => setPodName(e.target.value)} style={{ width: 260 }}>
              <option value="">Sélectionner un pod…</option>
              {(pods.data?.items || []).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
            <button className={live ? 'btn' : 'btn-outline'} onClick={() => setLive((v) => !v)} disabled={!podName}>
              {live ? 'Arrêter le direct' : 'Voir les logs en direct'}
            </button>
            {live && <span className="badge badge-ok"><span className="dot" style={{ animation: 'pulseDot 2s ease-in-out infinite' }} />LIVE — tant que la page reste ouverte</span>}
          </div>
        ) : (
          <div className="faint" style={{ fontSize: 12.5, marginBottom: 12 }}>Aucun namespace Kubernetes rattaché à ce projet.</div>
        )}

        {logs !== null && (
          <pre className="mono" style={{ maxHeight: 320, overflow: 'auto', margin: 0, padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2, var(--bg))', fontSize: 11.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {logs || '(aucun log)'}
          </pre>
        )}
      </div>
    </Panel>
  );
}
