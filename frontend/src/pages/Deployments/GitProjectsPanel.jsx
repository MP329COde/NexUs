import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';

const PROVIDERS = [
  { id: 'gitlab', label: 'GitLab' },
  { id: 'github', label: 'GitHub' }
];

export default function GitProjectsPanel() {
  const { user } = useAuth();
  const notify = useNotify();
  const [provider, setProvider] = useState('gitlab');
  const gitlab = useApi(() => api.get('/gitlab/projects'), [], { pollMs: 60000 });
  const github = useApi(() => api.get('/github/repos'), [], { pollMs: 60000 });
  const [mirroring, setMirroring] = useState(null); // id du projet dont le formulaire de miroir est ouvert
  const [repoName, setRepoName] = useState('');
  const [busy, setBusy] = useState(false);

  async function enableMirror(project) {
    setBusy(true);
    try {
      const res = await api.post(`/gitlab/projects/${project.id}/mirror-to-github`, { githubRepoName: repoName });
      notify(`Sauvegarde automatique activée vers ${res.githubRepo}`, { type: 'ok' });
      setMirroring(null);
      setRepoName('');
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

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
            <>
              <tr key={p.id}>
                <td className="mono muted">{p.id}</td>
                <td style={{ fontWeight: 500 }}>{p.path}</td>
                <td className="mono faint">{p.defaultBranch}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    {user?.role === 'admin' && (
                      <span
                        className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                        onClick={() => { setMirroring(mirroring === p.id ? null : p.id); setRepoName(p.path.split('/').pop()); }}
                        title="Sauvegarde automatique vers un dépôt GitHub"
                      >
                        <Icon name="refresh" size={11} /> Miroir GitHub
                      </span>
                    )}
                    <a href={p.webUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}><Icon name="externalLink" size={12} />Ouvrir</a>
                  </div>
                </td>
              </tr>
              {mirroring === p.id && (
                <tr key={`${p.id}-mirror`}>
                  <td colSpan={4} style={{ background: 'var(--border-soft)' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 4px' }}>
                      <span className="faint" style={{ fontSize: 11.5, flex: 'none' }}>Créer/utiliser le dépôt GitHub :</span>
                      <input className="input" value={repoName} onChange={(e) => setRepoName(e.target.value)} style={{ height: 28, fontSize: 12, flex: '0 1 220px' }} />
                      <button className="btn" disabled={busy || !repoName} onClick={() => enableMirror(p)} style={{ height: 28, fontSize: 12 }}>
                        {busy ? 'Activation…' : 'Autoriser & activer'}
                      </button>
                      <span className="btn-outline" style={{ height: 28, padding: '0 10px', fontSize: 12, display: 'flex', alignItems: 'center' }} onClick={() => setMirroring(null)}>Annuler</span>
                    </div>
                  </td>
                </tr>
              )}
            </>
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
