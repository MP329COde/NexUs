import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

const PROVIDERS = [
  { id: 'gitlab', label: 'GitLab' },
  { id: 'github', label: 'GitHub' }
];

export default function GitProjectsPanel() {
  const [provider, setProvider] = useState('gitlab');
  const gitlab = useApi(() => api.get('/gitlab/projects'), [], { pollMs: 60000 });
  const github = useApi(() => api.get('/github/repos'), [], { pollMs: 60000 });

  const active = provider === 'gitlab' ? gitlab : github;

  return (
    <Panel
      title="Projets"
      sub="Dépôts accessibles avec vos identifiants configurés — ouvrez-les directement dans l'outil"
      span={12}
      actions={(
        <div style={{ display: 'flex', background: 'var(--border-soft)', borderRadius: 9, padding: 3, gap: 2 }}>
          {PROVIDERS.map((p) => (
            <div
              key={p.id}
              onClick={() => setProvider(p.id)}
              style={{ padding: '5px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: provider === p.id ? 600 : 500, color: provider === p.id ? 'var(--text)' : 'var(--text-muted)', background: provider === p.id ? 'var(--surface)' : 'transparent', cursor: 'pointer' }}
            >
              {p.label}
            </div>
          ))}
        </div>
      )}
    >
      {provider === 'gitlab' ? (
        <DataTable
          columns={['ID', 'Projet', 'Branche par défaut', '']}
          rows={gitlab.data?.items}
          emptyTitle={gitlab.error ? 'GitLab non configuré' : 'Aucun projet'}
          emptyHint={gitlab.error ? "Renseignez l'URL et un token depuis Paramètres → GitLab." : undefined}
          renderRow={(p) => (
            <tr key={p.id}>
              <td className="mono muted">{p.id}</td>
              <td style={{ fontWeight: 500 }}>{p.path}</td>
              <td className="mono faint">{p.defaultBranch}</td>
              <td><a href={p.webUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}><Icon name="externalLink" size={12} />Ouvrir</a></td>
            </tr>
          )}
        />
      ) : (
        <DataTable
          columns={['Dépôt', 'Visibilité', 'Branche par défaut', '']}
          rows={github.data?.items}
          emptyTitle={github.error ? 'GitHub non configuré' : 'Aucun dépôt'}
          emptyHint={github.error ? 'Renseignez un token personnel depuis Paramètres → GitHub.' : undefined}
          renderRow={(r) => (
            <tr key={r.id}>
              <td style={{ fontWeight: 500 }}>{r.fullName}</td>
              <td>{r.private ? 'Privé' : 'Public'}</td>
              <td className="mono faint">{r.defaultBranch}</td>
              <td><a href={r.webUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}><Icon name="externalLink" size={12} />Ouvrir</a></td>
            </tr>
          )}
        />
      )}
    </Panel>
  );
}
