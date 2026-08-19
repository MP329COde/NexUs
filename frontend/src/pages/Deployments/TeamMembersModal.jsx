import { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';
import './OrgMembersModal.css';

const ROLE_LABELS = { lead: 'Lead', member: 'Membre' };

// Membres d'une équipe : les candidats à ajouter sont les membres de
// l'organisation pas encore dans l'équipe (une équipe est un sous-ensemble
// de l'organisation, cf. teams.routes.js) — pas la liste complète des
// comptes de la plateforme, contrairement à OrgMembersModal (une
// organisation, elle, n'a pas de "réservoir" de membres plus large).
export default function TeamMembersModal({ team, onClose }) {
  const { user } = useAuth();
  const notify = useNotify();
  const { data, reload } = useApi(() => api.get(`/teams/${team.id}`), [team.id]);
  const orgMembers = useApi(() => api.get(`/organizations/${team.org_id}/members`), [team.org_id]);
  const allUsers = useApi(() => (user?.role === 'admin' ? api.get('/users') : Promise.resolve(null)), [user?.role]);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);

  const members = data?.members || [];
  const canManage = data?.role === 'lead';
  const memberIds = new Set(members.map((m) => m.user_id));
  const candidates = (orgMembers.data?.items || []).filter((m) => !memberIds.has(m.user_id));

  function userName(uid) {
    return (allUsers.data?.items || []).find((u) => u.id === uid)?.name || uid;
  }

  async function addMember(e) {
    e.preventDefault();
    if (!adding) return;
    setBusy(true);
    try {
      await api.put(`/teams/${team.id}/members/${adding}`, { role: 'member' });
      notify('Membre ajouté à l\'équipe', { type: 'ok' });
      setAdding('');
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function setRole(userId, role) {
    try {
      await api.put(`/teams/${team.id}/members/${userId}`, { role });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function removeMember(userId) {
    if (!confirm('Retirer ce membre de l\'équipe ?')) return;
    try {
      await api.del(`/teams/${team.id}/members/${userId}`);
      notify('Membre retiré', { type: 'info' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <Modal title={`Membres — ${team.name}`} onClose={onClose} width={460}>
      <Link to={`/deployments/organizations/${team.org_id}/wiki?teamId=${team.id}`} className="btn-outline" style={{ marginBottom: 12, display: 'inline-flex' }}>
        <Icon name="book" size={13} /> Documentation d'équipe
      </Link>
      <div className="omm-list">
        {members.length === 0 ? (
          <div className="faint">Aucun membre</div>
        ) : members.map((m) => (
          <div key={m.user_id} className="omm-row">
            <span className="omm-name">{userName(m.user_id)}</span>
            {canManage ? (
              <select className="input omm-role-select" value={m.role} onChange={(e) => setRole(m.user_id, e.target.value)}>
                {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : (
              <span className="faint">{ROLE_LABELS[m.role]}</span>
            )}
            {canManage && (
              <span className="btn-outline omm-remove-btn" onClick={() => removeMember(m.user_id)}>
                <Icon name="trash" size={12} />
              </span>
            )}
          </div>
        ))}
      </div>

      {canManage && (
        <form onSubmit={addMember} className="omm-add-row">
          <select className="input omm-add-select" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Ajouter un membre…</option>
            {candidates.map((m) => <option key={m.user_id} value={m.user_id}>{userName(m.user_id)}</option>)}
          </select>
          <button className="btn" type="submit" disabled={busy || !adding}>Ajouter</button>
        </form>
      )}
    </Modal>
  );
}
