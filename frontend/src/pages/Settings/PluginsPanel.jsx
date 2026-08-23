import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './PluginsPanel.css';

const STATUS_LABELS = { installed: 'Installé', active: 'Actif', disabled: 'Désactivé' };
const STATUS_TONE = { installed: 'mut', active: 'ok', disabled: 'warn' };
const PERM_STATUS_LABELS = { pending: 'En attente', granted: 'Accordée', denied: 'Refusée' };
const PERM_STATUS_TONE = { pending: 'warn', granted: 'ok', denied: 'crit' };
const HEALTH_LABELS = { healthy: 'Sain', degraded: 'Dégradé', unhealthy: 'Défaillant' };
const HEALTH_TONE = { healthy: 'ok', degraded: 'warn', unhealthy: 'crit' };

const MANIFEST_PLACEHOLDER = `{
  "id": "mon-plugin",
  "name": "Mon plugin",
  "version": "1.0.0",
  "apiVersion": "1.0",
  "permissions": ["plugin:catalog.read"],
  "contributes": { "menus": [{ "label": "Mon plugin" }] }
}`;

// Registre des plugins NexUs (Lot 1 : socle backend en place — voir
// backend/src/services/plugins/. Ce panneau consomme /api/plugins tel
// qu'il existe aujourd'hui : installation par manifest JSON collé
// directement (le chargement depuis un dossier local / un registre distant
// est un lot ultérieur), puis activation/désactivation/suppression.
export default function PluginsPanel() {
  const { data, error, reload } = useApi(() => api.get('/plugins'), []);
  const notify = useNotify();
  const [installing, setInstalling] = useState(false);
  const [installMode, setInstallMode] = useState('manifest'); // 'manifest' | 'local' | 'git'
  const [manifestText, setManifestText] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [gitRef, setGitRef] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [detail, setDetail] = useState(null);

  const items = data?.items || [];

  async function install(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (installMode === 'manifest') {
        let manifest;
        try {
          manifest = JSON.parse(manifestText);
        } catch {
          notify('Manifest JSON invalide', { type: 'crit' });
          setBusy(false);
          return;
        }
        await api.post('/plugins/install', { manifest });
      } else if (installMode === 'local') {
        await api.post('/plugins/install-local', { path: localPath });
      } else {
        await api.post('/plugins/install-git', { repoUrl: gitRepoUrl, ref: gitRef || undefined });
      }
      notify('Plugin installé (permissions en attente d\'approbation)', { type: 'ok' });
      setInstalling(false);
      setManifestText('');
      setLocalPath('');
      setGitRepoUrl('');
      setGitRef('');
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const params = new URLSearchParams();
    if (templateId) params.set('id', templateId);
    if (templateName) params.set('name', templateName);
    window.open(`/api/plugins/template${params.toString() ? `?${params}` : ''}`, '_blank');
  }

  async function toggleActive(plugin) {
    setBusyId(plugin.id);
    try {
      await api.post(`/plugins/${plugin.id}/${plugin.status === 'active' ? 'disable' : 'activate'}`);
      notify(plugin.status === 'active' ? 'Plugin désactivé' : 'Plugin activé', { type: 'ok' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusyId(null);
    }
  }

  async function uninstall(plugin) {
    if (!confirm(`Désinstaller définitivement "${plugin.name}" ?`)) return;
    setBusyId(plugin.id);
    try {
      await api.del(`/plugins/${plugin.id}`);
      notify('Plugin désinstallé', { type: 'ok' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusyId(null);
    }
  }

  if (error) {
    return <div className="faint">{error.status === 503 ? 'Socle plugins indisponible (base de données non configurée).' : `Erreur : ${error.message}`}</div>;
  }

  return (
    <>
      <Panel
        title="Plugins installés"
        sub="Extensions du cœur NexUs — un plugin actif n'a accès qu'aux permissions déclarées dans son manifest, jamais aux droits admin"
        span={12}
        actions={<span className="btn" onClick={() => setInstalling(true)}><Icon name="plus" size={13} /> Installer un plugin</span>}
      >
        {items.length === 0 ? (
          <div className="faint">Aucun plugin installé.</div>
        ) : (
          <div className="plugins-list">
            {items.map((p) => (
              <div key={p.id} className="plugins-row">
                <div className="plugins-row-main" onClick={() => setDetail(p)}>
                  <span className="plugins-row-name">{p.name}</span>
                  <span className="faint">{p.id}@{p.version}</span>
                </div>
                <span className={`badge badge-${STATUS_TONE[p.status]}`}><span className="dot" />{STATUS_LABELS[p.status]}</span>
                <span className="btn-outline plugins-action-btn" onClick={() => toggleActive(p)} aria-busy={busyId === p.id}>
                  {p.status === 'active' ? 'Désactiver' : 'Activer'}
                </span>
                <span className="btn-outline plugins-action-btn plugins-danger" onClick={() => uninstall(p)} aria-busy={busyId === p.id}>
                  <Icon name="trash" size={13} />
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {installing && (
        <Modal title="Installer un plugin" onClose={() => setInstalling(false)}>
          <form onSubmit={install} className="plugins-install-form">
            <div className="plugins-template-row">
              <span className="faint">Nouveau plugin ? Téléchargez le template officiel (manifest valide, tests, CI, README) : </span>
              <input className="input" placeholder="id (ex: mon-plugin)" value={templateId} onChange={(e) => setTemplateId(e.target.value)} />
              <input className="input" placeholder="nom affiché" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
              <span className="btn-outline" onClick={downloadTemplate}>Télécharger le template</span>
            </div>

            <div className="plugins-install-tabs">
              <span className={`btn-outline${installMode === 'manifest' ? ' plugins-tab-active' : ''}`} onClick={() => setInstallMode('manifest')}>Manifest collé</span>
              <span className={`btn-outline${installMode === 'local' ? ' plugins-tab-active' : ''}`} onClick={() => setInstallMode('local')}>Dossier local (dev)</span>
              <span className={`btn-outline${installMode === 'git' ? ' plugins-tab-active' : ''}`} onClick={() => setInstallMode('git')}>Dépôt Git distant</span>
            </div>

            {installMode === 'manifest' && (
              <>
                <p className="faint">Collez le manifest JSON du plugin (voir le format dans la documentation développeur — id, name, version, apiVersion, permissions, contributes).</p>
                <textarea
                  className="input"
                  rows={12}
                  placeholder={MANIFEST_PLACEHOLDER}
                  value={manifestText}
                  onChange={(e) => setManifestText(e.target.value)}
                />
              </>
            )}
            {installMode === 'local' && (
              <>
                <p className="faint">Chemin absolu, sur le serveur backend, d'un dossier contenant un fichier <code>manifest.json</code> (mode développeur).</p>
                <input className="input" placeholder="/chemin/absolu/vers/mon-plugin" value={localPath} onChange={(e) => setLocalPath(e.target.value)} />
              </>
            )}
            {installMode === 'git' && (
              <>
                <p className="faint">URL d'un dépôt Git public (GitHub/GitLab/Gitea) contenant <code>manifest.json</code> à la racine.</p>
                <input className="input" placeholder="https://github.com/compte/mon-plugin" value={gitRepoUrl} onChange={(e) => setGitRepoUrl(e.target.value)} />
                <input className="input" placeholder="branche/ref (défaut : main)" value={gitRef} onChange={(e) => setGitRef(e.target.value)} />
              </>
            )}

            <p className="faint">Après installation, toutes les permissions déclarées restent en attente jusqu'à approbation admin dans la fiche du plugin — le plugin ne pourra pas être activé tant qu'elles ne sont pas toutes accordées.</p>
            <div className="plugins-install-actions">
              <button className="btn" type="submit" disabled={busy}>Installer</button>
              <span className="btn-outline" onClick={() => setInstalling(false)}>Annuler</span>
            </div>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal title={detail.name} onClose={() => setDetail(null)}>
          <PluginDetail plugin={detail} />
        </Modal>
      )}
    </>
  );
}

function PluginDetail({ plugin }) {
  const permissions = useApi(() => api.get(`/plugins/${plugin.id}/permissions`), [plugin.id]);
  const events = useApi(() => api.get(`/plugins/${plugin.id}/events`), [plugin.id]);
  const health = useApi(() => api.get(`/plugins/${plugin.id}/health`), [plugin.id]);
  const notify = useNotify();
  const [decidingKey, setDecidingKey] = useState(null);

  const items = permissions.data?.items || [];
  const blockedCount = items.filter((p) => p.status !== 'granted').length;

  async function decide(permissionKey, decision) {
    setDecidingKey(permissionKey);
    try {
      await api.post(`/plugins/${plugin.id}/permissions/${encodeURIComponent(permissionKey)}/${decision}`);
      notify(decision === 'grant' ? 'Permission accordée' : 'Permission refusée', { type: 'ok' });
      permissions.reload();
      health.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setDecidingKey(null);
    }
  }

  return (
    <div className="plugins-detail">
      <div><strong>Version :</strong> {plugin.version} (API {plugin.apiVersion})</div>
      <div><strong>Statut :</strong> {STATUS_LABELS[plugin.status]}</div>
      <div><strong>Origine :</strong> {plugin.source === 'local-dev' ? `Dossier local (${plugin.sourceRef})` : plugin.source === 'git' ? `Dépôt Git (${plugin.sourceRef})` : 'Manifest collé'}</div>
      <div>
        <strong>Santé :</strong>{' '}
        {health.data ? (
          <span className={`badge badge-${HEALTH_TONE[health.data.status]}`}><span className="dot" />{HEALTH_LABELS[health.data.status]}</span>
        ) : <span className="faint">chargement…</span>}
        {health.data && (
          <ul className="plugins-events-list">
            {health.data.checks.map((c) => (
              <li key={c.name} className={c.ok ? '' : 'plugins-health-fail'}>{c.ok ? '✓' : '✗'} {c.detail}</li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <strong>Permissions :</strong>
        {blockedCount > 0 && plugin.status !== 'active' && (
          <div className="plugins-permissions-warning">Ce plugin ne peut pas être activé : {blockedCount} permission(s) non accordée(s).</div>
        )}
        {items.length === 0 ? (
          <span className="faint"> aucune</span>
        ) : (
          <div className="plugins-permissions-list">
            {items.map((p) => (
              <div key={p.key} className="plugins-permission-row">
                <span className="badge badge-mut">{p.key}</span>
                <span className={`badge badge-${PERM_STATUS_TONE[p.status]}`}><span className="dot" />{PERM_STATUS_LABELS[p.status]}</span>
                {p.status !== 'granted' && (
                  <span className="btn-outline plugins-action-btn" aria-busy={decidingKey === p.key} onClick={() => decide(p.key, 'grant')}>Accorder</span>
                )}
                {p.status !== 'denied' && (
                  <span className="btn-outline plugins-action-btn plugins-danger" aria-busy={decidingKey === p.key} onClick={() => decide(p.key, 'deny')}>Refuser</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <strong>Événements récents :</strong>
        {(events.data?.items || []).length === 0 ? (
          <span className="faint"> aucun</span>
        ) : (
          <ul className="plugins-events-list">
            {events.data.items.map((ev, i) => <li key={i}>{ev.event_type} — {new Date(ev.created_at).toLocaleString('fr-FR')}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
