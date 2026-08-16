import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';
import ReviewSchedulePanel from './ReviewSchedulePanel.jsx';
import './CodeReviewsPage.css';

function hoursSince(iso) {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}
function formatAge(hours) {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} j`;
}
function isSelfAuthored(item, user) {
  const handle = (user?.username || user?.email?.split('@')[0] || '').toLowerCase();
  return handle && item.author && item.author.toLowerCase() === handle;
}
const PROVIDER_ICON = { gitlab: 'gitlab', github: 'github' };

// "Revue de code" : MR/PR ouvertes réelles (GitLab + GitHub, voir GET
// /reviews), avec assignation locale de relecteurs (aucune API de forge ne
// l'expose ici) et approbation qui proxy directement vers GitLab/GitHub.
// L'auto-relecture reste possible mais affiche un avertissement explicite.
export default function CodeReviewsPage() {
  const { user } = useAuth();
  const notify = useNotify();
  const { data, reload } = useApi(() => api.get('/reviews'), [], { pollMs: 20000 });
  const [filter, setFilter] = useState('');

  const items = data?.items || [];
  const reviewerNames = data?.reviewerNames || {};
  const q = filter.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.title.toLowerCase().includes(q) || i.repo.toLowerCase().includes(q)) : items;

  const openCount = items.length;
  const unassignedCount = items.filter((i) => i.reviewerIds.length === 0).length;
  const staleCount = items.filter((i) => (hoursSince(i.createdAt) || 0) > 24 && i.reviewerIds.length === 0).length;
  const mineCount = items.filter((i) => i.reviewerIds.includes(user?.id)).length;

  const loadByReviewer = {};
  for (const i of items) {
    for (const rid of i.reviewerIds) loadByReviewer[rid] = (loadByReviewer[rid] || 0) + 1;
  }
  const loadRows = Object.entries(loadByReviewer).map(([id, count]) => ({ id, name: reviewerNames[id] || 'Inconnu', count })).sort((a, b) => b.count - a.count);

  async function assignMe(item) {
    try {
      await api.post(`/reviews/${encodeURIComponent(item.key)}/assign`, {});
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }
  async function unassign(item, userId) {
    await api.post(`/reviews/${encodeURIComponent(item.key)}/unassign`, { userId });
    reload();
  }
  async function approve(item) {
    const selfReview = isSelfAuthored(item, user);
    if (selfReview && !confirm("Vous êtes l'auteur de cette demande de fusion. Confirmer quand même l'auto-approbation ?")) return;
    try {
      const res = await api.post(`/reviews/${encodeURIComponent(item.key)}/approve`, {});
      notify(res.result?.message || 'Approuvée', { type: 'ok' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <>
      <PageHeader title="Revues de code" sub="Demandes de fusion ouvertes, relecteurs et délais de traitement." />

      <div className="reviews-kpi-grid">
        <KpiCard label="Revues ouvertes" value={openCount} tint="#3B82F6" />
        <KpiCard label="Sans relecteur" value={unassignedCount} tint={unassignedCount > 0 ? '#F43F5E' : '#10B981'} />
        <KpiCard label="En attente > 24h" value={staleCount} tint={staleCount > 0 ? '#F59E0B' : '#10B981'} />
        <KpiCard label="Assignées à moi" value={mineCount} tint="#8B5CF6" />
      </div>

      <Panel
        title="Demandes de fusion"
        sub="Toutes forges"
        span={12}
        style={{ marginBottom: 16 }}
        actions={<input className="input reviews-filter-input" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      >
        {filtered.length === 0 ? (
          <div className="reviews-empty">
            {items.length === 0 ? 'Aucune demande de fusion ouverte (ou aucune forge configurée)' : 'Aucune revue ne correspond au filtre'}
          </div>
        ) : (
          <div className="reviews-table-wrap">
            <table className="reviews-table">
              <thead>
                <tr>
                  {['Titre', 'Dépôt', 'Auteur', 'Relecteurs', 'Ouverte depuis', 'État', 'Gestion'].map((c) => (
                    <th key={c} className="reviews-table-head">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => {
                  const age = hoursSince(i.createdAt);
                  const selfReview = isSelfAuthored(i, user);
                  const state = i.reviewerIds.length === 0 ? { label: 'Sans relecteur', tone: 'crit' } : { label: 'En cours', tone: 'warn' };
                  return (
                    <tr key={i.key} className="reviews-table-row">
                      <td className="reviews-table-cell reviews-cell-title">
                        <a href={i.webUrl} target="_blank" rel="noreferrer" className="reviews-title-link">{i.title}</a>
                        {selfReview && (
                          <div className="reviews-self-warning">
                            <Icon name="alertTriangle" size={11} />Vous êtes l'auteur
                          </div>
                        )}
                      </td>
                      <td className="reviews-table-cell">
                        <span className="mono muted reviews-repo"><Icon name={PROVIDER_ICON[i.provider] || 'gitBranch'} size={11} />{i.repo}</span>
                      </td>
                      <td className="reviews-table-cell mono">{i.author}</td>
                      <td className="reviews-table-cell">
                        {i.reviewerIds.length === 0 ? <span className="faint">—</span> : i.reviewerIds.map((rid) => (
                          <span key={rid} className="badge badge-mut reviews-reviewer-badge" onClick={() => unassign(i, rid)} title="Retirer">
                            {reviewerNames[rid] || 'Inconnu'} <Icon name="x" size={10} />
                          </span>
                        ))}
                      </td>
                      <td className="reviews-table-cell" style={{ color: age > 24 ? 'var(--tone-crit-fg)' : 'var(--text-faint)' }}>
                        <span className="reviews-age"><Icon name="clock" size={11} />{formatAge(age)}</span>
                      </td>
                      <td className="reviews-table-cell"><span className={`badge badge-${state.tone}`}><span className="dot" />{state.label}</span></td>
                      <td className="reviews-table-cell">
                        <div className="reviews-row-actions">
                          {!i.reviewerIds.includes(user?.id) && <span className="btn-outline reviews-action-btn" onClick={() => assignMe(i)}>S'assigner</span>}
                          {user?.role === 'admin' && (
                            <span className="btn reviews-action-btn" onClick={() => approve(i)}>{selfReview ? 'Auto-approuver' : 'Approuver'}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="reviews-schedule-wrap">
        <ReviewSchedulePanel reviewerNames={reviewerNames} />
      </div>

      <Panel title="Charge de relecture" sub="Revues assignées par personne" span={12}>
        {loadRows.length === 0 ? (
          <div className="reviews-load-empty">Personne n'est encore assigné</div>
        ) : (
          <div className="reviews-load-list">
            {loadRows.map((r) => (
              <div key={r.id} className="reviews-load-row">
                <span className="reviews-load-name">{r.name}</span>
                <div className="reviews-load-bar-track">
                  <div className="reviews-load-bar-fill" style={{ width: `${Math.min(100, (r.count / Math.max(...loadRows.map((x) => x.count), 1)) * 100)}%` }} />
                </div>
                <span className="mono reviews-load-count">{r.count}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
