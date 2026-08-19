import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import './MyWorkPage.css';

const TASK_STATUS_LABELS = { todo: 'À faire', in_progress: 'En cours', review: 'En revue', testing: 'Tests', ready: 'Prêt', done: 'Terminé' };
const SEVERITY_TONE = { critical: 'crit', high: 'crit', medium: 'warn', low: 'mut' };

// Page centrale "Mon travail" : regroupe ce qui concerne directement
// l'utilisateur connecté (tâches assignées, revues à effectuer, incidents
// ouverts et changements en attente de sa décision, sur SES projets),
// chaque élément cliquable vers sa ressource. Agrège des endpoints déjà
// réels (GET /projects/mine/tasks, /projects/mine/overview, /reviews) —
// aucune donnée inventée, une section vide affiche honnêtement "aucun".
export default function MyWorkPage() {
  const { user } = useAuth();
  const tasks = useApi(() => api.get('/projects/mine/tasks'), []);
  const overview = useApi(() => api.get('/projects/mine/overview'), []);
  const reviews = useApi(() => api.get('/reviews'), []);
  const environments = useApi(() => api.get('/projects/mine/environments'), []);

  const myTasks = (tasks.data?.items || []).filter((t) => t.status !== 'done');
  const myReviews = (reviews.data?.items || []).filter((r) => (r.reviewerIds || []).includes(user?.id));
  const openIncidents = overview.data?.openIncidents || [];
  const pendingChanges = overview.data?.pendingChanges || [];
  const myProjects = overview.data?.projects || [];
  const myEnvironments = environments.data?.items || [];

  return (
    <>
      <PageHeader title="Mon travail" sub="Ce qui vous concerne directement, tous projets confondus" />

      <div className="pd-grid-row">
        <Panel title="Mes tâches" sub={`${myTasks.length} en cours`} span={6}>
          {myTasks.length === 0 ? (
            <div className="faint">Aucune tâche assignée en cours.</div>
          ) : (
            <div className="mywork-list">
              {myTasks.map((t) => (
                <Link key={t.id} to={`/deployments/projects/${t.projectId}`} className="mywork-row">
                  <span className="badge badge-mut">{TASK_STATUS_LABELS[t.status] || t.status}</span>
                  <span className="mywork-row-title">{t.title}</span>
                  <span className="faint">{t.projectName}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Mes revues à effectuer" sub={`${myReviews.length} assignée(s)`} span={6}>
          {myReviews.length === 0 ? (
            <div className="faint">Aucune revue qui vous est assignée.</div>
          ) : (
            <div className="mywork-list">
              {myReviews.map((r) => (
                <a key={r.key} href={r.webUrl} target="_blank" rel="noreferrer" className="mywork-row">
                  <span className="badge badge-vio">{r.provider}</span>
                  <span className="mywork-row-title">{r.title}</span>
                  <span className="faint">{r.repo}</span>
                </a>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="pd-grid-row">
        <Panel title="Mes incidents ouverts" sub={`${openIncidents.length} ouvert(s)`} span={6}>
          {openIncidents.length === 0 ? (
            <div className="faint">Aucun incident ouvert sur vos projets.</div>
          ) : (
            <div className="mywork-list">
              {openIncidents.map((i) => (
                <Link key={i.id} to={`/deployments/projects/${i.projectId}`} className="mywork-row">
                  <span className={`badge badge-${SEVERITY_TONE[i.severity] || 'mut'}`}>{i.severity}</span>
                  <span className="mywork-row-title">{i.title}</span>
                  <span className="faint">{i.projectName}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Changements en attente de ma décision" sub={`${pendingChanges.length} en attente`} span={6}>
          {pendingChanges.length === 0 ? (
            <div className="faint">Aucun changement en attente de votre décision.</div>
          ) : (
            <div className="mywork-list">
              {pendingChanges.map((c) => (
                <Link key={c.id} to={`/deployments/projects/${c.projectId}`} className="mywork-row">
                  <span className="mywork-row-title">{c.title}</span>
                  <span className="faint">{c.projectName}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="pd-grid-row">
        <Panel title="Mes environnements" sub={`${myEnvironments.length} environnement(s) de preview`} span={12}>
          {myEnvironments.length === 0 ? (
            <div className="faint">Aucun environnement de preview sur vos projets.</div>
          ) : (
            <div className="mywork-list">
              {myEnvironments.map((e) => (
                <Link key={e.id} to={`/deployments/projects/${e.projectId}`} className="mywork-row">
                  <span className="mywork-row-title">{e.name}</span>
                  {e.source_branch && <span className="faint mono">{e.source_branch}</span>}
                  <span className="faint">{e.projectName}</span>
                  {e.expires_at && <span className="faint">expire le {new Date(e.expires_at).toLocaleDateString('fr-FR')}</span>}
                </Link>
              ))}
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
