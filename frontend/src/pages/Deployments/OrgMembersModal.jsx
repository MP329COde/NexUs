import { useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './OrgMembersModal.css';

const ROLE_LABELS = { owner: 'Propriétaire', admin: 'Admin', member: 'Membre' };

// Membres d'une organisation (distinct des membres d'un projet) : jusqu'ici
// une organisation ne pouvait avoir que son créateur, sans aucun moyen d'y
// ajouter un collègue — voir routes/organizations.routes.js pour le
// commentaire côté backend. Le sélecteur "Ajouter un membre" réutilise la
// liste complète des comptes (GET /users, admin uniquement) — même
// convention que ProjectsPage.jsx pour choisir les membres d'un projet.
export default function OrgMembersModal({ org, currentUserId, canManageUsers, onClose }) {
  const { data, reload } = useApi(() => api.get(`/organizations/${org.id}/members`), [org.id]);
  const allUsers = useApi(() => (canManageUsers ? api.get('/users') : Promise.resolve(null)), [canManageUsers]);
  const notify = useNotify();
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);

  const members = data?.items || [];
  const memberIds = new Set(members.map((m) => m.user_id));
  const candidates = (allUsers.data?.items || []).filter((u) => !memberIds.has(u.id));

  function userName(uid) {
    return (allUsers.data?.items || []).find((u) => u.id === uid)?.name || uid;
  }

  async function addMember(e) {
    e.preventDefault();
    if (!adding) return;
    setBusy(true);
    try {
      await api.post(`/organizations/${org.id}/members`, { userId: adding, role: 'member' });
      notify('Membre ajouté', { type: 'ok' });
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
      await api.put(`/organizations/${org.id}/members/${userId}`, { role });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function removeMember(userId) {
    if (!confirm('Retirer ce membre de l\'organisation ?')) return;
    try {
      await api.del(`/organizations/${org.id}/members/${userId}`);
      notify('Membre retiré', { type: 'info' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <Modal title={`Membres — ${org.name}`} onClose={onClose} width={460}>
      <div className="omm-list">
        {members.length === 0 ? (
          <div className="faint">Aucun membre</div>
        ) : members.map((m) => (
          <div key={m.user_id} className="omm-row">
            <span className="omm-name">{canManageUsers ? userName(m.user_id) : m.user_id}</span>
            <select className="input omm-role-select" value={m.role} onChange={(e) => setRole(m.user_id, e.target.value)}>
              {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {m.user_id !== currentUserId && (
              <span className="btn-outline omm-remove-btn" onClick={() => removeMember(m.user_id)}>
                <Icon name="trash" size={12} />
              </span>
            )}
          </div>
        ))}
      </div>

      {canManageUsers && (
        <form onSubmit={addMember} className="omm-add-row">
          <select className="input omm-add-select" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Ajouter un membre…</option>
            {candidates.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button className="btn" type="submit" disabled={busy || !adding}>Ajouter</button>
        </form>
      )}
    </Modal>
  );
}
