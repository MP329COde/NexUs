import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import DemoNote from '../../components/ui/DemoNote.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './GroupsPanel.css';

const DOMAIN_LABELS = {
  infrastructure: 'Infrastructure', network: 'Réseaux', security: 'Sécurité', automation: 'Automatisation',
  monitoring: 'Monitoring', terminal: 'Terminal', identity: 'Connexion & identité', users: 'Utilisateurs',
  settings: 'Paramètres', inventory: 'Inventaire', vault: 'Coffre-fort', kubernetes: 'Kubernetes',
  hosts: 'Hôtes', backups: 'Sauvegardes', audit: 'Journal d\'audit', proxmox: 'Proxmox', plugins: 'Plugins'
};
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
    <div className="groups-grid">
      <div className="groups-note-col">
        <DemoNote>
          Les groupes ci-dessous sont de vrais rôles composables : un compte peut appartenir à plusieurs groupes à la fois, et
          reçoit l'union de leurs permissions (ex. « Développeur » + « Monitoring » donne accès aux deux, sans donner accès au Terminal
          si aucun des deux groupes ne l'accorde). Ces niveaux sont appliqués directement par les routes Paramètres, Connexion &amp; identité,
          Utilisateurs, Inventaire, Terminal, Coffre-fort, Kubernetes et Sécurité. Les comptes administrateur de plateforme gardent un
          accès complet implicite à tous les domaines, quels que soient leurs groupes.
        </DemoNote>
      </div>
      <Panel title="Créer un groupe" span={4}>
        <form onSubmit={createGroup} className="groups-form-body">
          <Field label="Nom"><input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Description"><input className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
          <button className="btn groups-submit-btn" type="submit" disabled={busy}>{busy ? 'Création…' : 'Créer le groupe'}</button>
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
                <div className="groups-cell-name">{g.name}</div>
                {g.description && <div className="faint groups-cell-desc">{g.description}</div>}
              </td>
              <td>
                <span className="btn-outline groups-members-btn" onClick={() => setEditing(editing === g.id ? null : g.id)}>
                  {g.memberIds.length} membre{g.memberIds.length > 1 ? 's' : ''}
                </span>
              </td>
              {domains.map((domain) => (
                <td key={domain}>
                  <select
                    className="input groups-permission-select"
                    value={g.permissions[domain] || 'none'}
                    onChange={(e) => setPermission(g, domain, e.target.value)}
                  >
                    {levels.map((lvl) => <option key={lvl} value={lvl}>{LEVEL_LABELS[lvl]}</option>)}
                  </select>
                </td>
              ))}
              <td>
                <span className="btn-outline groups-remove-btn" onClick={() => removeGroup(g)}>
                  <Icon name="trash" size={13} />
                </span>
              </td>
            </tr>
          )}
        />
      </Panel>

      {editing && (
        <Panel title={`Membres — ${data.items.find((g) => g.id === editing)?.name}`} span={12}>
          <div className="groups-members-body">
            {users.data?.items.map((u) => {
              const group = data.items.find((g) => g.id === editing);
              const active = group?.memberIds.includes(u.id);
              return (
                <span
                  key={u.id}
                  className={`${active ? 'btn' : 'btn-outline'} groups-member-chip`}
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
        <div className="groups-levels-body">
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
    <div className="groups-field">
      <label className="groups-field-label">{label}</label>
      {children}
    </div>
  );
}
