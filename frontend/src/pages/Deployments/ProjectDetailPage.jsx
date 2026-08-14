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

        <Panel title="Équipe" sub={`${p.memberIds.length} membre(s)`} span={4}>
          <div style={{ padding: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {p.memberIds.length === 0
              ? <span className="faint" style={{ fontSize: 12.5 }}>Aucun membre</span>
              : p.memberIds.map((mid) => <span key={mid} className="badge badge-vio"><span className="dot" />{userName(mid)}</span>)}
          </div>
        </Panel>
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

      {(() => {
        const isMember = user?.role === 'admin' || p.memberIds.includes(user?.id);
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16, marginBottom: 16 }}>
            <ProjectShortcutsPanel project={p} canManage={isMember} />
            <ProjectVaultPanel project={p} canManage={isMember} />
          </div>
        );
      })()}

      <ApiPreviewPanel project={p} canEdit={user?.role === 'admin'} onSaved={project.reload} />
    </>
  );
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

  async function sync(link) {
    setBusyId(link.id);
    try {
      await api.post(`/projects/${projectId}/deployments/${link.id}/sync`);
      notify(`Synchronisation lancée pour ${link.name}`, { type: 'ok' });
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
    </Panel>
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
