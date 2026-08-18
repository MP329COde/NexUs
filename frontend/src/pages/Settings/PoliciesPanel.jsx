import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './EnvironmentBlueprintsPanel.css';

const KINDS = [
  { value: 'require_owner_team', label: 'Équipe propriétaire requise', threshold: false },
  { value: 'require_production_lifecycle', label: 'Cycle de vie "production" requis', threshold: false },
  { value: 'require_description', label: 'Documentation requise', threshold: false },
  { value: 'require_repository', label: 'Dépôt relié requis', threshold: false },
  { value: 'block_critical_code_scan', label: 'Bloque si erreurs sur le dernier scan de code', threshold: true },
  { value: 'block_high_dast_scan', label: 'Bloque si alertes élevées sur le dernier scan DAST', threshold: true }
];
const EMPTY_FORM = { name: '', kind: 'require_owner_team', threshold: '' };

function kindMeta(v) { return KINDS.find((k) => k.value === v) || KINDS[0]; }

// Policy Engine (ÉTAPE 16 IDP) : règles évaluables sur un composant du
// Software Catalog, chacune calculée à partir d'un signal réel — voir
// services/policyEngine.js. L'évaluation elle-même se fait depuis la fiche
// composant (CatalogComponentPage.jsx) ; cette page ne fait que
// créer/activer/désactiver/supprimer les règles d'une organisation.
export default function PoliciesPanel() {
  const notify = useNotify();
  const orgs = useApi(() => api.get('/organizations'), []);
  const [orgId, setOrgId] = useState('');
  const policies = useApi(() => (orgId ? api.get(`/policies?orgId=${orgId}`) : Promise.resolve(null)), [orgId]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const allOrgs = orgs.data?.items || [];
  const items = policies.data?.items || [];

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/policies', { orgId, name: form.name, kind: form.kind, threshold: form.threshold === '' ? null : Number(form.threshold) });
      notify('Policy créée', { type: 'ok' });
      setForm(EMPTY_FORM);
      setFormOpen(false);
      policies.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(policy) {
    try {
      await api.put(`/policies/${policy.id}`, { enabled: !policy.enabled });
      policies.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function remove(policy) {
    if (!confirm(`Supprimer la policy « ${policy.name} » ?`)) return;
    try {
      await api.del(`/policies/${policy.id}`);
      notify('Policy supprimée', { type: 'info' });
      policies.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <Panel title="Policies" sub="Règles évaluées sur les composants du catalogue — voir l'onglet Policy Engine sur chaque fiche composant" span={12}>
      <div className="ebp-org-row">
        <select className="input" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          <option value="">Sélectionner une organisation…</option>
          {allOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {orgId && (
          <button className="btn" onClick={() => setFormOpen(true)}>
            <Icon name="plus" size={14} />Nouvelle policy
          </button>
        )}
      </div>

      {!orgId ? (
        <p className="faint ebp-empty">Choisissez une organisation pour voir ses policies.</p>
      ) : items.length === 0 ? (
        <p className="faint ebp-empty">Aucune policy dans cette organisation.</p>
      ) : (
        <div className="ebp-table">
          {items.map((p) => (
            <div key={p.id} className="ebp-row">
              <div className="ebp-row-main">
                <span className="ebp-row-name">{p.name}</span>
                <span className={`badge ${p.enabled ? 'badge-ok' : 'badge-mut'}`}><span className="dot" />{p.enabled ? 'Activée' : 'Désactivée'}</span>
              </div>
              <div className="faint ebp-row-meta">
                <span>{kindMeta(p.kind).label}</span>
                {p.threshold != null && <span>seuil : {p.threshold}</span>}
              </div>
              <div className="ebp-row-actions">
                <span className="btn-outline" onClick={() => toggle(p)}>{p.enabled ? 'Désactiver' : 'Activer'}</span>
                <span className="btn-outline" onClick={() => remove(p)}><Icon name="trash" size={12} /></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <form onSubmit={submit} className="ebp-form">
          <label className="projects-form-label">Nom</label>
          <input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Owner requis" style={{ marginBottom: 12 }} />
          <label className="projects-form-label">Règle</label>
          <select className="input" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))} style={{ marginBottom: 12 }}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          {kindMeta(form.kind).threshold && (
            <>
              <label className="projects-form-label">Seuil toléré (vide = 0)</label>
              <input className="input" type="number" min="0" value={form.threshold} onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))} style={{ marginBottom: 12 }} />
            </>
          )}
          <div className="projects-form-actions">
            <span className="btn-outline" onClick={() => setFormOpen(false)}>Annuler</span>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Création…' : 'Créer'}</button>
          </div>
        </form>
      )}
    </Panel>
  );
}
