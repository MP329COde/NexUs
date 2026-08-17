import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useClosablePopover } from '../../hooks/useClosablePopover.js';
import './ServiceAvailabilityPanel.css';

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
        <div className="sap-legend-anchor" ref={legend.ref}>
          <button onClick={() => setLegendOpen((v) => !v)} title="Légende des couleurs" className="icon-btn sap-legend-btn">?</button>
          {legend.visible && (
            <div className={`card sap-legend-card ${legend.closing ? 'sap-legend-closing' : 'sap-legend-opening'}`}>
              {LEGEND.map((l) => (
                <div key={l.tone} className="sap-legend-row">
                  <span className="sap-legend-dot" style={{ background: `var(--tone-${l.tone}-dot)` }} />
                  <span className="sap-legend-label">{l.label}</span>
                  <span className="sap-legend-hint">{l.hint}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    >
      {items.length === 0 ? (
        <div className="sap-empty">
          Aucun service marqué important — cochez « Important » depuis Réseaux → Proxies &amp; domaines.
        </div>
      ) : (
        <div className="sap-body">
          {items.map((svc) => (
            <div key={svc.id} className="sap-service-row">
              <span className="mono sap-service-name" title={svc.domain}>
                {svc.name}
              </span>
              <div className="sap-hourly-track">
                {svc.hourly.map((p, i) => (
                  <span
                    key={i}
                    title={p ? (p.ok ? 'Disponible' : 'Indisponible') : 'Aucune donnée'}
                    className="sap-hourly-cell"
                    style={{ background: `var(--tone-${toneFor(p)}-dot)`, opacity: p ? 1 : 0.35 }}
                  />
                ))}
              </div>
            </div>
          ))}
          <div className="sap-axis-row">
            <span>00:00</span>
            <span>maintenant</span>
          </div>
        </div>
      )}
    </Panel>
  );
}
