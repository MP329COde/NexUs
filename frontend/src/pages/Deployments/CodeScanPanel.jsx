import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="input" value={target} onChange={(e) => setTarget(e.target.value)} style={{ height: 28, fontSize: 12 }}>
            <option value="all">Backend + Frontend</option>
            <option value="backend">Backend uniquement</option>
            <option value="frontend">Frontend uniquement</option>
          </select>
          <span className="btn-outline" style={{ height: 28, padding: '0 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: scanning ? 'default' : 'pointer', opacity: scanning ? 0.6 : 1 }} onClick={scanning ? undefined : runScan}>
            <Icon name={scanning ? 'refresh' : 'terminal'} size={13} />{scanning ? 'Scan en cours…' : 'Lancer un scan'}
          </span>
        </div>
      }
    >
      <div style={{ display: 'flex', minHeight: 180 }}>
        <div style={{ width: 220, flex: 'none', borderRight: '1px solid var(--border-soft)', maxHeight: 340, overflowY: 'auto' }}>
          {loading ? (
            <div className="faint" style={{ padding: 16, fontSize: 12 }}>Chargement…</div>
          ) : scans.length === 0 ? (
            <div className="faint" style={{ padding: 16, fontSize: 12 }}>Aucun scan encore lancé</div>
          ) : (
            scans.map((s) => (
              <div
                key={s.id} onClick={() => setOpenScan(s.id)}
                style={{ padding: '9px 12px', cursor: 'pointer', background: active?.id === s.id ? 'var(--border-soft)' : 'transparent', borderBottom: '1px solid var(--border-soft)' }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 600 }}>{TARGET_LABEL[s.target] || s.target}</div>
                <div className="faint" style={{ fontSize: 10.5 }}>{formatDate(s.scannedAt)}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ flex: 1, padding: 16 }}>
          {!active ? (
            <div className="faint" style={{ fontSize: 12.5, textAlign: 'center', paddingTop: 40 }}>Lancez un scan pour voir les résultats ici.</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {SEVERITY_ORDER.filter((sev) => active.counts[sev] > 0).map((sev) => (
                  <span key={sev} className={`badge badge-${SEVERITY_TONE[sev]}`}><span className="dot" />{active.counts[sev]} {sev}</span>
                ))}
                {active.total === 0 && <span className="badge badge-ok"><span className="dot" />Aucun problème détecté</span>}
              </div>
              {active.findings.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {['Règle', 'Sévérité', 'Fichier', 'Ligne', 'Message'].map((c) => (
                          <th key={c} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-soft)' }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {active.findings.slice(0, 30).map((f, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                          <td style={{ padding: '6px 10px' }} className="mono" title={f.ruleId}>{f.ruleId.split('.').pop()}</td>
                          <td style={{ padding: '6px 10px' }}><span className={`badge badge-${SEVERITY_TONE[f.severity]}`} style={{ fontSize: 10 }}>{f.severity}</span></td>
                          <td style={{ padding: '6px 10px' }} className="mono muted">{f.file}</td>
                          <td style={{ padding: '6px 10px' }} className="mono muted">{f.line}</td>
                          <td style={{ padding: '6px 10px', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.message}>{f.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {active.total > 30 && <div className="faint" style={{ fontSize: 11, marginTop: 8 }}>+ {active.total - 30} autre(s), non affiché(es)</div>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
