import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './TrivyScanPanel.css';

const SEVERITY_TONE = { CRITICAL: 'crit', HIGH: 'crit', MEDIUM: 'warn', LOW: 'mut', UNKNOWN: 'mut' };
const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR');
}

// Scan de vulnérabilités réel via Trivy (open source, exécuté en local sur
// la machine backend — voir backend/src/services/trivyService.js). Aucun
// registre n'est intégré à la console, mais n'importe quelle image
// accessible publiquement (Docker Hub, GHCR public...) peut être scannée à
// la demande, indépendamment du tableau de démonstration ci-dessous.
// Chaque image scannée au moins une fois est ensuite re-scannée
// automatiquement toutes les heures (voir scheduledTrivyScanService.js).
export default function TrivyScanPanel() {
  const notify = useNotify();
  const { data, loading, reload } = useApi(() => api.get('/image-scans'), []);
  const [imageRef, setImageRef] = useState('');
  const [scanning, setScanning] = useState(false);
  const [openScan, setOpenScan] = useState(null);

  const scans = data?.items || [];

  async function runScan(e) {
    e.preventDefault();
    if (!imageRef.trim()) return;
    setScanning(true);
    try {
      const res = await api.post('/image-scans', { imageRef: imageRef.trim() });
      notify(`Scan terminé — ${res.scan.total} vulnérabilité(s) trouvée(s)`, { type: res.scan.counts.CRITICAL || res.scan.counts.HIGH ? 'crit' : res.scan.total ? 'warn' : 'ok' });
      setOpenScan(res.scan.id);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setScanning(false);
    }
  }

  const active = scans.find((s) => s.id === openScan) || scans[0] || null;

  return (
    <Panel
      title="Scanner Trivy"
      sub="Scan de vulnérabilités réel (Aqua Security, open source) sur n'importe quelle image accessible — indépendant du tableau de démonstration ci-dessous"
      span={12}
    >
      <form onSubmit={runScan} className="trivy-form">
        <input
          className="input mono trivy-form-input" placeholder="ex. nginx:1.27, alpine:3.19, ghcr.io/org/image:tag"
          value={imageRef} onChange={(e) => setImageRef(e.target.value)}
        />
        <button className="btn" type="submit" disabled={scanning || !imageRef.trim()}>
          {scanning ? 'Scan en cours (jusqu\'à 2 min)…' : 'Scanner'}
        </button>
      </form>

      <div className="trivy-body">
        <div className="trivy-sidebar">
          {loading ? (
            <div className="faint trivy-sidebar-empty">Chargement…</div>
          ) : scans.length === 0 ? (
            <div className="faint trivy-sidebar-empty">Aucun scan encore lancé</div>
          ) : (
            scans.map((s) => (
              <div
                key={s.id} onClick={() => setOpenScan(s.id)}
                className={`trivy-scan-row${active?.id === s.id ? ' trivy-scan-row-active' : ''}`}
              >
                <div className="mono trivy-scan-ref">{s.imageRef}</div>
                <div className="faint trivy-scan-date">{formatDate(s.scannedAt)}{s.trigger === 'scheduled' ? ' · planifié' : ''}</div>
              </div>
            ))
          )}
        </div>

        <div className="trivy-detail">
          {!active ? (
            <div className="faint trivy-detail-empty">Lancez un scan pour voir les résultats ici.</div>
          ) : (
            <>
              <div className="trivy-detail-header">
                <Icon name="image" size={15} className="trivy-detail-icon" />
                <span className="mono trivy-detail-ref">{active.imageRef}</span>
                {active.osFamily && <span className="faint trivy-detail-os">{active.osFamily} {active.osVersion}</span>}
                {active.trigger === 'scheduled' && <span className="badge badge-mut trivy-scheduled-badge">Scan planifié (horaire)</span>}
              </div>
              <div className="trivy-severity-row">
                {SEVERITY_ORDER.filter((sev) => active.counts[sev] > 0).map((sev) => (
                  <span key={sev} className={`badge badge-${SEVERITY_TONE[sev]}`}><span className="dot" />{active.counts[sev]} {sev}</span>
                ))}
                {active.total === 0 && <span className="badge badge-ok"><span className="dot" />Aucune vulnérabilité détectée</span>}
              </div>
              {active.findings.length > 0 && (
                <div className="trivy-findings-wrap">
                  <table className="trivy-findings-table">
                    <thead>
                      <tr>
                        {['CVE', 'Sévérité', 'Paquet', 'Installé', 'Corrigé'].map((c) => (
                          <th key={c} className="trivy-findings-head">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {active.findings.slice(0, 30).map((f, i) => (
                        <tr key={i} className="trivy-findings-row">
                          <td className="trivy-findings-cell mono">{f.id}</td>
                          <td className="trivy-findings-cell"><span className={`badge badge-${SEVERITY_TONE[f.severity]} trivy-findings-severity-badge`}>{f.severity}</span></td>
                          <td className="trivy-findings-cell mono muted">{f.package}</td>
                          <td className="trivy-findings-cell mono muted">{f.installedVersion}</td>
                          <td className="trivy-findings-cell mono muted">{f.fixedVersion || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {active.total > 30 && <div className="faint trivy-more">+ {active.total - 30} autre(s), non affiché(es)</div>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
