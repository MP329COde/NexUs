import { useRef, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import RestoreBackupDialog from './RestoreBackupDialog.jsx';
import './SystemPanel.css';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function SystemPanel() {
  const version = useApi(() => api.get('/system/version'), []);
  const backups = useApi(() => api.get('/backups'), []);
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [importing, setImporting] = useState(false);
  const [gitBusy, setGitBusy] = useState(false);
  const [gitRemoteItems, setGitRemoteItems] = useState(null);
  const fileInputRef = useRef(null);
  const notify = useNotify();

  async function checkUpdates() {
    setChecking(true);
    try {
      const res = await api.get('/system/updates/check');
      setUpdateInfo(res);
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setChecking(false);
    }
  }

  async function createBackup() {
    try {
      await api.post('/backups', {});
      notify('Sauvegarde créée', { type: 'ok' });
      backups.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function removeBackup(file) {
    if (!confirm(`Supprimer la sauvegarde ${file} ?`)) return;
    await api.del(`/backups/${file}`);
    backups.reload();
  }

  async function onFileSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const dataBase64 = await readFileAsBase64(file);
      await api.post('/backups/import', { filename: file.name, dataBase64 });
      notify(`${file.name} importé — utilisez "Restaurer" pour l'appliquer`, { type: 'ok' });
      backups.reload();
    } catch (err) {
      notify(err.message, { type: 'crit', title: 'Import échoué' });
    } finally {
      setImporting(false);
    }
  }

  async function pushToGit() {
    setGitBusy(true);
    try {
      const res = await api.post('/backups/git/push', {});
      notify(res.message, { type: res.pushed ? 'ok' : 'info' });
      backups.reload();
    } catch (err) {
      notify(err.message, { type: 'crit', title: 'Échec du push Git' });
    } finally {
      setGitBusy(false);
    }
  }

  async function checkGitRemote() {
    setGitBusy(true);
    try {
      const res = await api.get('/backups/git/list');
      setGitRemoteItems(res.items);
      notify(`${res.items.length} sauvegarde(s) trouvée(s) sur le dépôt distant`, { type: 'ok' });
    } catch (err) {
      notify(err.message, { type: 'crit', title: 'Échec de la vérification du dépôt' });
    } finally {
      setGitBusy(false);
    }
  }

  async function importFromGit(file) {
    try {
      const res = await api.post(`/backups/git/import/${encodeURIComponent(file)}`, {});
      notify(`${res.backup.file} importé — utilisez "Restaurer" pour l'appliquer`, { type: 'ok' });
      backups.reload();
    } catch (err) {
      notify(err.message, { type: 'crit', title: 'Import échoué' });
    }
  }

  return (
    <div className="system-grid">
      <Panel title="Version" span={6}>
        <div className="system-panel-body">
          <div className="system-version-row">
            <div>
              <div className="faint system-version-label">Version</div>
              <div className="mono system-version-value">{version.data?.version.packageVersion || '—'}</div>
            </div>
            <div>
              <div className="faint system-version-label">Commit</div>
              <div className="mono system-version-value">{version.data?.version.commit || '—'}</div>
            </div>
            <div>
              <div className="faint system-version-label">Branche</div>
              <div className="mono system-version-value">{version.data?.version.branch || '—'}</div>
            </div>
          </div>
          <span className="btn-outline system-check-btn" onClick={checkUpdates}>
            <Icon name="refresh" size={13} className={checking ? 'spin' : ''} />Vérifier les mises à jour
          </span>
          {updateInfo && (
            <div className="system-update-result" style={{ background: updateInfo.upToDate ? 'var(--tone-ok-bg)' : 'var(--tone-warn-bg)', color: updateInfo.upToDate ? 'var(--tone-ok-fg)' : 'var(--tone-warn-fg)' }}>
              {updateInfo.message}
            </div>
          )}
          <p className="faint system-note">
            La console ne s'auto-met-à-jour jamais : appliquez la mise à jour vous-même (<code className="mono">git pull</code> puis redémarrage) une fois prévenu ici.
          </p>
        </div>
      </Panel>

      <Panel
        title="Sauvegardes"
        sub="Copie horodatée de la base (nexus.db), planifiée chaque nuit à 3h — 14 dernières conservées"
        span={12}
        actions={(
          <div className="system-backup-actions">
            <input ref={fileInputRef} type="file" accept=".db" className="system-file-input" onChange={onFileSelected} />
            <span className="btn-outline system-import-btn" onClick={() => fileInputRef.current?.click()}>
              <Icon name="externalLink" size={13} className={importing ? 'spin' : ''} />{importing ? 'Import…' : 'Importer un fichier .db'}
            </span>
            <span className="btn-outline system-import-btn" onClick={createBackup}>
              <Icon name="plus" size={13} />Sauvegarder maintenant
            </span>
          </div>
        )}
      >
        <DataTable
          columns={['Fichier', 'Taille', 'Socle relationnel', 'Créée le', '']}
          rows={backups.data?.items}
          emptyTitle="Aucune sauvegarde"
          renderRow={(b) => (
            <tr key={b.file}>
              <td className="mono system-cell-file">{b.file}</td>
              <td className="mono muted">{formatSize(b.sizeBytes)}</td>
              <td>
                {b.hasRelationalDump
                  ? <span className="badge system-included-badge">Inclus</span>
                  : <span className="badge faint" title="Organisations, projets, RBAC, incidents et changements ne sont pas dans cette sauvegarde">Non inclus</span>}
              </td>
              <td className="mono faint">{new Date(b.createdAt).toLocaleString('fr-FR')}</td>
              <td>
                <div className="system-row-actions">
                  <a className="btn-outline system-download-btn" href={`/api/backups/${b.file}/download`} target="_blank" rel="noreferrer">Télécharger</a>
                  <span className="btn-outline system-action-btn" onClick={() => setRestoreTarget(b.file)}>Restaurer</span>
                  <span className="btn-outline system-action-btn system-action-btn-danger" onClick={() => removeBackup(b.file)}>Suppr.</span>
                </div>
              </td>
            </tr>
          )}
        />
      </Panel>

      <Panel
        title="Sauvegarde Git"
        sub="Copie des sauvegardes vers votre dépôt Git (Paramètres → Intégrations → Sauvegarde Git) — restaurable même si cette machine est perdue"
        span={12}
        actions={(
          <div className="system-backup-actions">
            <span className="btn-outline system-import-btn" onClick={checkGitRemote}>
              <Icon name="refresh" size={13} className={gitBusy ? 'spin' : ''} />Vérifier le dépôt distant
            </span>
            <span className="btn-outline system-import-btn" onClick={pushToGit}>
              <Icon name="gitBranch" size={13} className={gitBusy ? 'spin' : ''} />Pousser maintenant
            </span>
          </div>
        )}
      >
        {gitRemoteItems === null ? (
          <p className="faint system-note">Cliquez sur « Vérifier le dépôt distant » pour lister les sauvegardes déjà poussées, ou « Pousser maintenant » pour en créer une nouvelle et l'envoyer.</p>
        ) : gitRemoteItems.length === 0 ? (
          <p className="faint system-note">Aucune sauvegarde trouvée sur le dépôt distant pour le moment.</p>
        ) : (
          <DataTable
            columns={['Fichier', 'Taille', 'Modifiée le', '']}
            rows={gitRemoteItems}
            renderRow={(b) => (
              <tr key={b.file}>
                <td className="mono system-cell-file">{b.file}</td>
                <td className="mono muted">{formatSize(b.sizeBytes)}</td>
                <td className="mono faint">{new Date(b.mtime).toLocaleString('fr-FR')}</td>
                <td>
                  <span className="btn-outline system-action-btn" onClick={() => importFromGit(b.file)}>Importer</span>
                </td>
              </tr>
            )}
          />
        )}
      </Panel>

      {restoreTarget && (
        <RestoreBackupDialog
          file={restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onRestored={() => { setRestoreTarget(null); backups.reload(); }}
        />
      )}
    </div>
  );
}
