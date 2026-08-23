import { useEffect, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import { api } from '../../lib/apiClient.js';
import { useApi } from '../../hooks/useApi.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './PlatformPanel.css';

const EMPTY_FORM = { id: null, name: '', apiServer: '', namespace: 'default', token: '', insecureSkipTlsVerify: false, dashboardUrl: '' };

// Multi-cluster Kubernetes (Lot C4 — Groupe C) : remplace l'ancienne
// intégration "kubernetes" à config unique par une liste de clusters nommés.
// Chaque cluster garde le même schéma de champs qu'avant ce lot (URL serveur
// API, namespace par défaut, token ServiceAccount, TLS, tableau de bord) —
// voir backend/src/store/settingsStore.js pour le stockage (`k8sClusters`,
// chiffré au repos comme les autres secrets) et la migration automatique
// d'une éventuelle config unique préexistante.
//
// Interprétation retenue pour "relier les clusters entre eux" (demande
// initiale) : les représenter comme plusieurs infrastructures distinctes
// dans la même vue topologique (voir /network, chaque cluster devient un
// sous-graphe séparé), PAS une fédération technique Kubernetes réelle
// (type kubefed) — hors de portée de ce lot, voir todo.md.
export default function K8sClustersPanel() {
  const { data, error, reload } = useApi(() => api.get('/kubernetes/clusters'), []);
  const notify = useNotify();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!editing) setForm(EMPTY_FORM); }, [editing]);

  function startEdit(cluster) {
    setForm({
      id: cluster.id, name: cluster.name, apiServer: cluster.apiServer,
      namespace: cluster.namespace || 'default', token: '',
      insecureSkipTlsVerify: Boolean(cluster.insecureSkipTlsVerify),
      dashboardUrl: cluster.dashboardUrl || ''
    });
    setEditing(true);
  }

  function set(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (form.id) await api.put(`/kubernetes/clusters/${form.id}`, form);
      else await api.post('/kubernetes/clusters', form);
      notify(`Cluster « ${form.name} » enregistré`, { type: 'ok' });
      setEditing(false);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit', title: 'Échec de l\'enregistrement' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(cluster) {
    if (!window.confirm(`Supprimer le cluster « ${cluster.name} » ? Cette action ne supprime rien sur le cluster lui-même, seulement sa déclaration dans NexUs.`)) return;
    try {
      await api.del(`/kubernetes/clusters/${cluster.id}`);
      notify(`Cluster « ${cluster.name} » supprimé`, { type: 'ok' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function setDefault(cluster) {
    try {
      await api.post(`/kubernetes/clusters/${cluster.id}/default`, {});
      notify(`« ${cluster.name} » est maintenant le cluster par défaut`, { type: 'ok' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  if (error) return <Panel title="Kubernetes — Clusters" span={12}><div className="platform-error">Impossible de charger les clusters : {error.message}</div></Panel>;
  if (!data) return null;

  const clusters = data.items || [];

  return (
    <Panel
      title="Kubernetes — Clusters"
      sub="Un ou plusieurs clusters K3s/K8s. Le cluster « par défaut » est utilisé par tout appel qui ne précise pas de cluster explicitement."
      span={12}
    >
      {clusters.length === 0 && !editing && (
        <div className="faint" style={{ marginBottom: 12 }}>Aucun cluster déclaré pour le moment.</div>
      )}

      {clusters.length > 0 && (
        <table className="platform-table" style={{ marginBottom: 16 }}>
          <thead>
            <tr><th>Nom</th><th>Serveur API</th><th>Namespace</th><th>Par défaut</th><th /></tr>
          </thead>
          <tbody>
            {clusters.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="mono faint">{c.apiServer}</td>
                <td className="mono">{c.namespace}</td>
                <td>{c.isDefault ? <span className="badge badge-ok"><span className="dot" />défaut</span> : (
                  <span className="btn-outline k8s-action-btn" onClick={() => setDefault(c)}>Définir par défaut</span>
                )}</td>
                <td>
                  <span className="btn-outline k8s-action-btn" onClick={() => startEdit(c)}>Modifier</span>{' '}
                  <span className="btn-outline k8s-action-btn k8s-action-btn-danger" onClick={() => remove(c)}>Supprimer</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!editing && <span className="btn-primary" onClick={() => setEditing(true)}>+ Ajouter un cluster</span>}

      {editing && (
        <form onSubmit={save} className="platform-form">
          <div className="platform-fields-grid">
            <Field label="Nom">
              <input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="prod, staging, edge-lab..." />
            </Field>
            <Field label="URL du serveur API">
              <input className="input" required value={form.apiServer} onChange={(e) => set('apiServer', e.target.value)} placeholder="https://10.0.0.10:6443" />
            </Field>
            <Field label="Namespace par défaut">
              <input className="input" value={form.namespace} onChange={(e) => set('namespace', e.target.value)} placeholder="default" />
            </Field>
            <Field label="Token du ServiceAccount" hint={form.id ? 'Laissez vide pour conserver le token déjà enregistré.' : ''}>
              <input className="input" type="password" value={form.token} onChange={(e) => set('token', e.target.value)} />
            </Field>
            <Field label="URL du tableau de bord (optionnel)">
              <input className="input" value={form.dashboardUrl} onChange={(e) => set('dashboardUrl', e.target.value)} placeholder="https://k8s-dashboard.example.com" />
            </Field>
            <label className="platform-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.insecureSkipTlsVerify} onChange={(e) => set('insecureSkipTlsVerify', e.target.checked)} />
              <span className="platform-field-label" style={{ margin: 0 }}>Ignorer la vérification TLS (labo uniquement)</span>
            </label>
          </div>
          <div className="platform-actions">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : (form.id ? 'Enregistrer' : 'Ajouter le cluster')}</button>
            <span className="btn-outline" onClick={() => setEditing(false)}>Annuler</span>
          </div>
        </form>
      )}
    </Panel>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="platform-field">
      <span className="platform-field-label">{label}</span>
      {children}
      {hint && <span className="faint platform-field-hint">{hint}</span>}
    </label>
  );
}
