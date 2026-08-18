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
  const [provisioning, setProvisioning] = useState(null);
  const [provisionForm, setProvisionForm] = useState({ repoURL: '', path: '.', targetRevision: '', destinationNamespace: '' });
  const [provisionBusy, setProvisionBusy] = useState(false);
  const [promoting, setPromoting] = useState(null);
  const [promoteFrom, setPromoteFrom] = useState({});
  const [creating, setCreating] = useState(false);
  const [newEnv, setNewEnv] = useState({ name: '', kind: 'staging', blueprintId: '', sourceBranch: '', sourceCommit: '', sourcePrUrl: '' });
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [destroying, setDestroying] = useState(null);
  const [rollingBack, setRollingBack] = useState(null);

  // Les blueprints applicables à ce projet sont ceux de SON organisation
  // (voir EnvironmentBlueprintsPanel.jsx, Paramètres → Blueprints
  // d'environnement) — récupérée via la fiche projet, qui expose déjà orgId.
  const projectDetail = useApi(() => api.get(`/projects/${project.id}`), [project.id]);
  const orgId = projectDetail.data?.project?.orgId;
  const blueprints = useApi(() => (orgId ? api.get(`/environment-blueprints?orgId=${orgId}`) : Promise.resolve(null)), [orgId]);
  const availableBlueprints = blueprints.data?.items || [];

  async function createEnvironment(e) {
    e.preventDefault();
    setCreatingBusy(true);
    try {
      await api.post(`/projects/${project.id}/environments`, {
        name: newEnv.name, kind: newEnv.kind, blueprintId: newEnv.blueprintId || null,
        sourceBranch: newEnv.sourceBranch || null, sourceCommit: newEnv.sourceCommit || null, sourcePrUrl: newEnv.sourcePrUrl || null
      });
      notify(`Environnement "${newEnv.name}" créé`, { type: 'ok' });
      setNewEnv({ name: '', kind: 'staging', blueprintId: '', sourceBranch: '', sourceCommit: '', sourcePrUrl: '' });
      setCreating(false);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setCreatingBusy(false);
    }
  }

  // Destroy Preview (ÉTAPE 11) : jamais proposé pour la production (le
  // backend le refuserait de toute façon — voir orgStore.deleteEnvironment,
  // qui exclut is_production=true — mais autant ne pas afficher un bouton
  // qui échouerait systématiquement).
  async function destroyEnvironment(env) {
    if (!window.confirm(`Détruire l'environnement « ${env.name} » ? Cette action est irréversible.`)) return;
    setDestroying(env.id);
    try {
      await api.del(`/projects/${project.id}/environments/${env.id}`);
      notify(`Environnement "${env.name}" détruit`, { type: 'info' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setDestroying(null);
    }
  }

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

  async function submitProvision(env) {
    setProvisionBusy(true);
    try {
      const res = await api.post(`/projects/${project.id}/environments/${env.id}/provision-argocd-app`, {
        repoURL: provisionForm.repoURL.trim(),
        path: provisionForm.path.trim() || '.',
        targetRevision: provisionForm.targetRevision.trim() || undefined,
        destinationNamespace: provisionForm.destinationNamespace.trim() || undefined
      });
      notify(`Application Argo CD "${res.environment.argocd_app}" provisionnée pour ${env.name}`, { type: 'ok' });
      setProvisioning(null);
      setProvisionForm({ repoURL: '', path: '.', targetRevision: '', destinationNamespace: '' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setProvisionBusy(false);
    }
  }

  async function doRollback(promotion) {
    const label = promotion.revision ? promotion.revision.slice(0, 7) : promotion.id;
    if (!window.confirm(`Revenir "${promotion.to_environment_name}" à la revision ${label} (promotion du ${formatDate(promotion.created_at)}) ?`)) return;
    setRollingBack(promotion.id);
    try {
      const res = await api.post(`/projects/${project.id}/environments/${promotion.to_environment_id}/rollback`, { toPromotionId: promotion.id });
      notify(res.rollback.status === 'synced' ? `Rollback réussi vers ${label}` : `Échec du rollback : ${res.rollback.message}`, { type: res.rollback.status === 'synced' ? 'ok' : 'crit' });
      reload();
      reloadPromotions();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setRollingBack(null);
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
      actions={(
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="btn-outline env-toggle-btn" onClick={() => setCreating((v) => !v)}>Nouvel environnement</span>
          <span className="btn-outline env-toggle-btn" onClick={onToggle}>{expanded ? 'Réduire' : 'Détails & promotions'}</span>
        </div>
      )}
    >
      {creating && (
        <form onSubmit={createEnvironment} className="env-create-form">
          <input className="input" required placeholder="Nom (ex. qa)" value={newEnv.name} onChange={(e) => setNewEnv((f) => ({ ...f, name: e.target.value }))} />
          <select className="input" value={newEnv.kind} onChange={(e) => setNewEnv((f) => ({ ...f, kind: e.target.value }))}>
            <option value="development">Développement</option>
            <option value="preview">Preview</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
            <option value="custom">Personnalisé</option>
          </select>
          <select className="input" value={newEnv.blueprintId} onChange={(e) => setNewEnv((f) => ({ ...f, blueprintId: e.target.value }))}>
            <option value="">Sans blueprint</option>
            {availableBlueprints.map((b) => <option key={b.id} value={b.id}>{b.name}{b.ttl_minutes != null ? ` (TTL ${b.ttl_minutes} min)` : ''}</option>)}
          </select>
          {newEnv.kind === 'preview' && (
            <>
              <input className="input" placeholder="Branche (ex. feature/x)" value={newEnv.sourceBranch} onChange={(e) => setNewEnv((f) => ({ ...f, sourceBranch: e.target.value }))} />
              <input className="input" placeholder="Commit" value={newEnv.sourceCommit} onChange={(e) => setNewEnv((f) => ({ ...f, sourceCommit: e.target.value }))} />
              <input className="input" placeholder="URL de la PR/MR" value={newEnv.sourcePrUrl} onChange={(e) => setNewEnv((f) => ({ ...f, sourcePrUrl: e.target.value }))} />
            </>
          )}
          <button className="btn" type="submit" disabled={creatingBusy}>{creatingBusy ? 'Création…' : 'Créer'}</button>
        </form>
      )}

      <div className="env-table-wrap">
        <table className="env-table">
          <thead>
            <tr>
              {['Environnement', 'App Argo CD', 'Synchro', 'Santé', 'Revision', 'Expire', 'Promouvoir depuis', 'Promotion', 'Destruction'].map((c) => (
                <th key={c} className="env-table-head">{c === 'Promotion' || c === 'Destruction' ? '' : c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {environments.map((env) => (
              <tr key={env.id} className="env-table-row">
                <td className="env-table-cell">
                  <span className={`badge ${env.is_production ? 'badge-crit' : 'badge-mut'} env-badge-kind`}>{env.is_production ? 'Production' : env.kind}</span>
                  <strong>{env.name}</strong>
                  {env.blueprint_name && <span className="faint" style={{ marginLeft: 6, fontSize: 11 }}>({env.blueprint_name})</span>}
                  {env.blueprint_id && (
                    <div className="faint" style={{ fontSize: 11 }}>
                      {env.provisioning_status === 'created' && <>Kubernetes : namespace <span className="mono">{env.provisioned_namespace}</span> appliqué</>}
                      {env.provisioning_status === 'skipped' && <>Kubernetes : non provisionné — {env.provisioning_message}</>}
                      {env.provisioning_status === 'failed' && <span style={{ color: 'var(--danger, #ef4444)' }}>Échec du provisioning : {env.provisioning_message}</span>}
                    </div>
                  )}
                  {env.source_branch && (
                    <div className="faint mono" style={{ fontSize: 11 }}>
                      {env.source_branch}{env.source_commit ? ` · ${env.source_commit.slice(0, 7)}` : ''}
                      {env.source_pr_url && <> · <a href={env.source_pr_url} target="_blank" rel="noreferrer">PR</a></>}
                    </div>
                  )}
                </td>
                <td className="env-table-cell">
                  {linking === env.id ? (
                    <span className="env-link-form">
                      <input className="input mono env-link-input" placeholder="nom app Argo CD" value={appInput} onChange={(e) => setAppInput(e.target.value)} />
                      <button className="btn env-link-save-btn" type="button" onClick={() => saveLink(env)}>OK</button>
                    </span>
                  ) : provisioning === env.id ? (
                    <div className="env-link-form" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4, minWidth: 220 }}>
                      <input className="input mono" placeholder="https://github.com/org/repo.git" value={provisionForm.repoURL} onChange={(e) => setProvisionForm((f) => ({ ...f, repoURL: e.target.value }))} />
                      <input className="input mono" placeholder="chemin des manifestes (.)" value={provisionForm.path} onChange={(e) => setProvisionForm((f) => ({ ...f, path: e.target.value }))} />
                      <input className="input mono" placeholder={`namespace (${env.provisioned_namespace || 'requis'})`} value={provisionForm.destinationNamespace} onChange={(e) => setProvisionForm((f) => ({ ...f, destinationNamespace: e.target.value }))} />
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn" type="button" disabled={provisionBusy || !provisionForm.repoURL.trim()} onClick={() => submitProvision(env)}>{provisionBusy ? '…' : 'Provisionner'}</button>
                        <span className="btn-outline" onClick={() => setProvisioning(null)}>Annuler</span>
                      </div>
                    </div>
                  ) : env.argocd_app ? (
                    <span className="mono env-link-value" onClick={() => { setLinking(env.id); setAppInput(env.argocd_app); }}>{env.argocd_app}</span>
                  ) : (
                    <span style={{ display: 'flex', gap: 6 }}>
                      <span className="btn-outline env-link-btn" onClick={() => { setLinking(env.id); setAppInput(''); }}>Lier une app existante</span>
                      <span className="btn-outline env-link-btn" onClick={() => { setProvisioning(env.id); setProvisionForm({ repoURL: '', path: '.', targetRevision: '', destinationNamespace: env.provisioned_namespace || '' }); }}>Provisionner</span>
                    </span>
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
                  {env.expires_at ? (
                    new Date(env.expires_at).getTime() < Date.now() ? (
                      <span className="badge badge-crit"><span className="dot" />Expiré</span>
                    ) : (
                      <span className="faint mono" style={{ fontSize: 11 }}>{formatDate(env.expires_at)}</span>
                    )
                  ) : <span className="faint">—</span>}
                </td>
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
                <td className="env-table-cell">
                  {!env.is_production && (
                    <button className="btn-outline env-promote-btn" type="button" disabled={destroying === env.id} onClick={() => destroyEnvironment(env)}>
                      {destroying === env.id ? '…' : 'Détruire'}
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
                  <div>
                    {p.is_rollback && <span className="badge badge-mut" style={{ marginRight: 6 }}>Rollback</span>}
                    {p.from_environment_name ? `${p.from_environment_name} → ${p.to_environment_name}` : `Synchronisation directe → ${p.to_environment_name}`} <span className="mono faint">({p.argocd_app})</span>
                  </div>
                  <div className="faint mono env-history-meta">{formatDate(p.created_at)}{p.revision ? ` · ${p.revision.slice(0, 7)}` : ''} · {p.message}</div>
                </div>
                {p.status === 'synced' && p.revision && (
                  <span className="btn-outline" style={{ marginLeft: 'auto', fontSize: 11 }} onClick={() => (rollingBack ? undefined : doRollback(p))}>
                    {rollingBack === p.id ? 'Rollback…' : 'Rollback vers cette version'}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </Panel>
  );
}
