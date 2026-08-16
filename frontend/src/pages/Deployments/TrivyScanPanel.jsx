import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

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
      <form onSubmit={runScan} style={{ display: 'flex', gap: 8, padding: 16, borderBottom: '1px solid var(--border-soft)' }}>
        <input
          className="input mono" placeholder="ex. nginx:1.27, alpine:3.19, ghcr.io/org/image:tag"
          value={imageRef} onChange={(e) => setImageRef(e.target.value)}
          style={{ flex: 1, fontSize: 12.5 }}
        />
        <button className="btn" type="submit" disabled={scanning || !imageRef.trim()}>
          {scanning ? 'Scan en cours (jusqu\'à 2 min)…' : 'Scanner'}
        </button>
      </form>

      <div style={{ display: 'flex', minHeight: 200 }}>
        <div style={{ width: 220, flex: 'none', borderRight: '1px solid var(--border-soft)', maxHeight: 360, overflowY: 'auto' }}>
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
                <div className="mono" style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.imageRef}</div>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Icon name="image" size={15} style={{ color: 'var(--text-faint)' }} />
                <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{active.imageRef}</span>
                {active.osFamily && <span className="faint" style={{ fontSize: 11 }}>{active.osFamily} {active.osVersion}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {SEVERITY_ORDER.filter((sev) => active.counts[sev] > 0).map((sev) => (
                  <span key={sev} className={`badge badge-${SEVERITY_TONE[sev]}`}><span className="dot" />{active.counts[sev]} {sev}</span>
                ))}
                {active.total === 0 && <span className="badge badge-ok"><span className="dot" />Aucune vulnérabilité détectée</span>}
              </div>
              {active.findings.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {['CVE', 'Sévérité', 'Paquet', 'Installé', 'Corrigé'].map((c) => (
                          <th key={c} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-soft)' }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {active.findings.slice(0, 30).map((f, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                          <td style={{ padding: '6px 10px' }} className="mono">{f.id}</td>
                          <td style={{ padding: '6px 10px' }}><span className={`badge badge-${SEVERITY_TONE[f.severity]}`} style={{ fontSize: 10 }}>{f.severity}</span></td>
                          <td style={{ padding: '6px 10px' }} className="mono muted">{f.package}</td>
                          <td style={{ padding: '6px 10px' }} className="mono muted">{f.installedVersion}</td>
                          <td style={{ padding: '6px 10px' }} className="mono muted">{f.fixedVersion || '—'}</td>
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
