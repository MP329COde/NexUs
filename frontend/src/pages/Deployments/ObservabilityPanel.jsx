import { useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import { Link } from 'react-router-dom';

// Observabilité centrée Service (Priorité 5) : Metrics/Dashboards (Grafana),
// Alerts (Grafana Alertmanager), Logs (lien direct vers les pods du namespace
// rattaché), SLO (calcul réel à partir des incidents du composant), Traces
// (Tempo/Jaeger si configuré) — chaque section affiche honnêtement "Non
// configuré" plutôt que d'inventer une donnée, comme le reste du repo.
export default function ObservabilityPanel({ componentId, canManage, onChanged, k8sNamespace, grafanaDashboardUid, sloTarget }) {
  const notify = useNotify();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ k8sNamespace: k8sNamespace || '', grafanaDashboardUid: grafanaDashboardUid || '', sloTarget: sloTarget ?? '' });
  const [busy, setBusy] = useState(false);

  const slo = useApi(() => api.get(`/catalog/components/${componentId}/slo`), [componentId]);
  const dashboards = useApi(() => api.get('/grafana/dashboards').catch(() => null), []);
  const alerts = useApi(() => api.get('/grafana/alerts').catch(() => null), []);
  const traces = useApi(() => api.get(`/catalog/components/${componentId}/traces`).catch((err) => ({ error: err.message })), [componentId]);

  const dashboard = grafanaDashboardUid ? (dashboards.data?.items || []).find((d) => d.uid === grafanaDashboardUid) : null;
  const relatedAlerts = (alerts.data?.items || []).filter((a) => a.name?.toLowerCase().includes((form.k8sNamespace || '').toLowerCase()));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/catalog/components/${componentId}`, form);
      notify('Rattachements d\'observabilité enregistrés', { type: 'ok' });
      setEditing(false);
      onChanged?.();
      slo.reload();
      traces.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card catalog-detail-card">
      <div className="catalog-deps-header">
        <span className="faint">Observabilité — Metrics, logs, alertes, SLO et traces</span>
        {canManage && <span className="btn-outline catalog-deps-add-btn" onClick={() => setEditing(true)}>Configurer</span>}
      </div>

      <div className="catalog-deps-header"><span className="faint">SLO / disponibilité (30 jours)</span></div>
      {slo.data ? (
        <div className="catalog-deps-row">
          <span className="mono">{slo.data.availabilityPct}%</span>
          {slo.data.target != null ? (
            <span className={`faint ${slo.data.availabilityPct < slo.data.target ? 'pd-env-expired' : ''}`}>objectif {slo.data.target}% · budget d'erreur {slo.data.errorBudgetRemainingPct}%</span>
          ) : (
            <span className="faint">Aucun objectif défini</span>
          )}
          <span className="faint">tendance {slo.data.trend >= 0 ? '+' : ''}{slo.data.trend} pt</span>
          <span className="faint">{slo.data.openIncidentCount} incident(s) ouvert(s) · {slo.data.incidentCount} sur la période</span>
        </div>
      ) : <p className="faint catalog-deps-empty">Calcul en cours…</p>}

      <div className="catalog-deps-header"><span className="faint">Dashboards & Metrics (Grafana)</span></div>
      {!dashboards.data ? (
        <p className="faint catalog-deps-empty">Grafana non configuré (Paramètres → Intégrations).</p>
      ) : dashboard ? (
        <div className="catalog-deps-row">
          <a href={dashboard.url} target="_blank" rel="noreferrer" className="btn-outline catalog-deps-add-btn">Ouvrir {dashboard.title}</a>
        </div>
      ) : (
        <p className="faint catalog-deps-empty">Aucun dashboard rattaché à ce service.</p>
      )}

      <div className="catalog-deps-header"><span className="faint">Alertes</span></div>
      {!alerts.data ? (
        <p className="faint catalog-deps-empty">Grafana non configuré (Paramètres → Intégrations).</p>
      ) : relatedAlerts.length === 0 ? (
        <p className="faint catalog-deps-empty">Aucune alerte active correspondant au namespace de ce service.</p>
      ) : (
        relatedAlerts.map((a, i) => (
          <div key={i} className="catalog-deps-row">
            <span className={`badge badge-${a.severity === 'critical' ? 'crit' : 'warn'}`}>{a.severity}</span>
            <span>{a.name}</span>
          </div>
        ))
      )}

      <div className="catalog-deps-header"><span className="faint">Logs</span></div>
      {k8sNamespace ? (
        <div className="catalog-deps-row"><Link to={`/kubernetes?ns=${encodeURIComponent(k8sNamespace)}`} className="btn-outline catalog-deps-add-btn">Voir les pods & logs de {k8sNamespace}</Link></div>
      ) : <p className="faint catalog-deps-empty">Aucun namespace Kubernetes rattaché à ce service.</p>}

      <div className="catalog-deps-header"><span className="faint">Traces distribuées</span></div>
      {traces.data?.error || !traces.data?.items ? (
        <p className="faint catalog-deps-empty">Traces non configurées (Tempo/Jaeger — Paramètres → Intégrations).</p>
      ) : traces.data.items.length === 0 ? (
        <p className="faint catalog-deps-empty">Aucune trace trouvée pour ce service (tag <code>service.name</code>).</p>
      ) : (
        <>
          {traces.data.items.slice(0, 10).map((t) => (
            <div key={t.traceId} className="catalog-deps-row">
              <span className="mono">{t.traceId.slice(0, 12)}</span>
              {t.durationMs != null && <span className="faint">{t.durationMs} ms</span>}
              {t.spanCount != null && <span className="faint">{t.spanCount} span(s)</span>}
            </div>
          ))}
          {traces.data.uiUrl && <a href={traces.data.uiUrl} target="_blank" rel="noreferrer" className="btn-outline catalog-deps-add-btn">Ouvrir dans l'outil de traçage</a>}
        </>
      )}

      {editing && (
        <Modal title="Configurer l'observabilité" onClose={() => setEditing(false)}>
          <form onSubmit={save} className="pd-list-loose">
            <input className="input mono" placeholder="Namespace Kubernetes" value={form.k8sNamespace} onChange={(e) => setForm((f) => ({ ...f, k8sNamespace: e.target.value }))} />
            <input className="input mono" placeholder="UID du dashboard Grafana" value={form.grafanaDashboardUid} onChange={(e) => setForm((f) => ({ ...f, grafanaDashboardUid: e.target.value }))} />
            <input className="input mono" type="number" min="0" max="100" step="0.01" placeholder="Objectif de disponibilité % (ex. 99.9)" value={form.sloTarget} onChange={(e) => setForm((f) => ({ ...f, sloTarget: e.target.value }))} />
            <div className="projects-form-actions">
              <span className="btn-outline" onClick={() => setEditing(false)}>Annuler</span>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
