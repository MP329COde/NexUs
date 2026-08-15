import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import MiniLineChart from '../../components/ui/MiniLineChart.jsx';
import MiniDonut from '../../components/ui/MiniDonut.jsx';
import Icon from '../../components/ui/Icon.jsx';
import ActionConfirmModal from '../../components/ui/ActionConfirmModal.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const STATUS_TONE = { success: 'ok', failed: 'crit', running: 'info', cancelled: 'mut', other: 'mut' };
const STATUS_LABEL = { success: 'Succès', failed: 'Échec', running: 'En cours', cancelled: 'Annulé', other: '—' };
const PROVIDER_ICON = { gitlab: 'gitlab', github: 'github' };

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard label="Exécutions 24h" value={last24h.length} tint="#3B82F6" />
        <KpiCard label="Taux de réussite 7j" value={successRate ?? '—'} unit={successRate !== null ? '%' : ''} tint={successRate === null ? '#94A3B8' : successRate >= 90 ? '#10B981' : '#F59E0B'} />
        <KpiCard label="Durée médiane 7j" value={formatDuration(medianDuration)} tint="#8B5CF6" />
        <KpiCard label="En cours" value={running} tint={running > 0 ? '#3B82F6' : '#10B981'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16, marginBottom: 16 }}>
        <Panel title="Volume des exécutions" sub="Par heure écoulée (24 dernières heures)" span={8}>
          <div style={{ padding: '14px 16px' }}>
            <MiniLineChart values={hourlyBuckets} color="#3B82F6" />
          </div>
        </Panel>
        <Panel title="Résultats" sub="7 derniers jours" span={4}>
          <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 18 }}>
            <MiniDonut segments={donutSegments} centerLabel={finished7d.length} centerSub="exécutions" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
              {donutSegments.map((s) => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flex: 'none' }} />
                  <span style={{ flex: 1, color: 'var(--text-muted)' }}>{s.label}</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{s.value}</span>
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
        actions={<input className="input" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ height: 30, fontSize: 12.5, width: 180 }} />}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>
            {runs.length === 0 ? 'Aucune exécution (GitLab/GitHub non configurés ou aucun pipeline récent)' : 'Aucune exécution ne correspond au filtre'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  {['Dépôt', 'Branche', 'Fournisseur', 'État', 'Durée', 'Déclenché', ''].map((c) => (
                    <th key={c} style={{ textAlign: 'left', padding: '8px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-soft)' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 60).map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                    <td style={{ padding: '9px 16px', fontWeight: 600 }}>{r.repo}</td>
                    <td style={{ padding: '9px 16px' }} className="mono muted">{r.branch || '—'}</td>
                    <td style={{ padding: '9px 16px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'capitalize' }}>
                        <Icon name={PROVIDER_ICON[r.provider] || 'gitBranch'} size={12} style={{ color: 'var(--text-faint)' }} />{r.provider}
                      </span>
                    </td>
                    <td style={{ padding: '9px 16px' }}>
                      {r.webUrl ? (
                        <a href={r.webUrl} target="_blank" rel="noreferrer" className={`badge badge-${STATUS_TONE[r.status]}`} style={{ textDecoration: 'none' }} title="Voir sur la forge d'origine">
                          <span className="dot" />{STATUS_LABEL[r.status]}
                        </a>
                      ) : (
                        <span className={`badge badge-${STATUS_TONE[r.status]}`}><span className="dot" />{STATUS_LABEL[r.status]}</span>
                      )}
                    </td>
                    <td style={{ padding: '9px 16px' }} className="mono">{formatDuration(r.durationSeconds)}</td>
                    <td style={{ padding: '9px 16px', color: 'var(--text-faint)' }}>{new Date(r.createdAt).toLocaleString('fr-FR')}</td>
                    <td style={{ padding: '9px 16px' }}>
                      {r.retryable && user?.role === 'admin' && (
                        <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => askRetry(r)}>
                          <Icon name="refresh" size={11} />Relancer
                        </span>
                      )}
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
    </>
  );
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
