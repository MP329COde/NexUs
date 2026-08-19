import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import MiniLineChart from '../../components/ui/MiniLineChart.jsx';
import MiniDonut from '../../components/ui/MiniDonut.jsx';
import Icon from '../../components/ui/Icon.jsx';
import ActionConfirmModal from '../../components/ui/ActionConfirmModal.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import './PipelinesPage.css';

const STATUS_TONE = { success: 'ok', failed: 'crit', running: 'info', cancelled: 'mut', other: 'mut' };
const STATUS_LABEL = { success: 'Succès', failed: 'Échec', running: 'En cours', cancelled: 'Annulé', other: '—' };
const PROVIDER_ICON = { gitlab: 'gitlab', github: 'github' };

// Étiquette une étape/job par son nom réel (jamais une donnée inventée : si
// aucun mot-clé connu ne correspond, le nom brut du job reste affiché tel
// quel). Aligné sur les jobs générés par services/ciWorkflowService.js
// (Semgrep/Trivy/GitGuardian/Docker/SBOM) pour rendre la timeline du plan
// lisible quand ces jobs existent réellement dans le workflow du dépôt.
const STAGE_KEYWORDS = [
  { match: /semgrep|sast/i, label: 'SAST' },
  { match: /gitguardian|secret/i, label: 'Secret Scan' },
  { match: /trivy/i, label: 'Trivy' },
  { match: /sbom/i, label: 'SBOM' },
  { match: /sca|dependenc/i, label: 'SCA' },
  { match: /docker|image/i, label: 'Docker' },
  { match: /lint/i, label: 'Lint' },
  { match: /test/i, label: 'Tests' },
  { match: /build/i, label: 'Build' },
  { match: /deploy|staging|production|preview/i, label: 'Déploiement' }
];
function stageLabelFor(name) {
  const hit = STAGE_KEYWORDS.find((k) => k.match.test(name || ''));
  return hit ? hit.label : null;
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m} m ${String(s).padStart(2, '0')}`;
}

// "Pipelines CI/CD" : agrège en direct les pipelines GitLab et les workflow
// runs GitHub de tous les dépôts accessibles (voir GET /pipelines/runs).
// Aucune exécution n'est simulée — liste et graphes vides si ni GitLab ni
// GitHub ne sont configurés.
export default function PipelinesPage() {
  const { user } = useAuth();
  const { data, reload } = useApi(() => api.get('/pipelines/runs'), [], { pollMs: 15000 });
  const [filter, setFilter] = useState('');
  const [pending, setPending] = useState(null);
  const [jobsFor, setJobsFor] = useState(null);
  const notify = useNotify();

  const runs = data?.items || [];
  const now = Date.now();
  const last24h = runs.filter((r) => now - new Date(r.createdAt).getTime() < 24 * 3_600_000);
  const last7d = runs.filter((r) => now - new Date(r.createdAt).getTime() < 7 * 24 * 3_600_000);
  const running = runs.filter((r) => r.status === 'running').length;

  const finished7d = last7d.filter((r) => r.status !== 'running');
  const successCount = finished7d.filter((r) => r.status === 'success').length;
  const successRate = finished7d.length ? Math.round((successCount / finished7d.length) * 1000) / 10 : null;

  const durations = finished7d.map((r) => r.durationSeconds).filter((d) => d !== null);
  const medianDuration = durations.length ? median(durations) : null;

  const hourlyBuckets = new Array(24).fill(0);
  for (const r of runs) {
    const h = Math.floor((now - new Date(r.createdAt).getTime()) / 3_600_000);
    if (h >= 0 && h < 24) hourlyBuckets[23 - h] += 1;
  }

  const donutSegments = [
    { label: 'Succès', value: finished7d.filter((r) => r.status === 'success').length, color: '#10B981' },
    { label: 'Échec', value: finished7d.filter((r) => r.status === 'failed').length, color: '#F43F5E' },
    { label: 'Annulé', value: finished7d.filter((r) => r.status === 'cancelled').length, color: '#94A3B8' }
  ];

  const q = filter.trim().toLowerCase();
  const filtered = q ? runs.filter((r) => r.repo.toLowerCase().includes(q) || r.branch?.toLowerCase().includes(q)) : runs;

  function askRetry(r) {
    setPending({
      title: `Relancer l'exécution — ${r.repo}`,
      sub: `${r.branch || 'branche inconnue'} · ${r.provider}`,
      tone: 'warn',
      confirmLabel: 'Relancer',
      impact: [
        `Déclenche une nouvelle exécution du pipeline sur ${r.provider === 'gitlab' ? 'GitLab CI' : 'GitHub Actions'}, avec le même commit/branche.`,
        'Consomme à nouveau des minutes CI/CD sur la forge.'
      ],
      run: async () => {
        await api.post(`/pipelines/runs/${encodeURIComponent(r.id)}/retry`, {});
        notify('Exécution relancée', { type: 'ok' });
        reload();
      }
    });
  }

  return (
    <>
      <PageHeader title="Pipelines CI/CD" sub="Exécutions récentes, durées et taux de réussite sur l'ensemble des dépôts." />

      <div className="pipelines-kpi-grid">
        <KpiCard label="Exécutions 24h" value={last24h.length} tint="#3B82F6" />
        <KpiCard label="Taux de réussite 7j" value={successRate ?? '—'} unit={successRate !== null ? '%' : ''} tint={successRate === null ? '#94A3B8' : successRate >= 90 ? '#10B981' : '#F59E0B'} />
        <KpiCard label="Durée médiane 7j" value={formatDuration(medianDuration)} tint="#8B5CF6" />
        <KpiCard label="En cours" value={running} tint={running > 0 ? '#3B82F6' : '#10B981'} />
      </div>

      <div className="pipelines-chart-grid">
        <Panel title="Volume des exécutions" sub="Par heure écoulée (24 dernières heures)" span={8}>
          <div className="pipelines-chart-body">
            <MiniLineChart values={hourlyBuckets} color="#3B82F6" />
          </div>
        </Panel>
        <Panel title="Résultats" sub="7 derniers jours" span={4}>
          <div className="pipelines-donut-body">
            <MiniDonut segments={donutSegments} centerLabel={finished7d.length} centerSub="exécutions" />
            <div className="pipelines-donut-legend">
              {donutSegments.map((s) => (
                <div key={s.label} className="pipelines-donut-legend-row">
                  <span className="pipelines-donut-dot" style={{ background: s.color }} />
                  <span className="pipelines-donut-label">{s.label}</span>
                  <span className="mono pipelines-donut-value">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Exécutions récentes"
        sub="Tous dépôts confondus"
        span={12}
        actions={<input className="input pipelines-filter-input" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      >
        {filtered.length === 0 ? (
          <div className="pipelines-empty">
            {runs.length === 0 ? 'Aucune exécution (GitLab/GitHub non configurés ou aucun pipeline récent)' : 'Aucune exécution ne correspond au filtre'}
          </div>
        ) : (
          <div className="pipelines-table-wrap">
            <table className="pipelines-table">
              <thead>
                <tr>
                  {['Dépôt', 'Branche', 'Commit', 'Auteur', 'Fournisseur', 'État', 'Durée', 'Déclenché', ''].map((c) => (
                    <th key={c} className="pipelines-table-head">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 60).map((r) => (
                  <tr key={r.id} className="pipelines-table-row">
                    <td className="pipelines-table-cell pipelines-cell-repo">{r.repo}</td>
                    <td className="pipelines-table-cell mono muted">{r.branch || '—'}</td>
                    <td className="pipelines-table-cell mono muted">{r.sha || '—'}{r.pullRequestNumber ? <span className="faint"> · #{r.pullRequestNumber}</span> : ''}</td>
                    <td className="pipelines-table-cell muted">{r.author || 'non disponible'}</td>
                    <td className="pipelines-table-cell">
                      <span className="pipelines-provider">
                        <Icon name={PROVIDER_ICON[r.provider] || 'gitBranch'} size={12} className="pipelines-provider-icon" />{r.provider}
                      </span>
                    </td>
                    <td className="pipelines-table-cell">
                      {r.webUrl ? (
                        <a href={r.webUrl} target="_blank" rel="noreferrer" className={`badge badge-${STATUS_TONE[r.status]} pipelines-status-link`} title="Voir sur la forge d'origine">
                          <span className="dot" />{STATUS_LABEL[r.status]}
                        </a>
                      ) : (
                        <span className={`badge badge-${STATUS_TONE[r.status]}`}><span className="dot" />{STATUS_LABEL[r.status]}</span>
                      )}
                    </td>
                    <td className="pipelines-table-cell mono">{formatDuration(r.durationSeconds)}</td>
                    <td className="pipelines-table-cell pipelines-cell-date">{new Date(r.createdAt).toLocaleString('fr-FR')}</td>
                    <td className="pipelines-table-cell">
                      <div className="pipelines-row-actions">
                        {r.jobsSupported && (
                          <span className="btn-outline pipelines-action-btn" onClick={() => setJobsFor(r)}>
                            <Icon name="layers" size={11} />Jobs
                          </span>
                        )}
                        {r.retryable && user?.role === 'admin' && (
                          <span className="btn-outline pipelines-action-btn" onClick={() => askRetry(r)}>
                            <Icon name="refresh" size={11} />Relancer
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {pending && (
        <ActionConfirmModal
          title={pending.title}
          sub={pending.sub}
          tone={pending.tone}
          impact={pending.impact}
          confirmLabel={pending.confirmLabel}
          onClose={() => setPending(null)}
          onConfirm={pending.run}
        />
      )}

      {jobsFor && <JobsModal run={jobsFor} onClose={() => setJobsFor(null)} />}
    </>
  );
}

const STEP_ICON = { success: 'check', failure: 'xCircle', cancelled: 'xCircle' };

function JobsModal({ run, onClose }) {
  const { data, loading, error } = useApi(() => api.get(`/pipelines/runs/${encodeURIComponent(run.id)}/jobs`), [run.id]);
  const jobs = data?.items || [];
  return (
    <Modal title="Jobs de l'exécution" sub={`${run.repo} · ${run.branch || ''}`} onClose={onClose} width={560}>
      {loading && <div className="faint pipelines-modal-loading">Chargement…</div>}
      {error && <div className="pipelines-modal-error">{error}</div>}
      {!loading && jobs.length === 0 && !error && <div className="faint pipelines-modal-empty">Aucun job trouvé pour cette exécution.</div>}
      <div className="pipelines-jobs-list">
        {jobs.map((j) => (
          <div key={j.id}>
            <div className="pipelines-job-header">
              <span className={`badge badge-${STATUS_TONE[j.conclusion === 'success' ? 'success' : j.status === 'in_progress' ? 'running' : j.conclusion ? 'failed' : 'other']}`}>
                <span className="dot" />{j.status === 'in_progress' ? 'En cours' : (j.conclusion || j.status)}
              </span>
              <a href={j.webUrl} target="_blank" rel="noreferrer" className="pipelines-job-name">{j.name}</a>
              {stageLabelFor(j.name) && <span className="badge badge-vio">{stageLabelFor(j.name)}</span>}
            </div>
            {(j.steps || []).length > 0 && (
              <div className="pipelines-job-steps">
                {j.steps.map((s) => (
                  <div key={s.number} className="pipelines-job-step">
                    <Icon name={STEP_ICON[s.conclusion] || 'clock'} size={12} className="pipelines-job-step-icon" style={{ color: s.conclusion === 'success' ? 'var(--tone-ok-fg)' : s.conclusion === 'failure' ? 'var(--tone-crit-fg)' : 'var(--text-faint)' }} />
                    {s.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
