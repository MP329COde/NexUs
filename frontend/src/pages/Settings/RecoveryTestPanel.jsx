import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

const STATUS_LABELS = {
  starting: 'Démarrage…',
  running: 'En cours',
  failed: 'Échec',
  crashed: 'Arrêté (crash)',
  destroyed: 'Détruit'
};

// Recovery Test (backend/services/recoveryTestService.js) : restaure une
// sauvegarde dans un second process backend isolé (port éphémère, dossier de
// données temporaire) pour vérifier qu'elle démarre réellement et contient
// des données, sans jamais toucher à l'instance active. `needsSetup: false`
// est la preuve honnête que la restauration fonctionne (un admin existe dans
// la base restaurée) — jamais un statut "OK" inventé côté frontend.
export default function RecoveryTestPanel() {
  const tests = useApi(() => api.get('/backups/recovery-tests'), [], { pollMs: 5000 });
  const notify = useNotify();
  const [destroying, setDestroying] = useState(null);

  async function destroy(id) {
    setDestroying(id);
    try {
      await api.del(`/backups/recovery-tests/${id}`);
      notify('Test de restauration détruit', { type: 'info' });
      tests.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setDestroying(null);
    }
  }

  const items = tests.data?.items || [];

  return (
    <Panel
      title="Recovery Test"
      sub="Restaure une sauvegarde dans un environnement isolé pour la valider, sans jamais toucher à la base active — détruit automatiquement après 15 min"
      span={12}
    >
      {items.length === 0 ? (
        <div className="faint" style={{ padding: 16 }}>
          Aucun test en cours. Lancez « Tester la restauration » depuis une sauvegarde ci-dessus.
        </div>
      ) : (
        <DataTable
          columns={['Sauvegarde', 'Statut', 'Port', 'Démarré le', 'Expire à', '']}
          rows={items}
          renderRow={(t) => (
            <tr key={t.id}>
              <td className="mono">{t.backupFile}</td>
              <td>
                <span className={`badge badge-${t.status === 'running' ? 'ok' : t.status === 'starting' ? 'info' : 'crit'}`}>
                  <span className="dot" />{STATUS_LABELS[t.status] || t.status}
                </span>
                {t.status === 'running' && (
                  <span className="faint" style={{ marginLeft: 6 }}>
                    {t.needsSetup === false ? 'admin présent — restauration validée' : t.needsSetup === true ? 'base vide (aucun utilisateur)' : ''}
                  </span>
                )}
                {t.error && <div className="faint" style={{ marginTop: 2 }}>{t.error}</div>}
              </td>
              <td className="mono faint">{t.status === 'running' ? t.port : '—'}</td>
              <td className="mono faint">{new Date(t.startedAt).toLocaleTimeString('fr-FR')}</td>
              <td className="mono faint">{t.expiresAt ? new Date(t.expiresAt).toLocaleTimeString('fr-FR') : '—'}</td>
              <td>
                <div className="system-row-actions">
                  {t.status === 'running' && (
                    <a className="btn-outline system-action-btn" href={`http://localhost:${t.port}/api/status/health`} target="_blank" rel="noreferrer">
                      <Icon name="externalLink" size={12} />Ouvrir l'API
                    </a>
                  )}
                  <span className="btn-outline system-action-btn system-action-btn-danger" onClick={() => destroy(t.id)}>
                    {destroying === t.id ? 'Destruction…' : 'Détruire'}
                  </span>
                </div>
              </td>
            </tr>
          )}
        />
      )}
    </Panel>
  );
}
