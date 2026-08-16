import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

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

  const sboms = data?.items || [];
  const active = sboms.find((s) => s.id === open) || sboms[0] || null;
  const filteredPackages = active ? active.packages.filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase())) : [];

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
      <form onSubmit={generate} style={{ display: 'flex', gap: 8, padding: 16, borderBottom: '1px solid var(--border-soft)' }}>
        <input className="input mono" placeholder="ex. nginx:1.27, alpine:3.19" value={imageRef} onChange={(e) => setImageRef(e.target.value)} style={{ flex: 1, fontSize: 12.5 }} />
        <button className="btn" type="submit" disabled={generating || !imageRef.trim()}>{generating ? 'Génération…' : 'Générer le SBOM'}</button>
      </form>

      <div style={{ display: 'flex', minHeight: 180 }}>
        <div style={{ width: 220, flex: 'none', borderRight: '1px solid var(--border-soft)', maxHeight: 360, overflowY: 'auto' }}>
          {loading ? (
            <div className="faint" style={{ padding: 16, fontSize: 12 }}>Chargement…</div>
          ) : sboms.length === 0 ? (
            <div className="faint" style={{ padding: 16, fontSize: 12 }}>Aucun SBOM encore généré</div>
          ) : (
            sboms.map((s) => (
              <div
                key={s.id} onClick={() => { setOpen(s.id); setFilter(''); }}
                style={{ padding: '9px 12px', cursor: 'pointer', background: active?.id === s.id ? 'var(--border-soft)' : 'transparent', borderBottom: '1px solid var(--border-soft)' }}
              >
                <div className="mono" style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.imageRef}</div>
                <div className="faint" style={{ fontSize: 10.5 }}>{s.total} paquets · {formatDate(s.generatedAt)}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ flex: 1, padding: 16 }}>
          {!active ? (
            <div className="faint" style={{ fontSize: 12.5, textAlign: 'center', paddingTop: 40 }}>Générez un SBOM pour voir l'inventaire ici.</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <Icon name="layers" size={15} style={{ color: 'var(--text-faint)' }} />
                <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{active.imageRef}</span>
                <span className="faint" style={{ fontSize: 11 }}>{active.total} paquets</span>
                {Object.entries(active.byType).map(([type, count]) => (
                  <span key={type} className="badge badge-mut" style={{ fontSize: 10 }}>{type} · {count}</span>
                ))}
                <input className="input" placeholder="Filtrer par nom…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginLeft: 'auto', height: 26, fontSize: 11.5, width: 160 }} />
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 280, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Paquet', 'Version', 'Type', 'Licence'].map((c) => (
                        <th key={c} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-soft)', position: 'sticky', top: 0, background: 'var(--surface)' }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPackages.slice(0, 200).map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                        <td style={{ padding: '5px 10px' }} className="mono">{p.name}</td>
                        <td style={{ padding: '5px 10px' }} className="mono muted">{p.version}</td>
                        <td style={{ padding: '5px 10px' }} className="faint">{p.type}</td>
                        <td style={{ padding: '5px 10px' }} className="faint">{p.licenses.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredPackages.length > 200 && <div className="faint" style={{ fontSize: 11, marginTop: 8 }}>+ {filteredPackages.length - 200} autre(s), non affiché(es)</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
