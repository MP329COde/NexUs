import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './ScanPanels.css';

const RISK_TONE = { High: 'crit', Medium: 'warn', Low: 'mut', Informational: 'mut' };
const RISK_ORDER = ['High', 'Medium', 'Low', 'Informational'];

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR');
}

// DAST réel via OWASP ZAP (open source, zap-baseline.py — voir
// backend/src/services/dastService.js). Cible limitée aux domaines déjà
// déclarés dans Réseaux → Proxies, jamais une URL arbitraire fournie par le
// client : Nexus ne doit jamais servir de scanner ouvert contre un tiers.
export default function DastScanPanel() {
  const notify = useNotify();
  const { data, loading, reload } = useApi(() => api.get('/dast-scans'), []);
  const { data: proxiesData } = useApi(() => api.get('/proxies'), []);
  const domains = (proxiesData?.items || []).map((p) => p.domain).filter(Boolean);
  const [target, setTarget] = useState('');
  const [scanning, setScanning] = useState(false);
  const [openScan, setOpenScan] = useState(null);

  const scans = data?.items || [];
  const active = scans.find((s) => s.id === openScan) || scans[0] || null;

  async function runScan() {
    if (!target) return;
    setScanning(true);
    try {
      const res = await api.post('/dast-scans', { url: `https://${target}` });
      notify(`Scan terminé — ${res.scan.total} alerte(s) (${res.scan.counts.High} à risque élevé)`, { type: res.scan.counts.High ? 'crit' : res.scan.total ? 'warn' : 'ok' });
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
      title="Analyse dynamique (DAST)"
      sub="OWASP ZAP, open source — scanne une application déjà en ligne, cible limitée aux domaines déjà déclarés"
      span={12}
      actions={
        <div className="scanp-actions">
          <select className="input scanp-target-select scanp-target-select-wide" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{domains.length === 0 ? 'Aucun domaine configuré' : 'Choisir un domaine…'}</option>
            {domains.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <span className={`btn-outline scanp-run-btn${scanning || !target ? ' scanp-run-btn-disabled' : ''}`} onClick={scanning || !target ? undefined : runScan}>
            <Icon name={scanning ? 'refresh' : 'globe'} size={13} className={scanning ? 'spin' : ''} />{scanning ? 'Scan en cours…' : 'Lancer un scan'}
          </span>
        </div>
      }
    >
      <div className="scanp-body">
        <div className="scanp-list">
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
                <div className="mono scanp-list-item-title-mono">{s.url}</div>
                <div className="faint scanp-list-item-date">{formatDate(s.scannedAt)}</div>
              </div>
            ))
          )}
        </div>

        <div className="scanp-results">
          {!active ? (
            <div className="faint scanp-results-empty">Lancez un scan pour voir les résultats ici.</div>
          ) : (
            <>
              <div className="scanp-counts-row">
                {RISK_ORDER.filter((r) => active.counts[r] > 0).map((r) => (
                  <span key={r} className={`badge badge-${RISK_TONE[r]}`}><span className="dot" />{active.counts[r]} {r}</span>
                ))}
                {active.total === 0 && <span className="badge badge-ok"><span className="dot" />Aucune alerte détectée</span>}
              </div>
              {active.findings.length > 0 && (
                <div className="scanp-table-wrap">
                  <table className="scanp-table">
                    <thead>
                      <tr>
                        {['Alerte', 'Risque', 'Occurrences', 'Description'].map((c) => (
                          <th key={c} className="scanp-th">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {active.findings.slice(0, 30).map((f, i) => (
                        <tr key={i} className="scanp-row">
                          <td className="scanp-td">{f.name}</td>
                          <td className="scanp-td"><span className={`badge badge-${RISK_TONE[f.risk]} scanp-badge-sm`}>{f.risk}</span></td>
                          <td className="scanp-td mono muted">{f.instances}</td>
                          <td className="scanp-td-ellipsis-wide" title={f.description}>{f.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {active.total > 30 && <div className="faint scanp-more">+ {active.total - 30} autre(s), non affiché(es)</div>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
