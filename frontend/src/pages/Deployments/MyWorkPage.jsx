import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import './MyWorkPage.css';

const TASK_STATUS_LABELS = { todo: 'À faire', in_progress: 'En cours', review: 'En revue', testing: 'Tests', ready: 'Prêt', done: 'Terminé' };
const TASK_STATUS_TONE = { todo: 'mut', in_progress: 'info', review: 'warn', testing: 'warn', ready: 'ok', done: 'ok' };
const SEVERITY_TONE = { critical: 'crit', high: 'crit', medium: 'warn', low: 'mut' };
const SEVERITY_LABELS = { critical: 'Critique', high: 'Élevée', medium: 'Moyenne', low: 'Faible' };
const PROVISIONING_TONE = { provisioned: 'ok', pending: 'warn', failed: 'crit', skipped: 'mut' };
const PROVISIONING_LABELS = { provisioned: 'Provisionné', pending: 'En cours', failed: 'Échec', skipped: 'Non provisionné' };

// Page centrale "Mon travail" : regroupe ce qui concerne directement
// l'utilisateur connecté (tâches assignées, revues à effectuer, incidents
// ouverts et changements en attente de sa décision, sur SES projets),
// chaque élément cliquable vers sa ressource. Agrège des endpoints déjà
// réels (GET /projects/mine/tasks, /projects/mine/overview, /reviews) —
// aucune donnée inventée, une section vide affiche honnêtement "aucun".
//
// Retravail visuel (Lot D1) : la page est désormais la page d'atterrissage
// par défaut de /deployments. Elle s'organise en deux zones : un bandeau
// de synthèse en tête (compteurs dérivés des données déjà chargées, sans
// appel réseau supplémentaire) puis une zone "Demande une action de vous"
// (revues à effectuer + changements en attente de VOTRE décision, triés
// avant le reste car ce sont les seuls éléments où l'utilisateur est
// bloquant) suivie d'une zone "Informatif" (tâches, incidents,
// environnements, projets). Les badges réutilisent StatusBadge.jsx (Lot A5)
// pour rester cohérents avec le reste de l'application.
export default function MyWorkPage() {
  const { user } = useAuth();
  const tasks = useApi(() => api.get('/projects/mine/tasks'), []);
  const overview = useApi(() => api.get('/projects/mine/overview'), []);
  const reviews = useApi(() => api.get('/reviews'), []);
  const environments = useApi(() => api.get('/projects/mine/environments'), []);

  const loading = tasks.loading || overview.loading || reviews.loading || environments.loading;

  const myTasks = (tasks.data?.items || []).filter((t) => t.status !== 'done');
  const myReviews = (reviews.data?.items || []).filter((r) => (r.reviewerIds || []).includes(user?.id));
  const openIncidents = overview.data?.openIncidents || [];
  const pendingChanges = overview.data?.pendingChanges || [];
  const myProjects = overview.data?.projects || [];
  const myEnvironments = environments.data?.items || [];

  const actionRequiredCount = myReviews.length + pendingChanges.length;

  return (
    <>
      <PageHeader title="Mon travail" sub="Ce qui vous concerne directement, tous projets confondus" />

      <div className="mywork-summary" role="group" aria-label="Synthèse de votre activité">
        <SummaryTile label="Tâches en cours" value={myTasks.length} tone="info" loading={loading} to="#mywork-tasks" />
        <SummaryTile label="Revues à effectuer" value={myReviews.length} tone={myReviews.length > 0 ? 'warn' : 'ok'} loading={loading} to="#mywork-reviews" highlight={myReviews.length > 0} />
        <SummaryTile label="Incidents ouverts" value={openIncidents.length} tone={openIncidents.length > 0 ? 'crit' : 'ok'} loading={loading} to="#mywork-incidents" highlight={openIncidents.length > 0} />
        <SummaryTile label="Changements en attente" value={pendingChanges.length} tone={pendingChanges.length > 0 ? 'warn' : 'ok'} loading={loading} to="#mywork-changes" highlight={pendingChanges.length > 0} />
        <SummaryTile label="Environnements preview" value={myEnvironments.length} tone="mut" loading={loading} to="#mywork-envs" />
      </div>

      {actionRequiredCount > 0 && (
        <div className="mywork-section-label mywork-section-label-action">Demande une action de votre part</div>
      )}

      <div className="pd-grid-row">
        <Panel
          title="Mes revues à effectuer"
          sub={`${myReviews.length} assignée(s)`}
          span={6}
        >
          <div id="mywork-reviews" />
          {myReviews.length === 0 ? (
            <div className="faint">Aucune revue qui vous est assignée.</div>
          ) : (
            <div className="mywork-list">
              {myReviews.map((r) => (
                <a key={r.key} href={r.webUrl} target="_blank" rel="noreferrer" className="mywork-row mywork-row-action">
                  <StatusBadge tone="info" label={r.provider} />
                  <span className="mywork-row-title">{r.title}</span>
                  <span className="faint">{r.repo}</span>
                  <span className="mywork-row-arrow" aria-hidden="true">→</span>
                </a>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Changements en attente de ma décision"
          sub={`${pendingChanges.length} en attente`}
          span={6}
        >
          <div id="mywork-changes" />
          {pendingChanges.length === 0 ? (
            <div className="faint">Aucun changement en attente de votre décision.</div>
          ) : (
            <div className="mywork-list">
              {pendingChanges.map((c) => (
                <Link key={c.id} to={`/deployments/projects/${c.projectId}`} className="mywork-row mywork-row-action">
                  <StatusBadge tone="warn" label="À décider" />
                  <span className="mywork-row-title">{c.title}</span>
                  <span className="faint">{c.projectName}</span>
                  <span className="mywork-row-arrow" aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="mywork-section-label">Informatif</div>

      <div className="pd-grid-row">
        <Panel title="Mes tâches" sub={`${myTasks.length} en cours`} span={6}>
          <div id="mywork-tasks" />
          {myTasks.length === 0 ? (
            <div className="faint">Aucune tâche assignée en cours.</div>
          ) : (
            <div className="mywork-list">
              {myTasks.map((t) => (
                <Link key={t.id} to={`/deployments/projects/${t.projectId}`} className="mywork-row">
                  <StatusBadge tone={TASK_STATUS_TONE[t.status] || 'mut'} label={TASK_STATUS_LABELS[t.status] || t.status} />
                  <span className="mywork-row-title">{t.title}</span>
                  <span className="faint">{t.projectName}</span>
                  {t.prUrl && (
                    <a
                      href={t.prUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="badge badge-vio"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      PR
                    </a>
                  )}
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Mes incidents ouverts" sub={`${openIncidents.length} ouvert(s)`} span={6}>
          <div id="mywork-incidents" />
          {openIncidents.length === 0 ? (
            <div className="faint">Aucun incident ouvert sur vos projets.</div>
          ) : (
            <div className="mywork-list">
              {openIncidents.map((i) => (
                <Link key={i.id} to={`/deployments/projects/${i.projectId}`} className="mywork-row">
                  <StatusBadge tone={SEVERITY_TONE[i.severity] || 'mut'} label={SEVERITY_LABELS[i.severity] || i.severity} />
                  <span className="mywork-row-title">{i.title}</span>
                  <span className="faint">{i.projectName}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="pd-grid-row">
        <Panel title="Mes environnements" sub={`${myEnvironments.length} environnement(s) de preview`} span={12}>
          <div id="mywork-envs" />
          {myEnvironments.length === 0 ? (
            <div className="faint">Aucun environnement de preview sur vos projets.</div>
          ) : (
            <div className="mywork-list">
              {myEnvironments.map((e) => {
                const linkedTask = myTasks.find((t) => t.branch && e.source_branch && t.branch === e.source_branch);
                return (
                  <Link key={e.id} to={`/deployments/projects/${e.projectId}`} className="mywork-row">
                    <StatusBadge tone={PROVISIONING_TONE[e.provisioning_status] || 'mut'} label={PROVISIONING_LABELS[e.provisioning_status] || e.provisioning_status} />
                    <span className="mywork-row-title">{e.name}</span>
                    <span className="faint">{e.projectName}</span>
                    {e.source_branch && <span className="faint mono">{e.source_branch}</span>}
                    {e.source_commit && <span className="faint mono">{e.source_commit.slice(0, 7)}</span>}
                    {e.provisioned_namespace && <span className="faint mono">{e.provisioned_namespace}</span>}
                    {e.source_pr_url && <a href={e.source_pr_url} target="_blank" rel="noreferrer" className="badge badge-vio" onClick={(ev) => ev.stopPropagation()}>PR</a>}
                    {linkedTask && <span className="badge badge-mut" title={linkedTask.title}>Tâche liée</span>}
                    {e.expires_at && <span className="faint">expire le {new Date(e.expires_at).toLocaleDateString('fr-FR')}</span>}
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <div className="pd-grid-row">
        <Panel title="Mes projets" sub={`${myProjects.length} projet(s)`} span={12}>
          {myProjects.length === 0 ? (
            <div className="faint">Aucun projet.</div>
          ) : (
            <div className="mywork-projects-grid">
              {myProjects.map((p) => (
                <Link key={p.id} to={`/deployments/projects/${p.id}`} className="mywork-project-card">
                  <span className="mywork-row-title">{p.name}</span>
                  <span className="badge badge-mut">{p.role}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function SummaryTile({ label, value, tone, loading, to, highlight }) {
  return (
    <a href={to} className={`mywork-tile mywork-tile-${tone}${highlight ? ' mywork-tile-highlight' : ''}`}>
      <span className="mywork-tile-value">{loading ? '—' : value}</span>
      <span className="mywork-tile-label">{label}</span>
    </a>
  );
}
