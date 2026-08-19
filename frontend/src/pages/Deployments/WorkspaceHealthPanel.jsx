import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

// Health Check du workspace projet (todo.md item 56) : dérivé uniquement de
// données déjà réelles et déjà chargées ailleurs sur cette page (dépôts,
// environnements, scans de sécurité, incidents) plus un seul appel propre
// aux liens Docusaurus/Storybook (Lot 6) — aucune nouvelle route backend,
// aucun signal inventé. Un check "non configuré" est un état honnête, pas
// une erreur.
export default function WorkspaceHealthPanel({ projectId, repoKeys, environments, securityScans, incidents }) {
  const docSites = useApi(() => api.get(`/projects/${projectId}/doc-sites`), [projectId]);
  const sites = docSites.data?.items || [];
  const docusaurus = sites.find((s) => s.kind === 'docusaurus');
  const storybook = sites.find((s) => s.kind === 'storybook');
  const openIncidents = (incidents || []).filter((i) => i.status !== 'resolved').length;

  const checks = [
    { label: 'Git', ok: (repoKeys || []).length > 0, detail: (repoKeys || []).length > 0 ? `${repoKeys.length} dépôt(s) rattaché(s)` : 'Aucun dépôt rattaché' },
    { label: 'Kubernetes / Argo CD', ok: (environments || []).some((e) => e.argocd_app), detail: (environments || []).some((e) => e.argocd_app) ? 'Au moins un environnement lié' : 'Aucun environnement lié à Argo CD' },
    { label: 'Documentation', ok: Boolean(docusaurus?.url), detail: docusaurus?.url ? 'Lien Docusaurus enregistré' : 'Aucun lien enregistré' },
    { label: 'Design System', ok: Boolean(storybook?.url), detail: storybook?.url ? 'Lien Storybook enregistré' : 'Aucun lien enregistré' },
    { label: 'Sécurité', ok: (securityScans || []).length > 0, detail: (securityScans || []).length > 0 ? `${securityScans.length} scan(s) enregistré(s)` : 'Aucun scan enregistré' },
    { label: 'Incidents', ok: openIncidents === 0, detail: openIncidents === 0 ? 'Aucun incident ouvert' : `${openIncidents} incident(s) ouvert(s)` }
  ];
  const okCount = checks.filter((c) => c.ok).length;

  return (
    <Panel title="Santé du workspace" sub={`${okCount} / ${checks.length} vérifications au vert`} span={12}>
      <div className="pd-list-loose">
        {checks.map((c) => (
          <div key={c.label} className="pd-row">
            <Icon name={c.ok ? 'check' : 'alertTriangle'} size={14} style={{ color: c.ok ? 'var(--tone-ok-fg)' : 'var(--tone-warn-fg)' }} />
            <span className="pd-row-title">{c.label}</span>
            <span className="faint">{c.detail}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
