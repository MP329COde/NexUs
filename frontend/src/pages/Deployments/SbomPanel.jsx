import { useState, useEffect } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './TrivyScanPanel.css';
import './SbomPanel.css';

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR');
}

// Génération de SBOM réelle via Syft (Anchore, open source — voir
// backend/src/services/syftService.js) : inventaire logiciel complet d'une
// image, jamais de liste inventée.
export default function SbomPanel() {
  const notify = useNotify();
  const { data, loading, reload } = useApi(() => api.get('/sbom'), []);
  const [imageRef, setImageRef] = useState('');
  const [generating, setGenerating] = useState(false);
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState('');
  const [signature, setSignature] = useState(null);
  const [signing, setSigning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(null);

  const sboms = data?.items || [];
  const active = sboms.find((s) => s.id === open) || sboms[0] || null;
  const filteredPackages = active ? active.packages.filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase())) : [];

  useEffect(() => {
    setSignature(null);
    setVerified(null);
    if (!active) return;
    api.get(`/signatures/sbom/${active.id}`).then((res) => setSignature(res.signature)).catch(() => {});
  }, [active?.id]);

  async function sign() {
    if (!active) return;
    setSigning(true);
    try {
      const res = await api.post(`/signatures/sbom/${active.id}`);
      setSignature(res.signature);
      setVerified(null);
      notify('SBOM signé avec cosign', { type: 'ok' });
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setSigning(false);
    }
  }

  async function verify() {
    if (!active) return;
    setVerifying(true);
    try {
      const res = await api.post(`/signatures/sbom/${active.id}/verify`);
      setVerified(res.valid);
      notify(res.valid ? 'Signature valide' : 'Signature invalide', { type: res.valid ? 'ok' : 'crit' });
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setVerifying(false);
    }
  }

  async function generate(e) {
    e.preventDefault();
    if (!imageRef.trim()) return;
    setGenerating(true);
    try {
      const res = await api.post('/sbom', { imageRef: imageRef.trim() });
      notify(`SBOM généré — ${res.sbom.total} paquet(s)`, { type: 'ok' });
      setOpen(res.sbom.id);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Panel
      title="SBOM (Software Bill of Materials)"
      sub="Syft, open source — inventaire logiciel réel d'une image (paquets, versions, licences)"
      span={12}
    >
      <form onSubmit={generate} className="trivy-form">
        <input className="input mono trivy-form-input" placeholder="ex. nginx:1.27, alpine:3.19" value={imageRef} onChange={(e) => setImageRef(e.target.value)} />
        <button className="btn" type="submit" disabled={generating || !imageRef.trim()}>{generating ? 'Génération…' : 'Générer le SBOM'}</button>
      </form>

      <div className="trivy-body">
        <div className="trivy-sidebar">
          {loading ? (
            <div className="faint trivy-sidebar-empty">Chargement…</div>
          ) : sboms.length === 0 ? (
            <div className="faint trivy-sidebar-empty">Aucun SBOM encore généré</div>
          ) : (
            sboms.map((s) => (
              <div
                key={s.id} onClick={() => { setOpen(s.id); setFilter(''); }}
                className={`trivy-scan-row${active?.id === s.id ? ' trivy-scan-row-active' : ''}`}
              >
                <div className="mono trivy-scan-ref">{s.imageRef}</div>
                <div className="faint trivy-scan-date">{s.total} paquets · {formatDate(s.generatedAt)}</div>
              </div>
            ))
          )}
        </div>

        <div className="trivy-detail">
          {!active ? (
            <div className="faint trivy-detail-empty">Générez un SBOM pour voir l'inventaire ici.</div>
          ) : (
            <>
              <div className="sbom-detail-header">
                <Icon name="layers" size={15} className="trivy-detail-icon" />
                <span className="mono trivy-detail-ref">{active.imageRef}</span>
                <span className="faint trivy-detail-os">{active.total} paquets</span>
                {Object.entries(active.byType).map(([type, count]) => (
                  <span key={type} className="badge badge-mut sbom-type-badge">{type} · {count}</span>
                ))}
                <input className="input sbom-filter-input" placeholder="Filtrer par nom…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              </div>

              <div className="sbom-signature-bar">
                <Icon name="lock" size={13} className="trivy-detail-icon" />
                {!signature ? (
                  <>
                    <span className="faint sbom-unsigned-text">Ce SBOM n'est pas signé.</span>
                    <button className="btn sbom-signature-btn" type="button" onClick={sign} disabled={signing}>
                      {signing ? 'Signature…' : 'Signer avec cosign'}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="sbom-signed-text">Signé (cosign, {signature.algorithm}) le {formatDate(signature.signedAt)}</span>
                    {verified !== null && (
                      <span className={`badge badge-${verified ? 'ok' : 'crit'} sbom-signature-status-badge`}>
                        <span className="dot" />{verified ? 'Signature valide' : 'Signature invalide'}
                      </span>
                    )}
                    <button className="btn sbom-signature-btn" type="button" onClick={verify} disabled={verifying}>
                      {verifying ? 'Vérification…' : 'Vérifier la signature'}
                    </button>
                  </>
                )}
              </div>
              <div className="sbom-packages-wrap">
                <table className="sbom-packages-table">
                  <thead>
                    <tr>
                      {['Paquet', 'Version', 'Type', 'Licence'].map((c) => (
                        <th key={c} className="sbom-packages-head">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPackages.slice(0, 200).map((p, i) => (
                      <tr key={i} className="sbom-packages-row">
                        <td className="sbom-packages-cell mono">{p.name}</td>
                        <td className="sbom-packages-cell mono muted">{p.version}</td>
                        <td className="sbom-packages-cell faint">{p.type}</td>
                        <td className="sbom-packages-cell faint">{p.licenses.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredPackages.length > 200 && <div className="faint trivy-more">+ {filteredPackages.length - 200} autre(s), non affiché(es)</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
