import { useState } from 'react';
import Icon from './Icon.jsx';
import { toneFromScore } from '../../lib/health.js';
import { useClosablePopover } from '../../hooks/useClosablePopover.js';

const LEGEND = [
  { tone: 'ok', label: 'Sain', hint: 'score ≥ 90 %' },
  { tone: 'warn', label: 'Dégradé', hint: 'score entre 60 et 89 %' },
  { tone: 'crit', label: 'Incident', hint: 'score < 60 %' },
  { tone: 'mut', label: 'Aucune donnée', hint: "pas encore de relevé pour cette heure" }
];

// 24 points, un par heure écoulée (le plus récent à droite), colorés selon le
// score de santé relevé à cette heure-là. Un bouton ouvre une légende flottante
// expliquant les couleurs.
export default function AvailabilityDots({ hourly }) {
  const [legendOpen, setLegendOpen] = useState(false);
  const legend = useClosablePopover(legendOpen, setLegendOpen);
  const points = hourly && hourly.length === 24 ? hourly : new Array(24).fill(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Il y a 24 h</span>
        <div style={{ position: 'relative' }} ref={legend.ref}>
          <button
            onClick={() => setLegendOpen((v) => !v)}
            title="Légende des couleurs"
            className="icon-btn"
            style={{ width: 22, height: 22, fontSize: 11, fontWeight: 700 }}
          >
            ?
          </button>
          {legend.visible && (
            <div
              className="card"
              style={{
                position: 'absolute', top: 28, right: 0, width: 220, padding: 10, zIndex: 60,
                boxShadow: 'var(--shadow-pop)', animation: `${legend.closing ? 'popOut' : 'popIn'} .13s ease both`
              }}
            >
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
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Maintenant</span>
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        {points.map((p, i) => {
          const tone = p ? toneFromScore(p.score) : 'mut';
          const title = p
            ? `${new Date(p.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — ${p.score === null ? 'aucune donnée' : `${p.score} %`}`
            : 'Aucune donnée pour cette heure';
          return (
            <span
              key={i}
              title={title}
              style={{
                flex: 1, height: 22, borderRadius: 4,
                background: `var(--tone-${tone}-dot)`,
                opacity: tone === 'mut' ? 0.35 : 1
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
