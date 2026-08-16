import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import DemoNote from '../../components/ui/DemoNote.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('fr-FR') : '—';
}

// Modèle multi-environnements réel : chaque environnement (table
// `environments` du socle relationnel, créé automatiquement avec chaque
// projet — production + staging) peut être lié à une application Argo CD
// existante. La promotion lit la revision réellement synchronisée dans
// l'environnement source (API Argo CD) et synchronise l'environnement cible
// dessus — jamais une version inventée. Voir
// backend/src/services/environmentPromotionService.js.
export default function EnvironmentsPage() {
  const notify = useNotify();
  const { data: projectsData } = useApi(() => api.get('/projects'), []);
  const projects = projectsData?.items || [];
  const [expanded, setExpanded] = useState(null);

  return (
    <>
      <PageHeader title="Environnements" sub="Environnements réels par projet, liés à Argo CD, avec promotion basée sur la revision réellement déployée." />
      {projects.length === 0 && (
        <DemoNote>Aucun projet. Créez-en un dans Projets pour voir apparaître ses environnements (production + staging, générés automatiquement).</DemoNote>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard label="Projets" value={projects.length} tint="#3B82F6" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {projects.map((p) => (
          <ProjectEnvironments key={p.id} project={p} expanded={expanded === p.id} onToggle={() => setExpanded(expanded === p.id ? null : p.id)} notify={notify} />
        ))}
      </div>
    </>
  );
}

function ProjectEnvironments({ project, expanded, onToggle, notify }) {
  const { data, reload } = useApi(() => api.get(`/projects/${project.id}/environments`), [project.id]);
  const { data: promoData, reload: reloadPromotions } = useApi(
    () => (expanded ? api.get(`/projects/${project.id}/environments/promotions`) : Promise.resolve(null)), [project.id, expanded]
  );
  const environments = data?.items || [];
  const migrated = data?.migrated;
  const promotions = promoData?.items || [];
  const [linking, setLinking] = useState(null);
  const [appInput, setAppInput] = useState('');
  const [promoting, setPromoting] = useState(null);
  const [promoteFrom, setPromoteFrom] = useState({});

  async function saveLink(env) {
    try {
      await api.put(`/projects/${project.id}/environments/${env.id}/link`, { argocdApp: appInput.trim() || null });
      notify(`Environnement "${env.name}" lié à ${appInput.trim() || '(rien)'}`, { type: 'ok' });
      setLinking(null);
      setAppInput('');
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function doPromote(env) {
    setPromoting(env.id);
    try {
      const fromEnvironmentId = promoteFrom[env.id] || null;
      const res = await api.post(`/projects/${project.id}/environments/${env.id}/promote`, { fromEnvironmentId });
      notify(res.promotion.status === 'synced' ? `Promotion réussie vers ${env.name}` : `Échec : ${res.promotion.message}`, { type: res.promotion.status === 'synced' ? 'ok' : 'crit' });
      reload();
      reloadPromotions();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setPromoting(null);
    }
  }

  if (!migrated) return null;

  return (
    <Panel
      title={(<Link to={`/deployments/projects/${project.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{project.name}</Link>)}
      sub={`${environments.length} environnement(s)`}
      span={12}
      actions={<span className="btn-outline" style={{ height: 26, padding: '0 10px', fontSize: 11.5, cursor: 'pointer' }} onClick={onToggle}>{expanded ? 'Réduire' : 'Détails & promotions'}</span>}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              {['Environnement', 'App Argo CD', 'Synchro', 'Santé', 'Revision', 'Promouvoir depuis', ''].map((c) => (
                <th key={c} style={{ textAlign: 'left', padding: '8px 14px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-soft)' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {environments.map((env) => (
              <tr key={env.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                <td style={{ padding: '9px 14px' }}>
                  <span className={`badge ${env.is_production ? 'badge-crit' : 'badge-mut'}`} style={{ marginRight: 6 }}>{env.is_production ? 'Production' : env.kind}</span>
                  <strong>{env.name}</strong>
                </td>
                <td style={{ padding: '9px 14px' }}>
                  {linking === env.id ? (
                    <span style={{ display: 'flex', gap: 6 }}>
                      <input className="input mono" placeholder="nom app Argo CD" value={appInput} onChange={(e) => setAppInput(e.target.value)} style={{ height: 26, fontSize: 11.5, width: 140 }} />
                      <button className="btn" type="button" onClick={() => saveLink(env)} style={{ height: 26, padding: '0 8px', fontSize: 11 }}>OK</button>
                    </span>
                  ) : env.argocd_app ? (
                    <span className="mono" style={{ cursor: 'pointer' }} onClick={() => { setLinking(env.id); setAppInput(env.argocd_app); }}>{env.argocd_app}</span>
                  ) : (
                    <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11, cursor: 'pointer' }} onClick={() => { setLinking(env.id); setAppInput(''); }}>Lier une app</span>
                  )}
                </td>
                <td style={{ padding: '9px 14px' }}>
                  {env.app?.error ? <span className="faint" style={{ fontSize: 11 }}>{env.app.error}</span>
                    : env.app?.syncStatus ? <span className={`badge badge-${env.app.syncStatus === 'Synced' ? 'ok' : 'warn'}`}><span className="dot" />{env.app.syncStatus}</span>
                    : <span className="faint">—</span>}
                </td>
                <td style={{ padding: '9px 14px' }}>
                  {env.app?.healthStatus ? <span className={`badge badge-${env.app.healthStatus === 'Healthy' ? 'ok' : 'warn'}`}><span className="dot" />{env.app.healthStatus}</span> : <span className="faint">—</span>}
                </td>
                <td style={{ padding: '9px 14px' }} className="mono muted">{env.app?.revision || '—'}</td>
                <td style={{ padding: '9px 14px' }}>
                  {env.argocd_app && (
                    <select className="input" value={promoteFrom[env.id] || ''} onChange={(e) => setPromoteFrom((prev) => ({ ...prev, [env.id]: e.target.value }))} style={{ height: 26, fontSize: 11.5 }}>
                      <option value="">(re-sync direct)</option>
                      {environments.filter((e) => e.id !== env.id && e.argocd_app).map((e) => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td style={{ padding: '9px 14px' }}>
                  {env.argocd_app && (
                    <button className="btn" type="button" disabled={promoting === env.id} onClick={() => doPromote(env)} style={{ height: 26, padding: '0 10px', fontSize: 11.5 }}>
                      {promoting === env.id ? '…' : 'Promouvoir'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {expanded && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-soft)' }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 8, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Historique des promotions</div>
          {promotions.length === 0 ? (
            <div className="faint" style={{ fontSize: 12 }}>Aucune promotion encore effectuée.</div>
          ) : (
            promotions.map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: 9, padding: '6px 0', fontSize: 12 }}>
                <Icon name={p.status === 'synced' ? 'check' : 'xCircle'} size={13} style={{ color: `var(--tone-${p.status === 'synced' ? 'ok' : 'crit'}-fg)`, flex: 'none', marginTop: 2 }} />
                <div>
                  <div>{p.from_environment_name ? `${p.from_environment_name} → ${p.to_environment_name}` : `Synchronisation directe → ${p.to_environment_name}`} <span className="mono faint">({p.argocd_app})</span></div>
                  <div className="faint mono" style={{ fontSize: 10.5 }}>{formatDate(p.created_at)}{p.revision ? ` · ${p.revision.slice(0, 7)}` : ''} · {p.message}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Panel>
  );
}
