import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './DockerHubLookupPanel.css';

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
// données réelles (tags, tailles, architectures).
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
      sub="Registre public en direct — aucune configuration requise"
      span={12}
    >
      <form onSubmit={search} className="dhl-form">
        <input className="input mono dhl-input-namespace" placeholder="namespace (vide = image officielle)" value={namespace} onChange={(e) => setNamespace(e.target.value)} />
        <input className="input mono dhl-input-repo" placeholder="dépôt — ex. nginx, postgres, node" required value={repo} onChange={(e) => setRepo(e.target.value)} />
        <button className="btn" type="submit" disabled={loading}>{loading ? 'Recherche…' : 'Chercher'}</button>
      </form>

      {repository && (
        <div className="dhl-summary">
          <span className="dhl-summary-name">
            <Icon name="image" size={14} className="dhl-summary-icon" />
            {repository.namespace}/{repository.name}
            {repository.isOfficial && <span className="badge badge-ok dhl-official-badge"><span className="dot" />Officielle</span>}
          </span>
          <span className="faint dhl-summary-stats">{repository.pullCount?.toLocaleString('fr-FR')} pulls · {repository.starCount} ⭐</span>
          {repository.description && <span className="faint dhl-summary-desc">{repository.description}</span>}
        </div>
      )}

      {tags && (
        <div className="dhl-table-wrap">
          <table className="dhl-table">
            <thead>
              <tr>
                {['Tag', 'Taille', 'Architectures', 'Dernière mise à jour'].map((c) => (
                  <th key={c} className="dhl-th">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tags.length === 0 ? (
                <tr><td colSpan={4} className="dhl-empty-row">Aucun tag trouvé</td></tr>
              ) : tags.map((t) => (
                <tr key={t.name} className="dhl-row">
                  <td className="dhl-td mono">{t.name}</td>
                  <td className="dhl-td mono muted">{formatSize(t.sizeBytes)}</td>
                  <td className="dhl-td faint">{t.architectures.join(', ') || '—'}</td>
                  <td className="dhl-td-updated">{formatDate(t.lastUpdated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
