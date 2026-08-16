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
import './EnvironmentsPage.css';

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

      <div className="env-kpi-grid">
        <KpiCard label="Projets" value={projects.length} tint="#3B82F6" />
      </div>

      <div className="env-project-list">
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
      title={(<Link to={`/deployments/projects/${project.id}`} className="env-project-link">{project.name}</Link>)}
      sub={`${environments.length} environnement(s)`}
      span={12}
      actions={<span className="btn-outline env-toggle-btn" onClick={onToggle}>{expanded ? 'Réduire' : 'Détails & promotions'}</span>}
    >
      <div className="env-table-wrap">
        <table className="env-table">
          <thead>
            <tr>
              {['Environnement', 'App Argo CD', 'Synchro', 'Santé', 'Revision', 'Promouvoir depuis', ''].map((c) => (
                <th key={c} className="env-table-head">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {environments.map((env) => (
              <tr key={env.id} className="env-table-row">
                <td className="env-table-cell">
                  <span className={`badge ${env.is_production ? 'badge-crit' : 'badge-mut'} env-badge-kind`}>{env.is_production ? 'Production' : env.kind}</span>
                  <strong>{env.name}</strong>
                </td>
                <td className="env-table-cell">
                  {linking === env.id ? (
                    <span className="env-link-form">
                      <input className="input mono env-link-input" placeholder="nom app Argo CD" value={appInput} onChange={(e) => setAppInput(e.target.value)} />
                      <button className="btn env-link-save-btn" type="button" onClick={() => saveLink(env)}>OK</button>
                    </span>
                  ) : env.argocd_app ? (
                    <span className="mono env-link-value" onClick={() => { setLinking(env.id); setAppInput(env.argocd_app); }}>{env.argocd_app}</span>
                  ) : (
                    <span className="btn-outline env-link-btn" onClick={() => { setLinking(env.id); setAppInput(''); }}>Lier une app</span>
                  )}
                </td>
                <td className="env-table-cell">
                  {env.app?.error ? <span className="faint env-app-error">{env.app.error}</span>
                    : env.app?.syncStatus ? <span className={`badge badge-${env.app.syncStatus === 'Synced' ? 'ok' : 'warn'}`}><span className="dot" />{env.app.syncStatus}</span>
                    : <span className="faint">—</span>}
                </td>
                <td className="env-table-cell">
                  {env.app?.healthStatus ? <span className={`badge badge-${env.app.healthStatus === 'Healthy' ? 'ok' : 'warn'}`}><span className="dot" />{env.app.healthStatus}</span> : <span className="faint">—</span>}
                </td>
                <td className="env-table-cell mono muted">{env.app?.revision || '—'}</td>
                <td className="env-table-cell">
                  {env.argocd_app && (
                    <select className="input env-promote-select" value={promoteFrom[env.id] || ''} onChange={(e) => setPromoteFrom((prev) => ({ ...prev, [env.id]: e.target.value }))}>
                      <option value="">(re-sync direct)</option>
                      {environments.filter((e) => e.id !== env.id && e.argocd_app).map((e) => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="env-table-cell">
                  {env.argocd_app && (
                    <button className="btn env-promote-btn" type="button" disabled={promoting === env.id} onClick={() => doPromote(env)}>
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
        <div className="env-history">
          <div className="env-history-heading">Historique des promotions</div>
          {promotions.length === 0 ? (
            <div className="faint env-history-empty">Aucune promotion encore effectuée.</div>
          ) : (
            promotions.map((p) => (
              <div key={p.id} className="env-history-row">
                <Icon name={p.status === 'synced' ? 'check' : 'xCircle'} size={13} className="env-history-icon" style={{ color: `var(--tone-${p.status === 'synced' ? 'ok' : 'crit'}-fg)` }} />
                <div>
                  <div>{p.from_environment_name ? `${p.from_environment_name} → ${p.to_environment_name}` : `Synchronisation directe → ${p.to_environment_name}`} <span className="mono faint">({p.argocd_app})</span></div>
                  <div className="faint mono env-history-meta">{formatDate(p.created_at)}{p.revision ? ` · ${p.revision.slice(0, 7)}` : ''} · {p.message}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Panel>
  );
}
