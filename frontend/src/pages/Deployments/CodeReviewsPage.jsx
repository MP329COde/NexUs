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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 16 }}>
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
        actions={<input className="input" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ height: 30, fontSize: 12.5, width: 180 }} />}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>
            {items.length === 0 ? 'Aucune demande de fusion ouverte (ou aucune forge configurée)' : 'Aucune revue ne correspond au filtre'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  {['Titre', 'Dépôt', 'Auteur', 'Relecteurs', 'Ouverte depuis', 'État', 'Gestion'].map((c) => (
                    <th key={c} style={{ textAlign: 'left', padding: '8px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-soft)' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => {
                  const age = hoursSince(i.createdAt);
                  const selfReview = isSelfAuthored(i, user);
                  const state = i.reviewerIds.length === 0 ? { label: 'Sans relecteur', tone: 'crit' } : { label: 'En cours', tone: 'warn' };
                  return (
                    <tr key={i.key} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                      <td style={{ padding: '10px 16px', maxWidth: 280 }}>
                        <a href={i.webUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit', fontWeight: 500, textDecoration: 'none' }}>{i.title}</a>
                        {selfReview && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--tone-warn-fg)', marginTop: 2 }}>
                            <Icon name="alertTriangle" size={11} />Vous êtes l'auteur
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span className="mono muted" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name={PROVIDER_ICON[i.provider] || 'gitBranch'} size={11} />{i.repo}</span>
                      </td>
                      <td style={{ padding: '10px 16px' }} className="mono">{i.author}</td>
                      <td style={{ padding: '10px 16px' }}>
                        {i.reviewerIds.length === 0 ? <span className="faint">—</span> : i.reviewerIds.map((rid) => (
                          <span key={rid} className="badge badge-mut" style={{ marginRight: 4, cursor: 'pointer' }} onClick={() => unassign(i, rid)} title="Retirer">
                            {reviewerNames[rid] || 'Inconnu'} <Icon name="x" size={10} />
                          </span>
                        ))}
                      </td>
                      <td style={{ padding: '10px 16px', color: age > 24 ? 'var(--tone-crit-fg)' : 'var(--text-faint)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="clock" size={11} />{formatAge(age)}</span>
                      </td>
                      <td style={{ padding: '10px 16px' }}><span className={`badge badge-${state.tone}`}><span className="dot" />{state.label}</span></td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {!i.reviewerIds.includes(user?.id) && <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5 }} onClick={() => assignMe(i)}>S'assigner</span>}
                          {user?.role === 'admin' && (
                            <span className="btn" style={{ height: 26, padding: '0 9px', fontSize: 11.5 }} onClick={() => approve(i)}>{selfReview ? 'Auto-approuver' : 'Approuver'}</span>
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

      <div style={{ marginBottom: 16 }}>
        <ReviewSchedulePanel reviewerNames={reviewerNames} />
      </div>

      <Panel title="Charge de relecture" sub="Revues assignées par personne" span={12}>
        {loadRows.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Personne n'est encore assigné</div>
        ) : (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loadRows.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 140, fontSize: 12.5, fontWeight: 500, flex: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--border-soft)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, (r.count / Math.max(...loadRows.map((x) => x.count), 1)) * 100)}%`, height: '100%', background: '#3B82F6', borderRadius: 999 }} />
                </div>
                <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, width: 20, textAlign: 'right' }}>{r.count}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
