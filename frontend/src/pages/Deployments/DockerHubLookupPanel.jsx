import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

function formatSize(bytes) {
  if (!bytes) return '—';
  const mb = bytes / 1_000_000;
  return mb >= 1000 ? `${(mb / 1000).toFixed(2)} Go` : `${mb.toFixed(1)} Mo`;
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('fr-FR') : '—';
}

// Consultation en direct du registre public Docker Hub (aucune authentification
// requise — voir backend/src/services/integrations/dockerHubService.js) :
// données réelles (tags, tailles, architectures), indépendant du tableau de
// démonstration ci-dessous qui n'a aucun registre connecté.
export default function DockerHubLookupPanel() {
  const notify = useNotify();
  const [namespace, setNamespace] = useState('');
  const [repo, setRepo] = useState('nginx');
  const [loading, setLoading] = useState(false);
  const [repository, setRepository] = useState(null);
  const [tags, setTags] = useState(null);

  async function search(e) {
    e.preventDefault();
    if (!repo.trim()) return;
    setLoading(true);
    setRepository(null);
    setTags(null);
    try {
      const ns = namespace.trim() || 'library';
      const [repoRes, tagsRes] = await Promise.all([
        api.get(`/docker-hub/${ns}/${repo.trim()}`),
        api.get(`/docker-hub/${ns}/${repo.trim()}/tags`)
      ]);
      setRepository(repoRes.repository);
      setTags(tagsRes.results);
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel
      title="Recherche Docker Hub"
      sub="Registre public en direct — aucune configuration requise, indépendant du tableau de démonstration ci-dessous"
      span={12}
    >
      <form onSubmit={search} style={{ display: 'flex', gap: 8, padding: 16, borderBottom: '1px solid var(--border-soft)' }}>
        <input className="input mono" placeholder="namespace (vide = image officielle)" value={namespace} onChange={(e) => setNamespace(e.target.value)} style={{ flex: '1 1 200px', fontSize: 12.5 }} />
        <input className="input mono" placeholder="dépôt — ex. nginx, postgres, node" required value={repo} onChange={(e) => setRepo(e.target.value)} style={{ flex: '1 1 220px', fontSize: 12.5 }} />
        <button className="btn" type="submit" disabled={loading}>{loading ? 'Recherche…' : 'Chercher'}</button>
      </form>

      {repository && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600 }}>
            <Icon name="image" size={14} style={{ color: 'var(--text-faint)' }} />
            {repository.namespace}/{repository.name}
            {repository.isOfficial && <span className="badge badge-ok" style={{ fontSize: 10 }}><span className="dot" />Officielle</span>}
          </span>
          <span className="faint" style={{ fontSize: 11.5 }}>{repository.pullCount?.toLocaleString('fr-FR')} pulls · {repository.starCount} ⭐</span>
          {repository.description && <span className="faint" style={{ fontSize: 11.5, flex: '1 1 200px' }}>{repository.description}</span>}
        </div>
      )}

      {tags && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                {['Tag', 'Taille', 'Architectures', 'Dernière mise à jour'].map((c) => (
                  <th key={c} style={{ textAlign: 'left', padding: '8px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-soft)' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tags.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'var(--text-faint)' }}>Aucun tag trouvé</td></tr>
              ) : tags.map((t) => (
                <tr key={t.name} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '9px 16px' }} className="mono">{t.name}</td>
                  <td style={{ padding: '9px 16px' }} className="mono muted">{formatSize(t.sizeBytes)}</td>
                  <td style={{ padding: '9px 16px' }} className="faint">{t.architectures.join(', ') || '—'}</td>
                  <td style={{ padding: '9px 16px', color: 'var(--text-faint)' }}>{formatDate(t.lastUpdated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
