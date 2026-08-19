import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './FeatureFlagsPanel.css';

const EMPTY_FORM = { key: '', label: '', description: '', enabled: false };

// Feature flags (todo.md item 26) : activation progressive d'une
// fonctionnalité expérimentale — globalement, ou ciblée par organisation/
// utilisateur (édition avancée non exposée ici, réservée à un usage
// développeur direct sur la table le temps qu'un besoin réel émerge).
export default function FeatureFlagsPanel() {
  const { data, reload } = useApi(() => api.get('/feature-flags'), []);
  const notify = useNotify();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const items = data?.items || [];

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/feature-flags/${form.key}`, { label: form.label, description: form.description, enabled: form.enabled });
      notify('Flag créé', { type: 'ok' });
      setForm(EMPTY_FORM);
      setCreating(false);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(flag) {
    try {
      await api.put(`/feature-flags/${flag.key}`, { label: flag.label, description: flag.description, enabled: !flag.enabled, orgIds: flag.org_ids, userIds: flag.user_ids });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function remove(key) {
    if (!confirm(`Supprimer le flag "${key}" ?`)) return;
    await api.del(`/feature-flags/${key}`);
    reload();
  }

  return (
    <Panel
      title="Feature flags"
      sub="Activation progressive de fonctionnalités expérimentales"
      span={12}
      actions={<span className="btn-outline" onClick={() => setCreating(true)}><Icon name="plus" size={13} /> Nouveau flag</span>}
    >
      {items.length === 0 ? (
        <div className="faint">Aucun feature flag déclaré.</div>
      ) : (
        <div className="ff-list">
          {items.map((f) => (
            <div key={f.key} className="ff-row">
              <div className="ff-row-main">
                <span className="mono ff-row-key">{f.key}</span>
                <span className="ff-row-label">{f.label}</span>
                {f.description && <span className="faint">{f.description}</span>}
              </div>
              <span className={`badge badge-${f.enabled ? 'ok' : 'mut'}`} style={{ cursor: 'pointer' }} onClick={() => toggle(f)}>
                <span className="dot" />{f.enabled ? 'Activé (tous)' : 'Désactivé'}
              </span>
              {(f.org_ids?.length > 0 || f.user_ids?.length > 0) && !f.enabled && (
                <span className="faint">{f.org_ids?.length || 0} org, {f.user_ids?.length || 0} utilisateur(s) ciblé(s)</span>
              )}
              <span className="btn-outline ff-row-delete" onClick={() => remove(f.key)}><Icon name="trash" size={12} /></span>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <form onSubmit={create} className="ff-form">
          <input className="input mono" required placeholder="clé-du-flag" value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} />
          <input className="input" required placeholder="Libellé" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          <input className="input" placeholder="Description (optionnel)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <label className="ff-form-checkbox">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
            Activé pour tous dès la création
          </label>
          <div className="ff-form-actions">
            <span className="btn-outline" onClick={() => setCreating(false)}>Annuler</span>
            <button className="btn" type="submit" disabled={busy}>Créer</button>
          </div>
        </form>
      )}
    </Panel>
  );
}
