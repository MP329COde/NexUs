import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

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
        <span className="btn-outline" style={{ height: 28, padding: '0 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: scanning ? 'default' : 'pointer', opacity: scanning ? 0.6 : 1 }} onClick={scanning ? undefined : runScan}>
          <Icon name={scanning ? 'refresh' : 'layers'} size={13} />{scanning ? 'Scan en cours…' : 'Lancer un scan'}
        </span>
      }
    >
      <div style={{ display: 'flex', minHeight: 140 }}>
        <div style={{ width: 220, flex: 'none', borderRight: '1px solid var(--border-soft)', maxHeight: 300, overflowY: 'auto' }}>
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
                <div style={{ fontSize: 11.5, fontWeight: 600 }}>{s.total} finding(s)</div>
                <div className="faint" style={{ fontSize: 10.5 }}>{formatDate(s.scannedAt)}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ flex: 1, padding: 16 }}>
          {!active ? (
            <div className="faint" style={{ fontSize: 12.5, textAlign: 'center', paddingTop: 30 }}>Lancez un scan pour voir les résultats ici.</div>
          ) : active.total === 0 ? (
            <span className="badge badge-ok"><span className="dot" />Aucun problème détecté</span>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Check', 'Fichier', 'Description'].map((c) => (
                      <th key={c} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-soft)' }}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {active.findings.map((f, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                      <td style={{ padding: '6px 10px' }} className="mono">{f.checkId}</td>
                      <td style={{ padding: '6px 10px' }} className="mono muted">{f.file}{f.lines ? `:${f.lines[0]}` : ''}</td>
                      <td style={{ padding: '6px 10px' }}>{f.name}</td>
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
