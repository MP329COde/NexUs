import { useRef, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import RestoreBackupDialog from './RestoreBackupDialog.jsx';

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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
      <Panel title="Version" span={6}>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 24, marginBottom: 14 }}>
            <div>
              <div className="faint" style={{ fontSize: 11 }}>Version</div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{version.data?.version.packageVersion || '—'}</div>
            </div>
            <div>
              <div className="faint" style={{ fontSize: 11 }}>Commit</div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{version.data?.version.commit || '—'}</div>
            </div>
            <div>
              <div className="faint" style={{ fontSize: 11 }}>Branche</div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{version.data?.version.branch || '—'}</div>
            </div>
          </div>
          <span className="btn-outline" onClick={checkUpdates} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="refresh" size={13} className={checking ? 'spin' : ''} />Vérifier les mises à jour
          </span>
          {updateInfo && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, fontSize: 12.5, background: updateInfo.upToDate ? 'var(--tone-ok-bg)' : 'var(--tone-warn-bg)', color: updateInfo.upToDate ? 'var(--tone-ok-fg)' : 'var(--tone-warn-fg)' }}>
              {updateInfo.message}
            </div>
          )}
          <p className="faint" style={{ fontSize: 11.5, marginTop: 12 }}>
            La console ne s'auto-met-à-jour jamais : appliquez la mise à jour vous-même (<code className="mono">git pull</code> puis redémarrage) une fois prévenu ici.
          </p>
        </div>
      </Panel>

      <Panel
        title="Sauvegardes"
        sub="Copie horodatée de la base (nexus.db), planifiée chaque nuit à 3h — 14 dernières conservées"
        span={12}
        actions={(
          <div style={{ display: 'flex', gap: 8 }}>
            <input ref={fileInputRef} type="file" accept=".db" style={{ display: 'none' }} onChange={onFileSelected} />
            <span className="btn-outline" onClick={() => fileInputRef.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="externalLink" size={13} className={importing ? 'spin' : ''} />{importing ? 'Import…' : 'Importer un fichier .db'}
            </span>
            <span className="btn-outline" onClick={createBackup} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
              <td className="mono" style={{ fontSize: 12 }}>{b.file}</td>
              <td className="mono muted">{formatSize(b.sizeBytes)}</td>
              <td>
                {b.hasRelationalDump
                  ? <span className="badge" style={{ color: 'var(--tone-ok-fg)' }}>Inclus</span>
                  : <span className="badge faint" title="Organisations, projets, RBAC, incidents et changements ne sont pas dans cette sauvegarde">Non inclus</span>}
              </td>
              <td className="mono faint">{new Date(b.createdAt).toLocaleString('fr-FR')}</td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <a className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center' }} href={`/api/backups/${b.file}/download`} target="_blank" rel="noreferrer">Télécharger</a>
                  <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5 }} onClick={() => setRestoreTarget(b.file)}>Restaurer</span>
                  <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, color: 'var(--tone-crit-fg)' }} onClick={() => removeBackup(b.file)}>Suppr.</span>
                </div>
              </td>
            </tr>
          )}
        />
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
