import { useEffect, useState } from 'react';
import { api } from '../../lib/apiClient.js';
import Icon from '../../components/ui/Icon.jsx';

// Rapport imprimable : couleurs fixes (indépendantes du thème clair/sombre de
// l'app) pour garantir un rendu papier/PDF lisible via le dialogue d'impression
// du navigateur (Ctrl/⌘+P → Enregistrer en PDF), sans dépendance PDF côté serveur.
const ink = '#0F172A';
const muted = '#64748B';
const border = '#E2E8F0';

const TONE_COLOR = { ok: '#047857', warn: '#B45309', crit: '#B91C1C', mut: '#64748B' };

function toneFor(entry) {
  if (!entry.configured) return 'mut';
  return entry.ok ? 'ok' : 'crit';
}

export default function ReportPage() {
  const [overview, setOverview] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [wazuhSummary, setWazuhSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const results = await Promise.allSettled([
        api.get('/status/overview'),
        api.get('/grafana/alerts'),
        api.get('/wazuh/summary')
      ]);
      if (results[0].status === 'fulfilled') setOverview(results[0].value);
      if (results[1].status === 'fulfilled') setAlerts(results[1].value.items || []);
      if (results[2].status === 'fulfilled') setWazuhSummary(results[2].value.summary);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <div style={{ padding: 40, fontSize: 13, color: muted }}>Génération du rapport…</div>;
  }

  const generatedAt = new Date();

  return (
    <div style={{ background: '#fff', color: ink, fontFamily: 'IBM Plex Sans, Arial, sans-serif', maxWidth: 820, margin: '0 auto' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 18 }}>
        <button className="btn" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="externalLink" size={14} />Imprimer / Enregistrer en PDF
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>N</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Rapport de santé — Nexus Console</div>
          <div style={{ fontSize: 12, color: muted }}>Généré le {generatedAt.toLocaleString('fr-FR')}</div>
        </div>
      </div>

      <div style={{ height: 1, background: border, margin: '18px 0 22px' }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 26 }}>
        <ReportKpi label="Santé globale" value={overview ? `${overview.score} %` : '—'} />
        <ReportKpi label="Intégrations configurées" value={overview ? `${overview.integrations.filter((i) => i.configured).length} / ${overview.integrations.length}` : '—'} />
        <ReportKpi label="Alertes actives" value={String(alerts.length)} />
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Intégrations</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 26, fontSize: 11.5 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: muted, borderBottom: `1px solid ${border}` }}>
            <th style={{ padding: '6px 8px', fontWeight: 600 }}>Intégration</th>
            <th style={{ padding: '6px 8px', fontWeight: 600 }}>Statut</th>
            <th style={{ padding: '6px 8px', fontWeight: 600 }}>Détail</th>
            <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Latence</th>
          </tr>
        </thead>
        <tbody>
          {overview?.integrations.map((entry) => (
            <tr key={entry.key} style={{ borderBottom: `1px solid ${border}` }}>
              <td style={{ padding: '7px 8px', fontWeight: 500 }}>{entry.label}</td>
              <td style={{ padding: '7px 8px' }}>
                <span style={{ color: TONE_COLOR[toneFor(entry)], fontWeight: 600 }}>
                  {entry.configured ? (entry.ok ? 'Opérationnel' : 'Erreur') : 'Non configuré'}
                </span>
              </td>
              <td style={{ padding: '7px 8px', color: muted }}>{entry.message}</td>
              <td style={{ padding: '7px 8px', textAlign: 'right', color: muted, fontFamily: 'JetBrains Mono, monospace' }}>{entry.latencyMs} ms</td>
            </tr>
          ))}
        </tbody>
      </table>

      {wazuhSummary && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Cybersécurité (Wazuh)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 26 }}>
            <ReportKpi label="Agents actifs" value={String(wazuhSummary.active ?? '—')} />
            <ReportKpi label="Agents déconnectés" value={String(wazuhSummary.disconnected ?? '—')} />
            <ReportKpi label="Total agents" value={String(wazuhSummary.total ?? '—')} />
          </div>
        </>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Alertes actives ({alerts.length})</div>
      {alerts.length === 0 ? (
        <div style={{ fontSize: 12, color: muted, marginBottom: 26 }}>Aucune alerte active, ou Grafana n'est pas configuré.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 26, fontSize: 11.5 }}>
          <tbody>
            {alerts.map((a, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                <td style={{ padding: '7px 8px', fontWeight: 500 }}>{a.name || a.title || '—'}</td>
                <td style={{ padding: '7px 8px', color: muted }}>{a.state || a.severity || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ fontSize: 10.5, color: muted, marginTop: 30 }}>
        Rapport généré automatiquement depuis Nexus Console — reflète l'état des intégrations au moment de la génération, pas un historique.
      </div>
    </div>
  );
}

function ReportKpi({ label, value }) {
  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, color: muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
