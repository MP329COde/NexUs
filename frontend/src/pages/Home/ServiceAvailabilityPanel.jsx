import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useClosablePopover } from '../../hooks/useClosablePopover.js';

const LEGEND = [
  { tone: 'ok', label: 'Disponible', hint: 'requête HTTP réussie' },
  { tone: 'crit', label: 'Indisponible', hint: 'requête HTTP échouée ou en erreur' },
  { tone: 'mut', label: 'Aucune donnée', hint: "pas encore de relevé pour cette heure" }
];

function toneFor(point) {
  if (!point) return 'mut';
  return point.ok ? 'ok' : 'crit';
}

// "Disponibilité 24h" par service marqué important (voir "Important" dans
// Réseaux → Proxies & domaines) : une ligne par service, nom à gauche, 24
// points à droite (un par heure). Bouton légende en haut à droite du panneau.
export default function ServiceAvailabilityPanel() {
  const { data } = useApi(() => api.get('/status/services'), [], { pollMs: 30000 });
  const [legendOpen, setLegendOpen] = useState(false);
  const legend = useClosablePopover(legendOpen, setLegendOpen);
  const items = data?.items || [];

  return (
    <Panel
      title="Disponibilité 24h"
      sub="Par service exposé"
      span={6}
      actions={(
        <div style={{ position: 'relative' }} ref={legend.ref}>
          <button onClick={() => setLegendOpen((v) => !v)} title="Légende des couleurs" className="icon-btn" style={{ width: 24, height: 24, fontSize: 11.5, fontWeight: 700 }}>?</button>
          {legend.visible && (
            <div className="card" style={{ position: 'absolute', top: 30, right: 0, width: 220, padding: 10, zIndex: 60, boxShadow: 'var(--shadow-pop)', animation: `${legend.closing ? 'popOut' : 'popIn'} .13s ease both` }}>
              {LEGEND.map((l) => (
                <div key={l.tone} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: `var(--tone-${l.tone}-dot)`, flex: 'none' }} />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{l.label}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-faint)', marginLeft: 'auto' }}>{l.hint}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    >
      {items.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>
          Aucun service marqué important — cochez « Important » depuis Réseaux → Proxies &amp; domaines.
        </div>
      ) : (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((svc) => (
            <div key={svc.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="mono" style={{ width: 90, flex: 'none', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={svc.domain}>
                {svc.name}
              </span>
              <div style={{ flex: 1, display: 'flex', gap: 3 }}>
                {svc.hourly.map((p, i) => (
                  <span
                    key={i}
                    title={p ? (p.ok ? 'Disponible' : 'Indisponible') : 'Aucune donnée'}
                    style={{ flex: 1, height: 16, borderRadius: 3, background: `var(--tone-${toneFor(p)}-dot)`, opacity: p ? 1 : 0.35 }}
                  />
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-faintest)', marginTop: 2 }}>
            <span>00:00</span>
            <span>maintenant</span>
          </div>
        </div>
      )}
    </Panel>
  );
}
