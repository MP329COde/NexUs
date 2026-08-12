import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

const CATEGORY_LABELS = { serveur: 'Serveur', stockage: 'Stockage', réseau: 'Réseau', poste: 'Poste', autre: 'Autre' };
const STATE_LABELS = { en_service: 'En service', en_maintenance: 'En maintenance', hors_service: 'Hors service', stock: 'En stock' };

const EMPTY_FORM = { name: '', category: 'serveur', serialNumber: '', acquiredAt: '', warrantyUntil: '', estimatedValue: '', state: 'en_service' };

export default function InventoryPanel() {
  const { data, reload } = useApi(() => api.get('/inventory'), []);
  const notify = useNotify();
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const items = data?.items || [];
  const now = new Date();
  const warrantyExpiringSoon = items.filter((a) => a.warrantyUntil && new Date(a.warrantyUntil) > now && new Date(a.warrantyUntil) < new Date(now.getTime() + 365 * 86400000)).length;
  const totalValue = items.reduce((sum, a) => sum + (a.estimatedValue || 0), 0);

  async function createAsset(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/inventory', form);
      notify(`Actif ${form.name} ajouté`, { type: 'ok' });
      setForm(EMPTY_FORM);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function setState(asset, state) {
    await api.put(`/inventory/${asset.id}`, { state });
    reload();
  }

  async function removeAsset(asset) {
    if (!confirm(`Supprimer l'actif ${asset.name} ?`)) return;
    await api.del(`/inventory/${asset.id}`);
    notify('Actif supprimé', { type: 'info' });
    reload();
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
      <div style={{ gridColumn: 'span 12', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14 }}>
        <KpiMini label="Actifs" value={items.length} />
        <KpiMini label="Garantie < 1 an" value={warrantyExpiringSoon} tone="warn" />
        <KpiMini label="Valeur estimée" value={`${totalValue.toLocaleString('fr-FR')} €`} />
      </div>

      <Panel title="Ajouter un actif" span={4}>
        <form onSubmit={createAsset} style={{ padding: 16 }}>
          <Field label="Nom"><input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Catégorie">
            <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Numéro de série"><input className="input" value={form.serialNumber} onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))} /></Field>
          <Field label="Acquis le"><input className="input" type="date" value={form.acquiredAt} onChange={(e) => setForm((f) => ({ ...f, acquiredAt: e.target.value }))} /></Field>
          <Field label="Garantie jusqu'au"><input className="input" type="date" value={form.warrantyUntil} onChange={(e) => setForm((f) => ({ ...f, warrantyUntil: e.target.value }))} /></Field>
          <Field label="Valeur estimée (€)"><input className="input" type="number" min="0" value={form.estimatedValue} onChange={(e) => setForm((f) => ({ ...f, estimatedValue: e.target.value }))} /></Field>
          <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Ajout…' : "Ajouter l'actif"}</button>
        </form>
      </Panel>

      <Panel title="Actifs matériels" sub="Serveurs, réseau et stockage" span={8}>
        <DataTable
          columns={['Actif', 'Catégorie', 'N° série', 'Garantie', 'État', '']}
          rows={items}
          emptyTitle="Aucun actif suivi"
          renderRow={(a) => (
            <tr key={a.id}>
              <td style={{ fontWeight: 500 }}>{a.name}</td>
              <td className="muted">{CATEGORY_LABELS[a.category]}</td>
              <td className="mono faint">{a.serialNumber || '—'}</td>
              <td className="mono faint">{a.warrantyUntil ? new Date(a.warrantyUntil).toLocaleDateString('fr-FR') : '—'}</td>
              <td>
                <select
                  className="input"
                  style={{ height: 26, padding: '0 6px', fontSize: 11.5, width: 'auto' }}
                  value={a.state}
                  onChange={(e) => setState(a, e.target.value)}
                >
                  {Object.entries(STATE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </td>
              <td>
                <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, color: 'var(--tone-crit-fg)' }} onClick={() => removeAsset(a)}>
                  <Icon name="trash" size={13} />
                </span>
              </td>
            </tr>
          )}
        />
      </Panel>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 5, color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  );
}

function KpiMini({ label, value, tone }) {
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div className="faint" style={{ fontSize: 11 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, color: tone ? `var(--tone-${tone}-fg)` : 'inherit' }}>{value}</div>
    </div>
  );
}
