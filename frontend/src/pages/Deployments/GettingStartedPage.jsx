import { useParams, Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

// "Commencer à développer" (todo.md item 58) : regroupe ce qu'un
// développeur doit savoir pour démarrer sur ce projet — dépôts à cloner,
// secrets déclarés (jamais leur valeur), environnements disponibles,
// documentation/design system — en réutilisant uniquement des endpoints
// déjà réels (aucune commande d'installation inventée : générique par
// nature, le README du dépôt reste la source de vérité pour les détails
// spécifiques à la stack).
export default function GettingStartedPage() {
  const { id } = useParams();
  const project = useApi(() => api.get(`/projects/${id}`), [id]);
  const repos = useApi(() => api.get('/repos'), []);
  const vault = useApi(() => api.get(`/projects/${id}/vault`), [id]);
  const environments = useApi(() => api.get(`/projects/${id}/environments`), [id]);
  const docSites = useApi(() => api.get(`/projects/${id}/doc-sites`), [id]);

  const p = project.data?.project;
  if (!p) return <div className="faint">Chargement…</div>;

  const linkedRepos = (repos.data?.items || []).filter((r) => p.repoKeys.includes(r.key));
  const vaultEntries = vault.data?.items || [];
  const envs = environments.data?.items || [];
  const sites = docSites.data?.items || [];

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Développement', to: '/deployments' },
          { label: 'Projets', to: '/deployments/projects' },
          { label: p.name, to: `/deployments/projects/${id}` },
          { label: 'Commencer à développer' }
        ]}
        title="Commencer à développer"
        sub={p.name}
        actions={<Link to={`/deployments/projects/${id}`} className="btn-outline">← Retour au projet</Link>}
      />

      <div className="pd-grid-row">
        <Panel title="1. Cloner les dépôts" span={12}>
          {linkedRepos.length === 0 ? (
            <div className="pd-empty">Aucun dépôt rattaché à ce projet — voir la fiche projet pour en lier un.</div>
          ) : (
            <div className="pd-list-loose">
              {linkedRepos.map((r) => (
                <pre key={r.key} className="mono" style={{ margin: 0 }}>git clone {r.webUrl}.git</pre>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="pd-grid-row">
        <Panel title="2. Variables & secrets" sub="Noms déclarés uniquement — les valeurs ne transitent jamais ici" span={6}>
          {vaultEntries.length === 0 ? (
            <div className="pd-empty">Aucun secret déclaré dans le coffre-fort du projet.</div>
          ) : (
            <div className="pd-list-loose">
              {vaultEntries.map((v) => (
                <div key={v.id} className="pd-row">
                  <span className="mono pd-row-title">{v.label}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="3. Environnements disponibles" span={6}>
          {envs.length === 0 ? (
            <div className="pd-empty">Aucun environnement.</div>
          ) : (
            <div className="pd-list-loose">
              {envs.map((e) => (
                <div key={e.id} className="pd-row">
                  <span className="pd-row-title">{e.name}</span>
                  <span className="faint">{e.kind}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="pd-grid-row">
        <Panel title="4. Documentation & Design System" span={12}>
          {sites.length === 0 ? (
            <div className="pd-empty">Aucun lien Docusaurus/Storybook enregistré — voir la fiche projet.</div>
          ) : (
            <div className="pd-list-loose">
              {sites.filter((s) => s.url).map((s) => (
                <a key={s.kind} href={s.url} target="_blank" rel="noreferrer" className="pd-row pd-row-link">
                  <span className="pd-row-title">{s.kind === 'docusaurus' ? 'Documentation technique' : 'Storybook'}</span>
                </a>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="pd-grid-row">
        <Panel title="5. Lancer une tâche" span={12}>
          <div className="pd-empty">
            Créer une branche → coder → tester → commit → pull request → revue → CI → preview → staging → approbation → production.
            Voir <Link to={`/deployments/projects/${id}`}>le backlog du projet</Link> pour prendre une tâche.
          </div>
        </Panel>
      </div>
    </>
  );
}
