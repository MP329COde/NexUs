import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './ScanPanels.css';

const SEVERITY_TONE = { ERROR: 'crit', WARNING: 'warn', INFO: 'mut' };
const SEVERITY_ORDER = ['ERROR', 'WARNING', 'INFO'];
const TARGET_LABEL = { backend: 'Backend', frontend: 'Frontend', all: 'Backend + Frontend' };

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR');
}

// Analyse statique réelle via Semgrep (open source, règles communautaires
// gratuites — voir backend/src/services/semgrepService.js) sur le code
// source de la plateforme elle-même (cible fermée, pas de chemin arbitraire).
export default function CodeScanPanel() {
  const notify = useNotify();
  const { data, loading, reload } = useApi(() => api.get('/code-scans'), []);
  const [target, setTarget] = useState('all');
  const [scanning, setScanning] = useState(false);
  const [openScan, setOpenScan] = useState(null);

  const scans = data?.items || [];
  const active = scans.find((s) => s.id === openScan) || scans[0] || null;

  async function runScan() {
    setScanning(true);
    try {
      const res = await api.post('/code-scans', { target });
      notify(`Scan terminé — ${res.scan.total} résultat(s) (${res.scan.counts.ERROR} ERROR)`, { type: res.scan.counts.ERROR ? 'crit' : res.scan.total ? 'warn' : 'ok' });
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
      title="Analyse statique de code (SAST)"
      sub="Semgrep, open source — scanne le code source réel de la plateforme (backend/frontend), jamais de résultat inventé"
      span={12}
      actions={
        <div className="scanp-actions">
          <select className="input scanp-target-select" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="all">Backend + Frontend</option>
            <option value="backend">Backend uniquement</option>
            <option value="frontend">Frontend uniquement</option>
          </select>
          <span className={`btn-outline scanp-run-btn${scanning ? ' scanp-run-btn-disabled' : ''}`} onClick={scanning ? undefined : runScan}>
            <Icon name={scanning ? 'refresh' : 'terminal'} size={13} />{scanning ? 'Scan en cours…' : 'Lancer un scan'}
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
                <div className="scanp-list-item-title">{TARGET_LABEL[s.target] || s.target}</div>
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
                {SEVERITY_ORDER.filter((sev) => active.counts[sev] > 0).map((sev) => (
                  <span key={sev} className={`badge badge-${SEVERITY_TONE[sev]}`}><span className="dot" />{active.counts[sev]} {sev}</span>
                ))}
                {active.total === 0 && <span className="badge badge-ok"><span className="dot" />Aucun problème détecté</span>}
              </div>
              {active.findings.length > 0 && (
                <div className="scanp-table-wrap">
                  <table className="scanp-table">
                    <thead>
                      <tr>
                        {['Règle', 'Sévérité', 'Fichier', 'Ligne', 'Message'].map((c) => (
                          <th key={c} className="scanp-th">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {active.findings.slice(0, 30).map((f, i) => (
                        <tr key={i} className="scanp-row">
                          <td className="scanp-td mono" title={f.ruleId}>{f.ruleId.split('.').pop()}</td>
                          <td className="scanp-td"><span className={`badge badge-${SEVERITY_TONE[f.severity]} scanp-badge-sm`}>{f.severity}</span></td>
                          <td className="scanp-td mono muted">{f.file}</td>
                          <td className="scanp-td mono muted">{f.line}</td>
                          <td className="scanp-td-ellipsis" title={f.message}>{f.message}</td>
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
