import { useParams, Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import './RepoDetailPage.css';

const PROVIDER_ICON = { gitlab: 'gitlab', github: 'github', gitea: 'gitBranch' };
const PROVIDER_LABEL = { gitlab: 'GitLab', github: 'GitHub', gitea: 'Gitea' };
const VISIBILITY_TONE = { public: 'ok', internal: 'info', private: 'mut' };
const VISIBILITY_LABEL = { public: 'Public', internal: 'Interne', private: 'Privé' };
const PIPELINE_STATUS_TONE = { success: 'ok', failed: 'crit', running: 'warn', cancelled: 'mut', other: 'mut' };
const PIPELINE_STATUS_LABEL = { success: 'Réussi', failed: 'Échoué', running: 'En cours', cancelled: 'Annulé', other: '—' };

// Repository Workspace : vue unifiée d'un dépôt — plus besoin de chercher
// ses pull requests dans Revue de code et ses exécutions CI dans Pipelines
// séparément. Filtre côté client les vues globales déjà réelles (GET
// /reviews, GET /pipelines/runs) sur `repo === path du dépôt` — aucune
// route dédiée par dépôt n'existe encore pour ces deux listes, ce filtrage
// reste donc honnête (mêmes données, pas de doublon de logique serveur).
// Chaque pull request / exécution garde son vrai lien externe (webUrl).
export default function RepoDetailPage() {
  const { key } = useParams();
  const repos = useApi(() => api.get('/repos'), []);
  const reviews = useApi(() => api.get('/reviews'), []);
  const pipelines = useApi(() => api.get('/pipelines/runs'), []);
  // Repository Links (todo.md item 44) : quels projets rattachent ce
  // dépôt — dérivé de p.repoKeys (déjà la source de vérité du lien
  // projet ↔ dépôt, voir ProjectDetailPage.jsx panneau "Dépôts
  // rattachés"), jamais l'inverse d'une donnée qui n'existerait pas.
  const projects = useApi(() => api.get('/projects'), []);
  // react-router décode déjà :key (y compris un %2F encodé pour un id GitHub
  // "owner/repo") avant de le donner à useParams — le réencoder ici est donc
  // nécessaire pour reconstruire une URL d'API valide vers ce même segment.
  const structure = useApi(() => api.get(`/repos/${encodeURIComponent(key)}/structure`), [key]);
  const branches = useApi(() => api.get(`/repos/${encodeURIComponent(key)}/branches`), [key]);
  const commits = useApi(() => api.get(`/repos/${encodeURIComponent(key)}/commits`), [key]);
  const security = useApi(() => api.get(`/repos/${encodeURIComponent(key)}/security`), [key]);

  const repo = (repos.data?.items || []).find((r) => r.key === key);
  if (repos.data && !repo) {
    return <div className="card repo-detail-error">Dépôt introuvable.</div>;
  }
  if (!repo) return <div className="faint">Chargement…</div>;

  const myReviews = (reviews.data?.items || []).filter((r) => r.repo === repo.path);
  const myPipelines = (pipelines.data?.items || []).filter((p) => p.repo === repo.path);
  const linkedProjects = (projects.data?.items || []).filter((p) => (p.repoKeys || []).includes(repo.key));

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Développement', to: '/deployments' },
          { label: 'Dépôts Git', to: '/deployments/repos' },
          { label: repo.name }
        ]}
        title={repo.name}
        sub={repo.path}
        actions={(
          <div className="repo-detail-actions">
            {repo.role && <span className="badge badge-vio">{repo.role}</span>}
            <span className={`badge badge-${VISIBILITY_TONE[repo.visibility]}`}>{VISIBILITY_LABEL[repo.visibility]}</span>
            <a href={repo.webUrl} target="_blank" rel="noreferrer" className="btn-outline">
              <Icon name={PROVIDER_ICON[repo.provider] || 'gitBranch'} size={13} /> Ouvrir dans {PROVIDER_LABEL[repo.provider] || repo.provider}
            </a>
            <Link to="/deployments/repos" className="btn-outline">← Tous les dépôts</Link>
          </div>
        )}
      />

      <div className="pd-grid-row">
        <Panel title="Aperçu" span={12}>
          <div className="repo-detail-overview-grid">
            <div><span className="faint">Branche par défaut</span><div className="mono">{repo.defaultBranch}</div></div>
            <div><span className="faint">Fournisseur</span><div>{PROVIDER_LABEL[repo.provider] || repo.provider}</div></div>
            <div><span className="faint">Dernière activité</span><div>{repo.lastActivity ? new Date(repo.lastActivity).toLocaleString('fr-FR') : '—'}</div></div>
            <div><span className="faint">Étiquettes</span><div>{(repo.tags || []).length ? (repo.tags || []).join(', ') : '—'}</div></div>
          </div>
          {structure.data?.structure && (
            <div className="repo-detail-stack">
              <span className="faint">Stack détectée : </span>
              {structure.data.structure.stack.length === 0 ? <span className="faint">non détectée</span> : structure.data.structure.stack.map((s) => <span key={s} className="badge badge-mut">{s}</span>)}
            </div>
          )}
        </Panel>
      </div>

      <div className="pd-grid-row">
        <Panel title="Branches" sub={`${(branches.data?.items || []).length} branche(s)`} span={6}>
          {!branches.data ? (
            <div className="faint">Chargement…</div>
          ) : (branches.data.items || []).length === 0 ? (
            <div className="faint">Aucune branche trouvée.</div>
          ) : (
            <div className="repo-detail-list">
              {branches.data.items.slice(0, 15).map((b) => (
                <div key={b.name} className="repo-detail-row">
                  <span className="mono repo-detail-row-title">{b.name}</span>
                  {b.default && <span className="badge badge-info">défaut</span>}
                  {b.protected && <span className="badge badge-warn">protégée</span>}
                  <span className="faint mono">{b.commitSha || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Commits" sub={`${(commits.data?.items || []).length} récent(s) sur la branche par défaut`} span={6}>
          {!commits.data ? (
            <div className="faint">Chargement…</div>
          ) : (commits.data.items || []).length === 0 ? (
            <div className="faint">Aucun commit trouvé.</div>
          ) : (
            <div className="repo-detail-list">
              {commits.data.items.slice(0, 15).map((c) => (
                <a key={c.sha} href={c.webUrl} target="_blank" rel="noreferrer" className="repo-detail-row">
                  <span className="mono repo-detail-row-title">{c.sha}</span>
                  <span className="faint">{c.message}</span>
                  <span className="faint">{c.author || 'non disponible'}</span>
                  <Icon name="externalLink" size={12} />
                </a>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="pd-grid-row">
        <Panel title="Sécurité" sub={security.data?.supported ? `${(security.data.items || []).length} alerte(s) ouverte(s) (Dependabot)` : 'Non disponible pour ce fournisseur'} span={12}>
          {!security.data?.supported ? (
            <div className="faint">Les alertes de dépendances ne sont exposées que pour GitHub (Dependabot) — non disponible pour {PROVIDER_LABEL[repo.provider] || repo.provider}.</div>
          ) : (security.data.items || []).length === 0 ? (
            <div className="faint">Aucune alerte de dépendance ouverte.</div>
          ) : (
            <div className="repo-detail-list">
              {security.data.items.map((a) => (
                <a key={a.number} href={a.webUrl} target="_blank" rel="noreferrer" className="repo-detail-row">
                  <span className={`badge badge-${a.severity === 'critical' || a.severity === 'high' ? 'crit' : a.severity === 'moderate' ? 'warn' : 'mut'}`}>{a.severity || '—'}</span>
                  <span className="repo-detail-row-title">{a.package}</span>
                  <span className="faint">{a.summary}</span>
                  <Icon name="externalLink" size={12} />
                </a>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="pd-grid-row">
        <Panel title="Projets rattachés" sub={`${linkedProjects.length} projet(s)`} span={12}>
          {linkedProjects.length === 0 ? (
            <div className="faint">Aucun projet ne rattache ce dépôt — voir la fiche projet, panneau "Dépôts rattachés".</div>
          ) : (
            <div className="repo-detail-list">
              {linkedProjects.map((p) => (
                <Link key={p.id} to={`/deployments/projects/${p.id}`} className="repo-detail-row">
                  <span className="repo-detail-row-title">{p.name}</span>
                  <Icon name="externalLink" size={12} />
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="pd-grid-row">
        <Panel title="Pull requests" sub={`${myReviews.length} ouverte(s)`} span={6}>
          {myReviews.length === 0 ? (
            <div className="faint">Aucune pull request ouverte sur ce dépôt.</div>
          ) : (
            <div className="repo-detail-list">
              {myReviews.map((r) => (
                <a key={r.key} href={r.webUrl} target="_blank" rel="noreferrer" className="repo-detail-row">
                  <span className="repo-detail-row-title">{r.title}</span>
                  <span className="faint mono">{r.sourceBranch} → {r.targetBranch}</span>
                  <Icon name="externalLink" size={12} />
                </a>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Pipelines" sub={`${myPipelines.length} exécution(s) récente(s)`} span={6}>
          {myPipelines.length === 0 ? (
            <div className="faint">Aucune exécution CI récente sur ce dépôt.</div>
          ) : (
            <div className="repo-detail-list">
              {myPipelines.slice(0, 10).map((p) => (
                <a key={p.id} href={p.webUrl} target="_blank" rel="noreferrer" className="repo-detail-row">
                  <span className={`badge badge-${PIPELINE_STATUS_TONE[p.status]}`}>{PIPELINE_STATUS_LABEL[p.status]}</span>
                  <span className="faint mono">{p.branch}</span>
                  <span className="faint">{new Date(p.createdAt).toLocaleString('fr-FR')}</span>
                  <Icon name="externalLink" size={12} />
                </a>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
