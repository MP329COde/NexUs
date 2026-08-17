import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import OrgMembersModal from './OrgMembersModal.jsx';
import './OrganizationsPage.css';

const ORG_EMOJIS = ['🏢', '🚀', '⚙️', '🛰️', '🔧', '🧩', '🗄️', '🌐', '🔥', '🧠', '🛡️', '📊'];
const ORG_COLORS = ['#2563EB', '#8B5CF6', '#10B981', '#F59E0B', '#F43F5E', '#0EA5E9', '#EC4899', '#475569'];

// Organisations : socle relationnel PostgreSQL (voir store/orgStore.js).
// GET /api/organizations ne liste que celles dont l'utilisateur est membre —
// pas de vue globale "toutes les organisations" ici, cohérent avec le reste
// de la plateforme (jamais de fuite d'existence d'une organisation dont on
// n'est pas membre). Icône/couleur personnalisées comme pour les projets.
export default function OrganizationsPage() {
  const { data, error, reload } = useApi(() => api.get('/organizations'), []);
  const { user } = useAuth();
  const notify = useNotify();
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [managingMembers, setManagingMembers] = useState(null);

  const organizations = data?.items || [];
  const configured = !error || !String(error).includes('DATABASE_URL');

  async function createOrg(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/organizations', { name, slug, icon: icon || undefined, color: color || undefined });
      notify(`${name} créée`, { type: 'ok' });
      setName('');
      setSlug('');
      setIcon('');
      setColor('');
      setFormOpen(false);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(org, patch) {
    try {
      await api.put(`/organizations/${org.id}`, patch);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function removeOrg(org) {
    if (!confirm(`Supprimer définitivement "${org.name}" ?`)) return;
    try {
      await api.del(`/organizations/${org.id}`);
      notify('Organisation supprimée', { type: 'info' });
      reload();
    } catch (err) {
      if (err.status === 409 && err.body?.projectCount) {
        if (confirm(`${err.message}\n\nConfirmer la suppression de "${org.name}" ET de ses ${err.body.projectCount} projet(s) ?`)) {
          try {
            await api.del(`/organizations/${org.id}?force=true`);
            notify('Organisation et ses projets supprimés', { type: 'info' });
            reload();
          } catch (err2) {
            notify(err2.message, { type: 'crit' });
          }
        }
      } else {
        notify(err.message, { type: 'crit' });
      }
    }
  }

  if (!configured) {
    return (
      <>
        <PageHeader title="Organisations" sub="Socle relationnel des projets, équipes et environnements" />
        <div className="card org-not-configured">
          Socle relationnel non configuré sur cette instance (variable d'environnement <code>DATABASE_URL</code> absente
          côté backend) — voir README, section « Socle relationnel ».
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Organisations"
        sub="Regroupe équipes, projets et environnements — vous ne voyez que celles dont vous êtes membre"
        actions={(
          <button className="btn org-header-action" onClick={() => setFormOpen(true)}>
            <Icon name="plus" size={14} />Nouvelle organisation
          </button>
        )}
      />

      {formOpen && (
        <Modal title="Nouvelle organisation" onClose={() => setFormOpen(false)} width={420}>
          <form onSubmit={createOrg} className="org-form-fields">
            <div>
              <label className="org-form-label">Nom</label>
              <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Mon équipe" />
            </div>
            <div>
              <label className="org-form-label">Identifiant (URL, minuscules/tirets)</label>
              <input className="input" required pattern="[a-z0-9\-]+" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="mon-equipe" />
            </div>
            <div>
              <label className="org-form-label">Icône (optionnel)</label>
              <div className="org-emoji-picker">
                {ORG_EMOJIS.map((e) => (
                  <span
                    key={e} onClick={() => setIcon(e === icon ? '' : e)}
                    className={`org-emoji-option${e === icon ? ' org-emoji-option-active' : ''}`}
                  >{e}</span>
                ))}
              </div>
            </div>
            <div className="org-color-picker">
              {ORG_COLORS.map((c) => (
                <span
                  key={c} onClick={() => setColor(c)}
                  className={`org-color-option${c === color ? ' org-color-option-active' : ''}`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="org-form-actions">
              <span className="btn-outline" onClick={() => setFormOpen(false)}>Annuler</span>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Création…' : 'Créer'}</button>
            </div>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal title={`Modifier "${editing.name}"`} onClose={() => setEditing(null)} width={380}>
          <div>
            <label className="org-form-label">Icône</label>
            <div className="org-emoji-picker org-emoji-picker-spaced">
              {ORG_EMOJIS.map((e) => (
                <span
                  key={e}
                  onClick={() => saveEdit(editing, { icon: e === editing.icon ? '' : e }).then(() => setEditing((prev) => ({ ...prev, icon: e === prev.icon ? '' : e })))}
                  className={`org-emoji-option${e === editing.icon ? ' org-emoji-option-active' : ''}`}
                >{e}</span>
              ))}
            </div>
            <label className="org-form-label">Couleur</label>
            <div className="org-color-picker">
              {ORG_COLORS.map((c) => (
                <span
                  key={c}
                  onClick={() => saveEdit(editing, { color: c }).then(() => setEditing((prev) => ({ ...prev, color: c })))}
                  className={`org-color-option${c === editing.color ? ' org-color-option-active' : ''}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </Modal>
      )}

      <div className="org-grid">
        {organizations.length === 0 ? (
          <div className="card org-empty">
            Vous n'êtes membre d'aucune organisation. Les projets créés en créent automatiquement une par défaut.
          </div>
        ) : organizations.map((org) => (
          <div key={org.id} className="card org-card">
            <div className="org-card-header">
              <span className="org-card-title">
                {org.icon ? (
                  <span className="org-card-icon" style={{ background: org.color || 'var(--border-soft)' }}>{org.icon}</span>
                ) : (
                  <Icon name="users" size={15} style={{ color: org.color || 'var(--text-faint)' }} />
                )}
                {org.name}
              </span>
              <span className="org-card-actions">
                <span className="badge badge-vio">{org.my_role}</span>
                {(org.my_role === 'owner' || org.my_role === 'admin') && (
                  <span className="btn-outline org-card-edit-btn" onClick={() => setManagingMembers(org)} title="Gérer les membres">
                    <Icon name="users" size={12} />
                  </span>
                )}
                {(org.my_role === 'owner' || org.my_role === 'admin') && (
                  <span className="btn-outline org-card-edit-btn" onClick={() => setEditing(org)} title="Icône et couleur">
                    <Icon name="edit" size={12} />
                  </span>
                )}
                {org.my_role === 'owner' && (
                  <span className="btn-outline org-card-edit-btn org-card-delete-btn" onClick={() => removeOrg(org)}>
                    <Icon name="trash" size={12} />
                  </span>
                )}
              </span>
            </div>
            <p className="faint mono org-card-slug">{org.slug}</p>
          </div>
        ))}
      </div>

      {managingMembers && (
        <OrgMembersModal
          org={managingMembers}
          currentUserId={user?.id}
          canManageUsers={user?.role === 'admin'}
          onClose={() => setManagingMembers(null)}
        />
      )}
    </>
  );
}
