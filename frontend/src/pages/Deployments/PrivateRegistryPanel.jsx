import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import DemoNote from '../../components/ui/DemoNote.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './TrivyScanPanel.css';
import './PrivateRegistryPanel.css';

function formatSize(bytes) {
  if (!bytes) return '—';
  const mb = bytes / 1_000_000;
  return mb >= 1000 ? `${(mb / 1000).toFixed(2)} Go` : `${mb.toFixed(1)} Mo`;
}

// Registre d'images privé réel (Docker Distribution — voir
// backend/src/services/integrations/privateRegistryService.js), pour les
// images propriétaires. Nécessite d'être activé/configuré (install.sh puis
// Paramètres → Registre privé) — reste honnête si absent plutôt que
// d'afficher une liste inventée.
export default function PrivateRegistryPanel() {
  const notify = useNotify();
  const { data: settings } = useApi(() => api.get('/settings'), []);
  const configured = settings?.integrations?.registry?.configured;
  const { data, loading, reload } = useApi(() => (configured ? api.get('/registry/repositories') : Promise.resolve(null)), [configured]);
  const [openRepo, setOpenRepo] = useState(null);
  const [tags, setTags] = useState(null);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [manifests, setManifests] = useState({});

  const repositories = data?.repositories || [];

  async function openRepository(repo) {
    setOpenRepo(repo);
    setTags(null);
    setManifests({});
    setTagsLoading(true);
    try {
      const res = await api.get(`/registry/tags?repo=${encodeURIComponent(repo)}`);
      setTags(res.tags);
      for (const tag of res.tags) {
        api.get(`/registry/manifest?repo=${encodeURIComponent(repo)}&tag=${encodeURIComponent(tag)}`)
          .then((m) => setManifests((prev) => ({ ...prev, [tag]: m.manifest })))
          .catch(() => {});
      }
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setTagsLoading(false);
    }
  }

  async function removeTag(tag) {
    if (!confirm(`Supprimer l'étiquette "${openRepo}:${tag}" du registre ?`)) return;
    try {
      await api.del(`/registry/tags?repo=${encodeURIComponent(openRepo)}&tag=${encodeURIComponent(tag)}`);
      notify('Étiquette supprimée', { type: 'ok' });
      openRepository(openRepo);
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  if (!configured) {
    return (
      <Panel title="Registre d'images privé" sub="Docker Distribution — pour vos builds propriétaires" span={12}>
        <DemoNote>
          Aucun registre privé configuré. Activez-le lors de l'installation (<code>./install.sh</code>, question dédiée) puis renseignez
          Paramètres → Registre privé. Sans lui, seules les images publiques (Docker Hub) sont accessibles.
        </DemoNote>
      </Panel>
    );
  }

  return (
    <Panel title="Registre d'images privé" sub="Docker Distribution, en direct — dépôts et étiquettes réellement présents sur votre registre" span={12}>
      <div className="trivy-body">
        <div className="trivy-sidebar">
          {loading ? (
            <div className="faint trivy-sidebar-empty">Chargement…</div>
          ) : repositories.length === 0 ? (
            <div className="faint trivy-sidebar-empty">Aucune image poussée pour l'instant.</div>
          ) : (
            repositories.map((repo) => (
              <div
                key={repo} onClick={() => openRepository(repo)}
                className={`trivy-scan-row${openRepo === repo ? ' trivy-scan-row-active' : ''}`}
              >
                <span className="mono registry-repo-name">{repo}</span>
              </div>
            ))
          )}
        </div>
        <div className="trivy-detail">
          {!openRepo ? (
            <div className="faint trivy-detail-empty">Sélectionnez un dépôt pour voir ses étiquettes.</div>
          ) : tagsLoading ? (
            <div className="faint">Chargement…</div>
          ) : (
            <table className="registry-tags-table">
              <thead>
                <tr>
                  {['Étiquette', 'Taille', 'Digest', ''].map((c) => (
                    <th key={c} className="registry-tags-head">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(tags || []).map((tag) => {
                  const m = manifests[tag];
                  return (
                    <tr key={tag} className="registry-tags-row">
                      <td className="registry-tags-cell mono">{tag}</td>
                      <td className="registry-tags-cell mono muted">{m ? formatSize(m.sizeBytes) : '…'}</td>
                      <td className="registry-tags-cell registry-tags-digest mono muted">{m?.digest || '…'}</td>
                      <td className="registry-tags-cell">
                        <button className="btn registry-remove-btn" type="button" onClick={() => removeTag(tag)}>
                          <Icon name="trash" size={12} /> Supprimer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Panel>
  );
}
