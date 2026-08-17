import { useEffect, useState } from 'react';
import { api } from '../../lib/apiClient.js';
import Icon from '../../components/ui/Icon.jsx';
import BrandMark from '../../components/ui/BrandMark.jsx';
import './ReportPage.css';

// Rapport imprimable : couleurs fixes (indépendantes du thème clair/sombre de
// l'app) pour garantir un rendu papier/PDF lisible via le dialogue d'impression
// du navigateur (Ctrl/⌘+P → Enregistrer en PDF), sans dépendance PDF côté serveur.
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
    return <div className="report-loading">Génération du rapport…</div>;
  }

  const generatedAt = new Date();

  return (
    <div className="report-page">
      <div className="no-print report-print-bar">
        <button className="btn report-print-btn" onClick={() => window.print()}>
          <Icon name="externalLink" size={14} />Imprimer / Enregistrer en PDF
        </button>
      </div>

      <div className="report-header">
        <BrandMark size={34} />
        <div>
          <div className="report-title">Rapport de santé — Nexus Console</div>
          <div className="report-generated-at">Généré le {generatedAt.toLocaleString('fr-FR')}</div>
        </div>
      </div>

      <div className="report-divider" />

      <div className="report-kpi-grid">
        <ReportKpi label="Santé globale" value={overview ? `${overview.score} %` : '—'} />
        <ReportKpi label="Intégrations configurées" value={overview ? `${overview.integrations.filter((i) => i.configured).length} / ${overview.integrations.length}` : '—'} />
        <ReportKpi label="Alertes actives" value={String(alerts.length)} />
      </div>

      <div className="report-section-title">Intégrations</div>
      <table className="report-table">
        <thead>
          <tr className="report-table-head-row">
            <th className="report-table-head">Intégration</th>
            <th className="report-table-head">Statut</th>
            <th className="report-table-head">Détail</th>
            <th className="report-table-head report-table-head-right">Latence</th>
          </tr>
        </thead>
        <tbody>
          {overview?.integrations.map((entry) => (
            <tr key={entry.key} className="report-table-row">
              <td className="report-cell report-cell-name">{entry.label}</td>
              <td className="report-cell">
                <span className="report-cell-status" style={{ color: TONE_COLOR[toneFor(entry)] }}>
                  {entry.configured ? (entry.ok ? 'Opérationnel' : 'Erreur') : 'Non configuré'}
                </span>
              </td>
              <td className="report-cell report-cell-muted">{entry.message}</td>
              <td className="report-cell report-cell-latency">{entry.latencyMs} ms</td>
            </tr>
          ))}
        </tbody>
      </table>

      {wazuhSummary && (
        <>
          <div className="report-section-title">Cybersécurité (Wazuh)</div>
          <div className="report-kpi-grid">
            <ReportKpi label="Agents actifs" value={String(wazuhSummary.active ?? '—')} />
            <ReportKpi label="Agents déconnectés" value={String(wazuhSummary.disconnected ?? '—')} />
            <ReportKpi label="Total agents" value={String(wazuhSummary.total ?? '—')} />
          </div>
        </>
      )}

      <div className="report-section-title">Alertes actives ({alerts.length})</div>
      {alerts.length === 0 ? (
        <div className="report-empty">Aucune alerte active, ou Grafana n'est pas configuré.</div>
      ) : (
        <table className="report-table">
          <tbody>
            {alerts.map((a, i) => (
              <tr key={i} className="report-table-row">
                <td className="report-cell report-cell-name">{a.name || a.title || '—'}</td>
                <td className="report-cell report-cell-muted">{a.state || a.severity || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="report-footer">
        Rapport généré automatiquement depuis Nexus Console — reflète l'état des intégrations au moment de la génération, pas un historique.
      </div>
    </div>
  );
}

function ReportKpi({ label, value }) {
  return (
    <div className="report-kpi-card">
      <div className="report-kpi-label">{label}</div>
      <div className="report-kpi-value">{value}</div>
    </div>
  );
}
