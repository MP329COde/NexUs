import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './EnvironmentBlueprintsPanel.css';

const KINDS = [
  { value: 'development', label: 'Développement' },
  { value: 'preview', label: 'Preview' },
  { value: 'staging', label: 'Staging' },
  { value: 'production', label: 'Production' },
  { value: 'custom', label: 'Personnalisé' }
];
const EMPTY_FORM = { name: '', kind: 'staging', namespacePattern: '', replicas: 1, cpu: '', memory: '', storageGb: '', ingressDomain: '', ttlMinutes: '', monitoringEnabled: true };

function kindLabel(v) { return KINDS.find((k) => k.value === v)?.label || v; }

// Environment Blueprints (ÉTAPE 10 IDP) : profils de ressources réutilisables
// à l'échelle d'une organisation (namespace, replicas, CPU/RAM/stockage,
// ingress, TTL, monitoring), appliqués à la création d'un environnement
// (voir EnvironmentsPage.jsx). Ne provisionne rien de réel côté Kubernetes —
// c'est une déclaration de configuration, pas une exécution (voir
// db/migrations/0014_environment_blueprints.sql).
export default function EnvironmentBlueprintsPanel() {
  const notify = useNotify();
  const orgs = useApi(() => api.get('/organizations'), []);
  const [orgId, setOrgId] = useState('');
  const blueprints = useApi(() => (orgId ? api.get(`/environment-blueprints?orgId=${orgId}`) : Promise.resolve(null)), [orgId]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const allOrgs = orgs.data?.items || [];
  const items = blueprints.data?.items || [];

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(bp) {
    setEditing(bp);
    setForm({
      name: bp.name, kind: bp.kind, namespacePattern: bp.namespace_pattern, replicas: bp.replicas,
      cpu: bp.cpu, memory: bp.memory, storageGb: bp.storage_gb ?? '', ingressDomain: bp.ingress_domain,
      ttlMinutes: bp.ttl_minutes ?? '', monitoringEnabled: bp.monitoring_enabled
    });
    setFormOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const payload = {
      ...form,
      replicas: Number(form.replicas) || 0,
      storageGb: form.storageGb === '' ? null : Number(form.storageGb),
      ttlMinutes: form.ttlMinutes === '' ? null : Number(form.ttlMinutes)
    };
    try {
      if (editing) {
        await api.put(`/environment-blueprints/${editing.id}`, payload);
        notify('Blueprint mis à jour', { type: 'ok' });
      } else {
        await api.post('/environment-blueprints', { ...payload, orgId });
        notify('Blueprint créé', { type: 'ok' });
      }
      setFormOpen(false);
      blueprints.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(bp) {
    if (!confirm(`Supprimer le blueprint « ${bp.name} » ?`)) return;
    try {
      await api.del(`/environment-blueprints/${bp.id}`);
      notify('Blueprint supprimé', { type: 'info' });
      blueprints.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <Panel title="Blueprints d'environnement" sub="Profils de ressources réutilisables (namespace, replicas, CPU/RAM, ingress, TTL)" span={12}>
      <div className="ebp-org-row">
        <select className="input" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          <option value="">Sélectionner une organisation…</option>
          {allOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {orgId && (
          <button className="btn" onClick={openCreate}>
            <Icon name="plus" size={14} />Nouveau blueprint
          </button>
        )}
      </div>

      {!orgId ? (
        <p className="faint ebp-empty">Choisissez une organisation pour voir ses blueprints.</p>
      ) : items.length === 0 ? (
        <p className="faint ebp-empty">Aucun blueprint dans cette organisation.</p>
      ) : (
        <div className="ebp-table">
          {items.map((bp) => (
            <div key={bp.id} className="ebp-row">
              <div className="ebp-row-main">
                <span className="ebp-row-name">{bp.name}</span>
                <span className="badge badge-mut">{kindLabel(bp.kind)}</span>
              </div>
              <div className="faint ebp-row-meta">
                {bp.namespace_pattern && <span>ns: {bp.namespace_pattern}</span>}
                <span>{bp.replicas} replica(s)</span>
                {bp.cpu && <span>{bp.cpu} CPU</span>}
                {bp.memory && <span>{bp.memory} RAM</span>}
                {bp.storage_gb != null && <span>{bp.storage_gb} Go</span>}
                {bp.ttl_minutes != null && <span>TTL {bp.ttl_minutes} min</span>}
                <span>{bp.monitoring_enabled ? 'Monitoring actif' : 'Monitoring désactivé'}</span>
              </div>
              <div className="ebp-row-actions">
                <span className="btn-outline" onClick={() => openEdit(bp)}><Icon name="edit" size={12} /></span>
                <span className="btn-outline" onClick={() => remove(bp)}><Icon name="trash" size={12} /></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <form onSubmit={submit} className="ebp-form">
          <div className="projects-form-row">
            <div className="projects-form-field-name">
              <label className="projects-form-label">Nom</label>
              <input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Staging standard" />
            </div>
            <div className="projects-form-field-desc">
              <label className="projects-form-label">Type</label>
              <select className="input" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
          </div>
          <label className="projects-form-label">Motif de namespace</label>
          <input className="input" value={form.namespacePattern} onChange={(e) => setForm((f) => ({ ...f, namespacePattern: e.target.value }))} placeholder="{project}-staging" style={{ marginBottom: 12 }} />
          <div className="projects-form-row">
            <div className="projects-form-field-name">
              <label className="projects-form-label">Replicas</label>
              <input className="input" type="number" min="0" value={form.replicas} onChange={(e) => setForm((f) => ({ ...f, replicas: e.target.value }))} />
            </div>
            <div className="projects-form-field-desc">
              <label className="projects-form-label">Stockage (Go)</label>
              <input className="input" type="number" min="0" value={form.storageGb} onChange={(e) => setForm((f) => ({ ...f, storageGb: e.target.value }))} />
            </div>
          </div>
          <div className="projects-form-row">
            <div className="projects-form-field-name">
              <label className="projects-form-label">CPU</label>
              <input className="input" value={form.cpu} onChange={(e) => setForm((f) => ({ ...f, cpu: e.target.value }))} placeholder="500m" />
            </div>
            <div className="projects-form-field-desc">
              <label className="projects-form-label">Mémoire</label>
              <input className="input" value={form.memory} onChange={(e) => setForm((f) => ({ ...f, memory: e.target.value }))} placeholder="512Mi" />
            </div>
          </div>
          <label className="projects-form-label">Domaine d'ingress</label>
          <input className="input" value={form.ingressDomain} onChange={(e) => setForm((f) => ({ ...f, ingressDomain: e.target.value }))} placeholder="staging.homelab.local" style={{ marginBottom: 12 }} />
          <div className="projects-form-row">
            <div className="projects-form-field-name">
              <label className="projects-form-label">TTL (minutes, vide = pas d'expiration)</label>
              <input className="input" type="number" min="0" value={form.ttlMinutes} onChange={(e) => setForm((f) => ({ ...f, ttlMinutes: e.target.value }))} />
            </div>
            <div className="projects-form-field-desc" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={form.monitoringEnabled} onChange={(e) => setForm((f) => ({ ...f, monitoringEnabled: e.target.checked }))} />
                Monitoring activé
              </label>
            </div>
          </div>
          <div className="projects-form-actions">
            <span className="btn-outline" onClick={() => setFormOpen(false)}>Annuler</span>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer'}</button>
          </div>
        </form>
      )}
    </Panel>
  );
}
