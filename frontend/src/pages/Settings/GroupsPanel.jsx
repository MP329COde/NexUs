import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

const DOMAIN_LABELS = { infrastructure: 'Infrastructure', network: 'Réseaux', security: 'Sécurité', automation: 'Automatisation' };
const LEVEL_LABELS = { none: 'Aucun', read: 'Lecture', write: 'Écriture', admin: 'Admin' };
const LEVEL_TONE = { none: 'mut', read: 'ok', write: 'warn', admin: 'crit' };

export default function GroupsPanel() {
  const { data, reload } = useApi(() => api.get('/groups'), []);
  const users = useApi(() => api.get('/users'), []);
  const notify = useNotify();
  const [form, setForm] = useState({ name: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);

  const domains = data?.domains || [];
  const levels = data?.levels || [];

  async function createGroup(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/groups', form);
      notify(`Groupe ${form.name} créé`, { type: 'ok' });
      setForm({ name: '', description: '' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function setPermission(group, domain, level) {
    await api.put(`/groups/${group.id}`, { permissions: { ...group.permissions, [domain]: level } });
    reload();
  }

  async function toggleMember(group, userId) {
    const memberIds = group.memberIds.includes(userId)
      ? group.memberIds.filter((id) => id !== userId)
      : [...group.memberIds, userId];
    await api.put(`/groups/${group.id}`, { memberIds });
    reload();
  }

  async function removeGroup(group) {
    if (!confirm(`Supprimer le groupe ${group.name} ?`)) return;
    await api.del(`/groups/${group.id}`);
    notify('Groupe supprimé', { type: 'info' });
    reload();
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
      <Panel title="Créer un groupe" span={4}>
        <form onSubmit={createGroup} style={{ padding: 16 }}>
          <Field label="Nom"><input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Description"><input className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
          <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Création…' : 'Créer le groupe'}</button>
        </form>
      </Panel>

      <Panel title="Matrice des droits" sub="Par groupe et par domaine fonctionnel" span={8}>
        <DataTable
          columns={['Groupe', 'Membres', ...domains.map((d) => DOMAIN_LABELS[d]), '']}
          rows={data?.items}
          emptyTitle="Aucun groupe créé"
          renderRow={(g) => (
            <tr key={g.id}>
              <td>
                <div style={{ fontWeight: 500 }}>{g.name}</div>
                {g.description && <div className="faint" style={{ fontSize: 11.5 }}>{g.description}</div>}
              </td>
              <td>
                <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11.5 }} onClick={() => setEditing(editing === g.id ? null : g.id)}>
                  {g.memberIds.length} membre{g.memberIds.length > 1 ? 's' : ''}
                </span>
              </td>
              {domains.map((domain) => (
                <td key={domain}>
                  <select
                    className="input"
                    style={{ height: 26, padding: '0 6px', fontSize: 11.5, width: 'auto' }}
                    value={g.permissions[domain] || 'none'}
                    onChange={(e) => setPermission(g, domain, e.target.value)}
                  >
                    {levels.map((lvl) => <option key={lvl} value={lvl}>{LEVEL_LABELS[lvl]}</option>)}
                  </select>
                </td>
              ))}
              <td>
                <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, color: 'var(--tone-crit-fg)' }} onClick={() => removeGroup(g)}>
                  <Icon name="trash" size={13} />
                </span>
              </td>
            </tr>
          )}
        />
      </Panel>

      {editing && (
        <Panel title={`Membres — ${data.items.find((g) => g.id === editing)?.name}`} span={12}>
          <div style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {users.data?.items.map((u) => {
              const group = data.items.find((g) => g.id === editing);
              const active = group?.memberIds.includes(u.id);
              return (
                <span
                  key={u.id}
                  className={active ? 'btn' : 'btn-outline'}
                  style={{ height: 30, padding: '0 12px', fontSize: 12.5 }}
                  onClick={() => toggleMember(group, u.id)}
                >
                  {u.name}
                </span>
              );
            })}
          </div>
        </Panel>
      )}

      <Panel title="Niveaux de droits" span={12}>
        <div style={{ padding: '10px 16px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {levels.map((lvl) => (
            <span key={lvl} className={`badge badge-${LEVEL_TONE[lvl]}`}><span className="dot" />{LEVEL_LABELS[lvl]}</span>
          ))}
        </div>
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
