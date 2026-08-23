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
// Sous-domaines : restreignent une sous-fonctionnalité précise (ex. le tiers
// prod du coffre-fort, ou la capacité de modifier la matrice de permissions
// elle-même) indépendamment du reste du domaine parent. Tant qu'un groupe ne
// leur donne pas de valeur explicite ici, ils affichent le niveau hérité du
// domaine parent (voir badge "hérité" dans le tableau).
const SUBDOMAIN_LABELS = {
  'vault-prod': 'Coffre-fort — prod',
  'users-permissions': 'Utilisateurs — matrice de droits'
};
const LEVEL_LABELS = { none: 'Aucun', read: 'Lecture', write: 'Écriture', admin: 'Admin' };
const LEVEL_TONE = { none: 'mut', read: 'ok', write: 'warn', admin: 'crit' };
const INHERIT_VALUE = '__inherit__';

export default function GroupsPanel() {
  const { data, reload } = useApi(() => api.get('/groups'), []);
  const users = useApi(() => api.get('/users'), []);
  const notify = useNotify();
  const [form, setForm] = useState({ name: '', description: '', preset: '' });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [overrideUserId, setOverrideUserId] = useState('');
  const [overrideDrafts, setOverrideDrafts] = useState({});

  const domains = data?.domains || [];
  const levels = data?.levels || [];
  const presets = data?.presets || {};
  const subdomains = data?.subdomains || {};
  const subdomainKeys = Object.keys(subdomains);

  async function createGroup(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { name, description, preset } = form;
      await api.post('/groups', { name, description, preset: preset || undefined });
      notify(`Groupe ${form.name} créé${preset ? ` (préréglage « ${presets[preset]?.label} »)` : ''}`, { type: 'ok' });
      setForm({ name: '', description: '', preset: '' });
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

  // Sélectionner "Hérité" enlève l'override explicite du sous-domaine (il
  // retombe sur le niveau du domaine parent) ; toute autre valeur l'isole.
  async function setSubPermission(group, subDomain, level) {
    const next = { ...(group.subPermissions || {}) };
    if (level === INHERIT_VALUE) delete next[subDomain];
    else next[subDomain] = level;
    await api.put(`/groups/${group.id}`, { subPermissions: next });
    reload();
  }

  async function loadOverrides(userId) {
    setOverrideUserId(userId);
    if (!userId) return;
    const res = await api.get(`/groups/user-overrides/${userId}`);
    setOverrideDrafts(res.overrides || {});
  }

  async function saveOverrides() {
    if (!overrideUserId) return;
    try {
      const res = await api.put(`/groups/user-overrides/${overrideUserId}`, { overrides: overrideDrafts });
      setOverrideDrafts(res.overrides || {});
      notify('Permissions individuelles mises à jour', { type: 'ok' });
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
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
          accès complet implicite à tous les domaines, quels que soient leurs groupes. Les sous-domaines (ci-dessous) permettent
          d'isoler une sous-fonctionnalité précise (ex. le coffre-fort prod) d'un niveau différent du reste du domaine ; tant
          qu'ils ne sont pas isolés explicitement, ils héritent du niveau du domaine parent — aucun groupe existant n'a donc changé
          de comportement avec l'ajout de cette fonctionnalité. Les permissions individuelles (tout en bas) s'ajoutent à celles des
          groupes pour un utilisateur précis, sans jamais les retirer.
        </DemoNote>
      </div>
      <Panel title="Créer un groupe" span={4}>
        <form onSubmit={createGroup} className="groups-form-body">
          <Field label="Nom"><input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Description"><input className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
          <Field label="Préréglage (optionnel)">
            <select className="input" value={form.preset} onChange={(e) => setForm((f) => ({ ...f, preset: e.target.value }))}>
              <option value="">— Matrice vide (à personnaliser après création) —</option>
              {Object.entries(presets).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
            </select>
            {form.preset && presets[form.preset] && <div className="faint groups-preset-desc">{presets[form.preset].description}</div>}
          </Field>
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

      {subdomainKeys.length > 0 && (
        <Panel title="Sous-domaines" sub="Restreint une sous-fonctionnalité précise indépendamment du domaine parent" span={12}>
          <DataTable
            columns={['Groupe', ...subdomainKeys.map((d) => `${SUBDOMAIN_LABELS[d] || d} (hérite de « ${DOMAIN_LABELS[subdomains[d]]} »)`)]}
            rows={data?.items}
            emptyTitle="Aucun groupe créé"
            renderRow={(g) => (
              <tr key={g.id}>
                <td><div className="groups-cell-name">{g.name}</div></td>
                {subdomainKeys.map((sub) => {
                  const explicit = g.subPermissions?.[sub];
                  const inheritedLevel = g.permissions?.[subdomains[sub]] || 'none';
                  return (
                    <td key={sub}>
                      <select
                        className="input groups-permission-select"
                        value={explicit !== undefined ? explicit : INHERIT_VALUE}
                        onChange={(e) => setSubPermission(g, sub, e.target.value)}
                      >
                        <option value={INHERIT_VALUE}>Hérité ({LEVEL_LABELS[inheritedLevel]})</option>
                        {levels.map((lvl) => <option key={lvl} value={lvl}>{LEVEL_LABELS[lvl]}</option>)}
                      </select>
                    </td>
                  );
                })}
              </tr>
            )}
          />
        </Panel>
      )}

      <Panel title="Permissions individuelles" sub="S'ajoutent aux permissions des groupes de l'utilisateur, sans jamais les retirer" span={12}>
        <div className="groups-form-body">
          <Field label="Utilisateur">
            <select className="input" value={overrideUserId} onChange={(e) => loadOverrides(e.target.value)}>
              <option value="">— Choisir un utilisateur —</option>
              {users.data?.items.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select>
          </Field>
          {overrideUserId && (
            <>
              <div className="groups-overrides-grid">
                {[...domains, ...subdomainKeys].map((domain) => (
                  <div key={domain} className="groups-override-row">
                    <span className="faint groups-override-label">{DOMAIN_LABELS[domain] || SUBDOMAIN_LABELS[domain] || domain}</span>
                    <select
                      className="input groups-permission-select"
                      value={overrideDrafts[domain] || 'none'}
                      onChange={(e) => setOverrideDrafts((prev) => ({ ...prev, [domain]: e.target.value }))}
                    >
                      {levels.map((lvl) => <option key={lvl} value={lvl}>{LEVEL_LABELS[lvl]}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <button className="btn groups-submit-btn" type="button" onClick={saveOverrides}>Enregistrer les permissions individuelles</button>
            </>
          )}
        </div>
      </Panel>

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
