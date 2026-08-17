import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './ScanPanels.css';

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR');
}

// Analyse IaC réelle via Checkov (open source, Bridgecrew CE — voir
// backend/src/services/checkovService.js) sur les Dockerfiles de la
// plateforme elle-même.
export default function IacScanPanel() {
  const notify = useNotify();
  const { data, loading, reload } = useApi(() => api.get('/iac-scans'), []);
  const [scanning, setScanning] = useState(false);
  const [openScan, setOpenScan] = useState(null);

  const scans = data?.items || [];
  const active = scans.find((s) => s.id === openScan) || scans[0] || null;

  async function runScan() {
    setScanning(true);
    try {
      const res = await api.post('/iac-scans');
      notify(`Scan terminé — ${res.scan.total} vérification(s) échouée(s)`, { type: res.scan.total ? 'warn' : 'ok' });
      setOpenScan(res.scan.id);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setScanning(false);
    }
  }

  return (
    <Panel
      title="Analyse IaC (Dockerfiles)"
      sub="Checkov, open source — bonnes pratiques de sécurité sur les Dockerfiles réels de la plateforme"
      span={12}
      actions={
        <span className={`btn-outline scanp-run-btn${scanning ? ' scanp-run-btn-disabled' : ''}`} onClick={scanning ? undefined : runScan}>
          <Icon name={scanning ? 'refresh' : 'layers'} size={13} />{scanning ? 'Scan en cours…' : 'Lancer un scan'}
        </span>
      }
    >
      <div className="scanp-body" style={{ minHeight: 140 }}>
        <div className="scanp-list" style={{ maxHeight: 300 }}>
          {loading ? (
            <div className="faint scanp-list-msg">Chargement…</div>
          ) : scans.length === 0 ? (
            <div className="faint scanp-list-msg">Aucun scan encore lancé</div>
          ) : (
            scans.map((s) => (
              <div
                key={s.id} onClick={() => setOpenScan(s.id)}
                className={`scanp-list-item${active?.id === s.id ? ' scanp-list-item-active' : ''}`}
              >
                <div className="scanp-list-item-title">{s.total} finding(s)</div>
                <div className="faint scanp-list-item-date">{formatDate(s.scannedAt)}</div>
              </div>
            ))
          )}
        </div>

        <div className="scanp-results">
          {!active ? (
            <div className="faint scanp-results-empty" style={{ paddingTop: 30 }}>Lancez un scan pour voir les résultats ici.</div>
          ) : active.total === 0 ? (
            <span className="badge badge-ok"><span className="dot" />Aucun problème détecté</span>
          ) : (
            <div className="scanp-table-wrap">
              <table className="scanp-table">
                <thead>
                  <tr>
                    {['Check', 'Fichier', 'Description'].map((c) => (
                      <th key={c} className="scanp-th">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {active.findings.map((f, i) => (
                    <tr key={i} className="scanp-row">
                      <td className="scanp-td mono">{f.checkId}</td>
                      <td className="scanp-td mono muted">{f.file}{f.lines ? `:${f.lines[0]}` : ''}</td>
                      <td className="scanp-td">{f.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
