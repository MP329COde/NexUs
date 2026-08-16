import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

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
        <span className="btn-outline" style={{ height: 28, padding: '0 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: scanning ? 'default' : 'pointer', opacity: scanning ? 0.6 : 1 }} onClick={scanning ? undefined : runScan}>
          <Icon name={scanning ? 'refresh' : 'sync'} size={13} />{scanning ? 'Scan en cours…' : 'Lancer un scan maintenant'}
        </span>
      }
    >
      <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-soft)' }}>
        <span className="faint" style={{ fontSize: 11.5 }}>
          Planifié chaque jour à 4h. {lastScanAt ? `Dernière détection : ${formatDate(lastScanAt)}` : 'Aucune fuite détectée depuis le dernier scan.'}
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Chargement…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Aucune fuite détectée à ce jour</div>
      ) : (
        <div style={{ padding: 6 }}>
          {items.slice(0, 20).map((leak) => (
            <div key={leak.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="alertTriangle" size={14} style={{ color: 'var(--tone-crit-fg)', flex: 'none' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{leak.label} <span className="faint" style={{ fontWeight: 400 }}>({leak.tier})</span></div>
                <div className="mono faint" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leak.repoKey} — {leak.filePath}</div>
              </div>
              <span className={`badge badge-${leak.action === 'rotated' ? 'ok' : 'warn'}`} style={{ flex: 'none' }}>
                <span className="dot" />{leak.action === 'rotated' ? 'Secret régénéré' : 'Détecté'}
              </span>
              <span className="faint" style={{ fontSize: 10.5, flex: 'none' }}>{formatDate(leak.detectedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
