import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './ScanPanels.css';

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('fr-FR');
}

// Historique du scan quotidien des dépôts liés aux projets, à la recherche
// d'un secret prod/projet connu committé en clair (voir
// backend/src/services/secretLeakScanService.js) — rotation automatique
// immédiate en cas de détection, jamais de secret affiché ici (seulement
// son label et son emplacement). Admin uniquement, comme le reste de
// Secrets & variables.
export default function SecretLeakScanPanel() {
  const notify = useNotify();
  const { data, loading, reload } = useApi(() => api.get('/security/secret-leaks'), []);
  const [scanning, setScanning] = useState(false);

  const items = data?.items || [];
  const lastScanAt = data?.lastScanAt;

  async function runScan() {
    setScanning(true);
    try {
      const res = await api.post('/security/secret-leaks/scan');
      notify(
        res.items.length > items.length ? `Scan terminé — ${res.items.length - items.length} nouvelle(s) fuite(s) détectée(s) et corrigée(s)` : 'Scan terminé — aucune fuite détectée',
        { type: res.items.length > items.length ? 'crit' : 'ok' }
      );
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setScanning(false);
    }
  }

  return (
    <Panel
      title="Scan de secrets committés"
      sub="Dépôts liés aux projets, à la recherche d'un secret prod/projet connu — rotation automatique immédiate si trouvé"
      span={12}
      actions={
        <span className={`btn-outline scanp-run-btn${scanning ? ' scanp-run-btn-disabled' : ''}`} onClick={scanning ? undefined : runScan}>
          <Icon name={scanning ? 'refresh' : 'sync'} size={13} />{scanning ? 'Scan en cours…' : 'Lancer un scan maintenant'}
        </span>
      }
    >
      <div className="scanp-schedule-row">
        <span className="faint scanp-schedule-note">
          Planifié chaque jour à 4h. {lastScanAt ? `Dernière détection : ${formatDate(lastScanAt)}` : 'Aucune fuite détectée depuis le dernier scan.'}
        </span>
      </div>

      {loading ? (
        <div className="scanp-simple-empty">Chargement…</div>
      ) : items.length === 0 ? (
        <div className="scanp-simple-empty">Aucune fuite détectée à ce jour</div>
      ) : (
        <div className="scanp-leak-list">
          {items.slice(0, 20).map((leak) => (
            <div key={leak.id} className="scanp-leak-row">
              <Icon name="alertTriangle" size={14} className="scanp-leak-icon" />
              <div className="scanp-leak-body">
                <div className="scanp-leak-label">{leak.label} <span className="faint scanp-leak-tier">({leak.tier})</span></div>
                <div className="mono faint scanp-leak-path">{leak.repoKey} — {leak.filePath}</div>
              </div>
              <span className={`badge badge-${leak.action === 'rotated' ? 'ok' : 'warn'} scanp-leak-badge`}>
                <span className="dot" />{leak.action === 'rotated' ? 'Secret régénéré' : 'Détecté'}
              </span>
              <span className="faint scanp-leak-time">{formatDate(leak.detectedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
