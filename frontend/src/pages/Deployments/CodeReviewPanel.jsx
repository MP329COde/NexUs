import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

// Agrège les revues de code ouvertes (PR GitHub / MR GitLab) sur toutes les
// applications suivies, pour ne pas avoir à aller les chercher projet par
// projet. Approuver directement ici équivaut à cliquer "Approve" dans
// l'interface Git d'origine — "Ouvrir" reste disponible pour un examen complet.
export default function CodeReviewPanel({ apps }) {
  const notify = useNotify();
  const gitApps = apps.filter((a) => a.gitProvider === 'github' ? (a.githubOwner && a.githubRepo) : a.gitlabProjectId);

  const { data, reload } = useApi(async () => {
    const results = await Promise.all(gitApps.map(async (a) => {
      try {
        if (a.gitProvider === 'github') {
          const res = await api.get(`/github/repos/${a.githubOwner}/${a.githubRepo}/pulls`);
          return res.items.map((p) => ({ appName: a.name, provider: 'github', owner: a.githubOwner, repo: a.githubRepo, key: `github-${a.githubOwner}-${a.githubRepo}-${p.number}`, ...p }));
        }
        const res = await api.get(`/gitlab/projects/${a.gitlabProjectId}/merge-requests`);
        return res.items.map((m) => ({ appName: a.name, provider: 'gitlab', projectId: a.gitlabProjectId, key: `gitlab-${a.gitlabProjectId}-${m.iid}`, ...m }));
      } catch {
        return [];
      }
    }));
    return { items: results.flat() };
  }, [gitApps.map((a) => a.id).join(',')], { pollMs: 60000 });

  const items = data?.items || [];

  async function approve(item) {
    try {
      if (item.provider === 'github') {
        await api.post(`/github/repos/${item.owner}/${item.repo}/pulls/${item.number}/approve`, {});
      } else {
        await api.post(`/gitlab/projects/${item.projectId}/merge-requests/${item.iid}/approve`, {});
      }
      notify('Revue approuvée', { type: 'ok' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  if (gitApps.length === 0) return null;

  return (
    <Panel title="Revues de code en attente" sub="Pull/merge requests ouvertes sur les applications suivies" span={12}>
      <DataTable
        columns={['Application', 'Titre', 'Auteur', 'Branches', '']}
        rows={items}
        emptyTitle="Aucune revue en attente"
        renderRow={(item) => (
          <tr key={item.key}>
            <td style={{ fontWeight: 500 }}>{item.appName}</td>
            <td>{item.title}</td>
            <td className="muted">{item.author}</td>
            <td className="mono faint">{item.sourceBranch} → {item.targetBranch}</td>
            <td>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <a href={item.webUrl} target="_blank" rel="noreferrer" className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
                  <Icon name="externalLink" size={12} />Ouvrir
                </a>
                <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => approve(item)}>
                  <Icon name="check" size={12} />Approuver
                </span>
              </div>
            </td>
          </tr>
        )}
      />
    </Panel>
  );
}
