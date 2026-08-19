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
  const [manifestText, setManifestText] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [detail, setDetail] = useState(null);

  const items = data?.items || [];

  async function install(e) {
    e.preventDefault();
    let manifest;
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      notify('Manifest JSON invalide', { type: 'crit' });
      return;
    }
    setBusy(true);
    try {
      await api.post('/plugins/install', { manifest });
      notify('Plugin installé', { type: 'ok' });
      setInstalling(false);
      setManifestText('');
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
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
            <p className="faint">Collez le manifest JSON du plugin (voir le format dans la documentation développeur — id, name, version, apiVersion, permissions, contributes).</p>
            <textarea
              className="input"
              rows={12}
              placeholder={MANIFEST_PLACEHOLDER}
              value={manifestText}
              onChange={(e) => setManifestText(e.target.value)}
            />
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
  return (
    <div className="plugins-detail">
      <div><strong>Version :</strong> {plugin.version} (API {plugin.apiVersion})</div>
      <div><strong>Statut :</strong> {STATUS_LABELS[plugin.status]}</div>
      <div>
        <strong>Permissions :</strong>
        {(permissions.data?.items || []).length === 0 ? (
          <span className="faint"> aucune</span>
        ) : (
          <div className="plugins-permissions-list">
            {permissions.data.items.map((p) => <span key={p} className="badge badge-mut">{p}</span>)}
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
