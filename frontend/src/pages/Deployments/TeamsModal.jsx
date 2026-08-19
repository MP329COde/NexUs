import { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import TeamMembersModal from './TeamMembersModal.jsx';
import './TeamsModal.css';

const EMPTY_FORM = { name: '', slug: '' };

// Équipes d'une organisation : store/routes déjà complets côté backend
// (store/orgStore.js, routes/teams.routes.js) mais SANS AUCUNE interface
// jusqu'ici (signalé dans todo.md) — un rôle projet peut référencer une
// équipe via owner_team_id (Software Catalog) sans que personne n'ait pu en
// créer une seule depuis l'interface. Même convention que OrgMembersModal :
// modale ouverte depuis la fiche organisation.
export default function TeamsModal({ org, canManage, onClose }) {
  const { data, reload } = useApi(() => api.get(`/teams/org/${org.id}`), [org.id]);
  const notify = useNotify();
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openTeam, setOpenTeam] = useState(null);

  const teams = data?.items || [];

  function nameToSlug(name) {
    return name.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  async function createTeam(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/teams/org/${org.id}`, form);
      notify(`Équipe ${form.name} créée`, { type: 'ok' });
      setForm(EMPTY_FORM);
      setCreating(false);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function deleteTeam(team) {
    if (!confirm(`Supprimer l'équipe « ${team.name} » ? Cette action est irréversible.`)) return;
    try {
      await api.del(`/teams/${team.id}`);
      notify('Équipe supprimée', { type: 'info' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <>
      <Modal title={`Équipes — ${org.name}`} sub="Regroupements d'utilisateurs, utilisés comme propriétaire de composants du catalogue" onClose={onClose} width={480}>
        <div className="teams-modal-list">
          {teams.length === 0 ? (
            <div className="faint">Aucune équipe dans cette organisation.</div>
          ) : teams.map((t) => (
            <div key={t.id} className="teams-modal-row" onClick={() => setOpenTeam(t)} role="button">
              <span className="teams-modal-name"><Icon name="users" size={14} />{t.name}</span>
              <span className="faint teams-modal-role">{t.my_role === 'lead' ? 'Lead' : t.my_role === 'member' ? 'Membre' : ''}</span>
              <Link to={`/deployments/teams/${t.id}`} onClick={(e) => e.stopPropagation()} className="btn-outline teams-modal-delete-btn" title="Ouvrir l'espace d'équipe">
                <Icon name="externalLink" size={12} />
              </Link>
              {canManage && (
                <span className="btn-outline teams-modal-delete-btn" onClick={(e) => { e.stopPropagation(); deleteTeam(t); }}>
                  <Icon name="trash" size={12} />
                </span>
              )}
            </div>
          ))}
        </div>

        {canManage && (
          creating ? (
            <form onSubmit={createTeam} className="teams-modal-create-form">
              <input
                className="input"
                required
                placeholder="Nom de l'équipe"
                value={form.name}
                onChange={(e) => setForm({ name: e.target.value, slug: nameToSlug(e.target.value) })}
              />
              <input className="input" required placeholder="identifiant-slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} pattern="[a-z0-9\-]+" />
              <div className="teams-modal-create-actions">
                <span className="btn-outline" onClick={() => { setCreating(false); setForm(EMPTY_FORM); }}>Annuler</span>
                <button className="btn" type="submit" disabled={busy}>{busy ? 'Création…' : 'Créer'}</button>
              </div>
            </form>
          ) : (
            <button className="btn teams-modal-new-btn" onClick={() => setCreating(true)}>
              <Icon name="plus" size={14} />Nouvelle équipe
            </button>
          )
        )}
      </Modal>

      {openTeam && <TeamMembersModal team={openTeam} onClose={() => { setOpenTeam(null); reload(); }} />}
    </>
  );
}
