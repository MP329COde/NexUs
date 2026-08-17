import { Fragment, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';
import './UsersPanel.css';

const TIER_LABEL = { developer: 'Developer', maintainer: 'Maintainer' };

export default function UsersPanel() {
  const { user: me } = useAuth();
  const notify = useNotify();
  const { data, reload } = useApi(() => api.get('/users'), []);
  const requests = useApi(() => api.get('/terminal/access-requests'), []);
  const groups = useApi(() => api.get('/groups'), []);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'user', skipOnboarding: false, groupIds: [], validFrom: '', validUntil: '' });
  const [busy, setBusy] = useState(false);
  // Édition des rôles d'un utilisateur EXISTANT (distincte du formulaire de
  // création) : editingUserId ouvre une ligne d'édition, editGroupIds est le
  // brouillon coché/décoché avant "Enregistrer" — permet d'ajouter un rôle de
  // plus à un compte qui en a déjà, sans repartir de zéro.
  const [editingUserId, setEditingUserId] = useState(null);
  const [editGroupIds, setEditGroupIds] = useState([]);
  const [editBusy, setEditBusy] = useState(false);

  async function decide(req, approve) {
    try {
      await api.post(`/terminal/access-requests/${req.id}/decide`, { approve });
      notify(approve ? `Accès ${TIER_LABEL[req.requestedTier]} accordé à ${req.userName}` : 'Demande refusée', { type: approve ? 'ok' : 'info' });
      requests.reload();
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function invite(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/users', {
        ...form,
        validFrom: form.validFrom || null,
        validUntil: form.validUntil || null
      });
      notify(`Compte créé pour ${form.email}`, { type: 'ok' });
      setForm({ email: '', name: '', password: '', role: 'user', skipOnboarding: false, groupIds: [], validFrom: '', validUntil: '' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  function toggleFormGroup(groupId) {
    setForm((f) => ({
      ...f,
      groupIds: f.groupIds.includes(groupId) ? f.groupIds.filter((id) => id !== groupId) : [...f.groupIds, groupId]
    }));
  }

  // "expiré" / "à venir" à partir de validFrom/validUntil (comptes temporaires,
  // voir usersStore.validityWindowError côté backend — même règle, en lecture
  // seule ici pour l'affichage).
  function validityBadge(u) {
    const now = Date.now();
    if (u.validUntil && new Date(u.validUntil).getTime() < now) return { label: 'Expiré', tone: 'crit' };
    if (u.validFrom && new Date(u.validFrom).getTime() > now) return { label: 'À venir', tone: 'mut' };
    return null;
  }

  async function toggleRole(u) {
    try {
      await api.put(`/users/${u.id}`, { role: u.role === 'admin' ? 'user' : 'admin' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function toggleActive(u) {
    try {
      await api.put(`/users/${u.id}`, { active: !u.active });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function setTier(u, tier) {
    try {
      await api.put(`/users/${u.id}/terminal-tier`, { tier: tier || null });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  function openRoleEditor(u) {
    setEditingUserId(u.id);
    setEditGroupIds(u.groupIds || []);
  }

  function toggleEditGroup(groupId) {
    setEditGroupIds((ids) => (ids.includes(groupId) ? ids.filter((id) => id !== groupId) : [...ids, groupId]));
  }

  async function saveRoles(u) {
    setEditBusy(true);
    try {
      await api.put(`/users/${u.id}/groups`, { groupIds: editGroupIds });
      notify('Rôles mis à jour', { type: 'ok' });
      setEditingUserId(null);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setEditBusy(false);
    }
  }

  async function remove(u) {
    if (!confirm(`Supprimer le compte ${u.email} ?`)) return;
    try {
      await api.del(`/users/${u.id}`);
      notify('Utilisateur supprimé', { type: 'info' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  const pendingRequests = requests.data?.items || [];

  return (
    <div className="users-grid">
      {pendingRequests.length > 0 && (
        <Panel title="Demandes d'accès terminal" sub="En attente d'approbation" span={12}>
          <div className="users-requests-list">
            {pendingRequests.map((r) => (
              <div key={r.id} className="users-request-row">
                <Icon name="terminal" size={14} className="users-request-icon" />
                <div className="users-request-info">
                  <div className="users-request-text"><strong>{r.userName}</strong> ({r.userEmail}) demande le palier <strong>{TIER_LABEL[r.requestedTier]}</strong></div>
                  {r.reason && <div className="faint users-request-reason">{r.reason}</div>}
                  <div className="mono faint users-request-date">{new Date(r.createdAt).toLocaleString('fr-FR')}</div>
                </div>
                <span className="btn-outline users-action-btn" onClick={() => decide(r, true)}><Icon name="check" size={13} />Approuver</span>
                <span className="btn-outline users-action-btn users-action-btn-danger" onClick={() => decide(r, false)}><Icon name="xCircle" size={13} />Refuser</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Utilisateurs de la console" sub="Les administrateurs accèdent aux intégrations ; les autres comptes ne voient que la console et leurs propres réglages" span={8}>
        <DataTable
          columns={['Utilisateur', 'Rôle', 'Rôles / permissions', 'Terminal', 'Statut', 'Actions']}
          rows={data?.items}
          emptyTitle="Aucun utilisateur"
          renderRow={(u) => (
            <Fragment key={u.id}>
              <tr>
                <td>
                  <div className="users-cell-name">{u.name}</div>
                  <div className="faint users-cell-email">{u.email}</div>
                </td>
                <td><span className={`badge badge-${u.role === 'admin' ? 'vio' : 'mut'}`}><span className="dot" />{u.role === 'admin' ? 'Administrateur' : 'Utilisateur'}</span></td>
                <td>
                  {u.role === 'admin' ? (
                    <span className="faint users-role-note">Accès complet (admin)</span>
                  ) : (
                    <span
                      className="btn-outline users-action-btn"
                      onClick={() => (editingUserId === u.id ? setEditingUserId(null) : openRoleEditor(u))}
                    >
                      <Icon name="shield" size={13} />
                      {u.groupIds?.length ? `${u.groupIds.length} rôle${u.groupIds.length > 1 ? 's' : ''}` : 'Aucun rôle'}
                    </span>
                  )}
                </td>
                <td>
                  {u.role === 'admin' ? (
                    <span className="faint users-role-note">Admin (complet)</span>
                  ) : (
                    <select className="input users-tier-select" value={u.terminalTier || ''} onChange={(e) => setTier(u, e.target.value)}>
                      <option value="">Aucun accès</option>
                      <option value="developer">Developer</option>
                      <option value="maintainer">Maintainer</option>
                      <option value="admin">Admin (complet)</option>
                    </select>
                  )}
                </td>
                <td>
                  <span className={`badge badge-${u.active ? 'ok' : 'mut'}`}><span className="dot" />{u.active ? 'Actif' : 'Désactivé'}</span>
                  {validityBadge(u) && (
                    <span className={`badge badge-${validityBadge(u).tone} users-validity-badge`}>
                      <span className="dot" />{validityBadge(u).label}
                    </span>
                  )}
                </td>
                <td>
                  <div className="users-row-actions">
                    <span className="btn-outline users-action-btn" onClick={() => toggleRole(u)}><Icon name="shield" size={13} />{u.role === 'admin' ? 'Rétrograder' : 'Promouvoir'}</span>
                    <span className="btn-outline users-action-btn" onClick={() => toggleActive(u)}>{u.active ? 'Désactiver' : 'Activer'}</span>
                    {u.id !== me?.id && <span className="btn-outline users-action-btn users-action-btn-danger" onClick={() => remove(u)}><Icon name="trash" size={13} />Suppr.</span>}
                  </div>
                </td>
              </tr>
              {editingUserId === u.id && (
                <tr>
                  <td colSpan={6} className="users-edit-cell">
                    <div className="users-edit-body">
                      <div className="faint users-edit-hint">
                        Coche les rôles à ajouter, décoche ceux à retirer — les rôles déjà accordés restent inchangés tant qu'ils sont cochés.
                      </div>
                      {(groups.data?.items?.length ?? 0) === 0 && <div className="faint users-edit-empty">Aucun rôle/groupe n'existe encore — crée-en dans l'onglet « Groupes &amp; permissions ».</div>}
                      <div className="users-edit-groups">
                        {groups.data?.items?.map((g) => (
                          <label key={g.id} className="users-edit-group-label">
                            <input type="checkbox" checked={editGroupIds.includes(g.id)} onChange={() => toggleEditGroup(g.id)} />
                            {g.name}
                          </label>
                        ))}
                      </div>
                      <div className="users-edit-actions">
                        <span className={`btn users-action-btn${editBusy ? ' users-edit-save-btn-busy' : ''}`} onClick={() => saveRoles(u)}>
                          {editBusy ? 'Enregistrement…' : 'Enregistrer'}
                        </span>
                        <span className="btn-outline users-action-btn" onClick={() => setEditingUserId(null)}>Annuler</span>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          )}
        />
      </Panel>

      <Panel title="Créer un utilisateur" span={4}>
        <form onSubmit={invite} className="users-create-form">
          {/* autoComplete="off" + name unique par champ : sans ça, le
              navigateur propose/pré-remplit ce formulaire "Créer un
              utilisateur" avec les identifiants ENREGISTRÉS DE L'ADMIN
              CONNECTÉ (déjà en session sur ce domaine) — un admin distrait
              pouvait créer un compte avec sa propre adresse/mot de passe
              sans s'en rendre compte. Trouvé en testant réellement ce
              formulaire. Même convention que IntegrationPanel.jsx. */}
          <Field label="E-mail"><input className="input" type="email" name="new-user-email" autoComplete="off" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Nom"><input className="input" name="new-user-name" autoComplete="off" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Mot de passe initial"><input className="input" type="password" name="new-user-password" autoComplete="new-password" required minLength={8} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></Field>
          <Field label="Type de compte" hint="Rôle technique binaire — un administrateur a toujours accès complet, quels que soient les rôles/permissions ci-dessous">
            <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="user">Utilisateur</option>
              <option value="admin">Administrateur</option>
            </select>
          </Field>
          {form.role === 'user' && groups.data?.items?.length > 0 && (
            <Field label="Rôles / permissions" hint="Composables : un compte peut cumuler plusieurs rôles (ex. « Développeur » + « Monitoring »)">
              <div className="users-group-picker">
                {groups.data.items.map((g) => (
                  <label key={g.id} className="users-group-checkbox-label">
                    <input type="checkbox" checked={form.groupIds.includes(g.id)} onChange={() => toggleFormGroup(g.id)} />
                    {g.name}
                  </label>
                ))}
              </div>
            </Field>
          )}
          <Field label="Valide à partir de" hint="Optionnel — laisser vide pour un accès immédiat">
            <input className="input" type="datetime-local" value={form.validFrom} onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))} />
          </Field>
          <Field label="Valide jusqu'à" hint="Optionnel — compte temporaire, connexion refusée après cette date">
            <input className="input" type="datetime-local" value={form.validUntil} onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))} />
          </Field>
          <label className="users-skip-onboarding-label">
            <input type="checkbox" checked={form.skipOnboarding} onChange={(e) => setForm((f) => ({ ...f, skipOnboarding: e.target.checked }))} />
            Compte déjà configuré (pas d'écran de première connexion)
          </label>
          <button className="btn users-submit-btn" type="submit" disabled={busy}>{busy ? 'Création…' : 'Créer le compte'}</button>
        </form>
      </Panel>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="users-field">
      <label className="users-field-label">{label}</label>
      {children}
    </div>
  );
}
