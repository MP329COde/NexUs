import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="input" value={target} onChange={(e) => setTarget(e.target.value)} style={{ height: 28, fontSize: 12, minWidth: 160 }}>
            <option value="">{domains.length === 0 ? 'Aucun domaine configuré' : 'Choisir un domaine…'}</option>
            {domains.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <span className="btn-outline" style={{ height: 28, padding: '0 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: scanning || !target ? 'default' : 'pointer', opacity: scanning || !target ? 0.6 : 1 }} onClick={scanning || !target ? undefined : runScan}>
            <Icon name={scanning ? 'refresh' : 'globe'} size={13} className={scanning ? 'spin' : ''} />{scanning ? 'Scan en cours…' : 'Lancer un scan'}
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
                <div className="mono" style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url}</div>
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
                {RISK_ORDER.filter((r) => active.counts[r] > 0).map((r) => (
                  <span key={r} className={`badge badge-${RISK_TONE[r]}`}><span className="dot" />{active.counts[r]} {r}</span>
                ))}
                {active.total === 0 && <span className="badge badge-ok"><span className="dot" />Aucune alerte détectée</span>}
              </div>
              {active.findings.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {['Alerte', 'Risque', 'Occurrences', 'Description'].map((c) => (
                          <th key={c} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-soft)' }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {active.findings.slice(0, 30).map((f, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                          <td style={{ padding: '6px 10px' }}>{f.name}</td>
                          <td style={{ padding: '6px 10px' }}><span className={`badge badge-${RISK_TONE[f.risk]}`} style={{ fontSize: 10 }}>{f.risk}</span></td>
                          <td style={{ padding: '6px 10px' }} className="mono muted">{f.instances}</td>
                          <td style={{ padding: '6px 10px', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.description}>{f.description}</td>
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
