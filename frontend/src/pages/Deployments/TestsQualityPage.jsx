import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import MiniLineChart from '../../components/ui/MiniLineChart.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import './TestsQualityPage.css';

// Aucun framework de tests (Jest/Vitest/pytest...) ni format de rapport
// (JUnit XML...) n'est intégré à la console — impossible d'afficher un
// "nombre de tests" ou une "couverture" réels sans ça. Cette page dérive
// donc ce qu'elle PEUT mesurer honnêtement des exécutions CI réelles déjà
// suivies (GET /pipelines/runs, GitLab+GitHub) : fiabilité des pipelines
// dans le temps, par dépôt — pas une invention de chiffres de test.
function dayKey(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

export default function TestsQualityPage() {
  const { data, loading } = useApi(() => api.get('/pipelines/runs'), []);
  const runs = (data?.items || []).filter((r) => r.status !== 'running');

  const total = runs.length;
  const failed = runs.filter((r) => r.status === 'failed').length;
  const successRate = total ? Math.round(((total - failed) / total) * 100) : null;

  const now = Date.now();
  const last24h = runs.filter((r) => now - new Date(r.createdAt).getTime() < 24 * 3_600_000);
  const failed24h = last24h.filter((r) => r.status === 'failed').length;

  // Taux de succès quotidien sur les 30 derniers jours ayant au moins une
  // exécution — jours sans donnée simplement absents de la courbe plutôt
  // qu'interpolés à une valeur fictive.
  const byDay = {};
  for (const r of runs) {
    const key = dayKey(r.createdAt);
    if (!byDay[key]) byDay[key] = { total: 0, ok: 0 };
    byDay[key].total += 1;
    if (r.status === 'success') byDay[key].ok += 1;
  }
  const trend = Object.keys(byDay).sort().slice(-30).map((k) => Math.round((byDay[k].ok / byDay[k].total) * 100));

  const byRepo = {};
  for (const r of runs) {
    if (!byRepo[r.repo]) byRepo[r.repo] = { total: 0, failed: 0 };
    byRepo[r.repo].total += 1;
    if (r.status === 'failed') byRepo[r.repo].failed += 1;
  }
  const repoRows = Object.entries(byRepo)
    .map(([repo, s]) => ({ repo, ...s, rate: Math.round(((s.total - s.failed) / s.total) * 100) }))
    .sort((a, b) => a.rate - b.rate);

  return (
    <>
      <PageHeader title="Tests & qualité" sub="Fiabilité des pipelines CI (GitLab + GitHub), dérivée des exécutions réelles — pas de framework de tests intégré." />

      <div className="tqp-kpi-grid">
        <KpiCard label="Exécutions (historique)" value={total} tint="#3B82F6" note={loading ? 'Chargement…' : undefined} />
        <KpiCard label="Échecs (historique)" value={failed} tint={failed > 0 ? '#F43F5E' : '#10B981'} />
        <KpiCard label="Taux de succès" value={successRate ?? '—'} unit={successRate !== null ? '%' : ''} tint="#10B981" />
        <KpiCard label="Échecs 24h" value={failed24h} tint={failed24h > 0 ? '#F59E0B' : '#10B981'} note={`sur ${last24h.length} exécution(s)`} />
      </div>

      <Panel title="Fiabilité des pipelines" sub="Taux de succès quotidien réel (jours avec au moins une exécution)" span={12} style={{ marginBottom: 16 }}>
        <div className="tqp-chart-body">
          {trend.length >= 2 ? (
            <MiniLineChart values={trend} color="#3B82F6" />
          ) : (
            <div className="tqp-chart-empty">
              Pas assez d'historique de pipelines pour tracer une tendance (ou aucune forge Git configurée — voir Paramètres).
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Fiabilité par dépôt" sub="Basé sur l'historique d'exécutions récupéré" span={12}>
        {repoRows.length === 0 ? (
          <div className="tqp-table-empty">Aucune exécution disponible</div>
        ) : (
          <div className="tqp-table-wrap">
            <table className="tqp-table">
              <thead>
                <tr>
                  {['Dépôt', 'Exécutions', 'Échecs', 'Taux de succès'].map((c) => (
                    <th key={c} className="tqp-th">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {repoRows.map((r) => (
                  <tr key={r.repo} className="tqp-row">
                    <td className="mono tqp-td">{r.repo}</td>
                    <td className="tqp-td">{r.total}</td>
                    <td className="tqp-td" style={{ color: r.failed > 0 ? 'var(--tone-crit-fg)' : undefined }}>{r.failed}</td>
                    <td className="tqp-td-rate" style={{ color: r.rate >= 90 ? 'var(--tone-ok-fg)' : r.rate >= 70 ? 'var(--tone-warn-fg)' : 'var(--tone-crit-fg)' }}>{r.rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
