import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import OrgMembersModal from './OrgMembersModal.jsx';
import './OrganizationDetailPage.css';

const ROLE_LABEL = { owner: 'Propriétaire', admin: 'Admin', member: 'Membre' };

// Fiche organisation : point d'entrée pour tout ce qui lui appartient (le
// wiki d'équipe en particulier — voir WikiPage.jsx, désormais rattaché à une
// organisation précise plutôt qu'accessible hors contexte via un sélecteur
// libre dans la barre latérale).
export default function OrganizationDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error } = useApi(() => api.get(`/organizations/${id}`), [id]);
  const projects = useApi(() => api.get(`/organizations/${id}/projects`), [id]);
  const [managingMembers, setManagingMembers] = useState(false);

  const org = data?.organization;
  const canManage = user?.role === 'admin' || org?.my_role === 'owner' || org?.my_role === 'admin';

  if (error) return <div className="card odp-error">Organisation introuvable ou non accessible.</div>;
  if (!org) return <div className="odp-loading">Chargement…</div>;

  return (
    <>
      <PageHeader
        title={(
          <span className="odp-title-row">
            {org.icon ? (
              <span className="odp-title-icon" style={{ background: org.color || 'var(--border-soft)' }}>{org.icon}</span>
            ) : (
              <Icon name="users" size={20} style={{ color: org.color || 'var(--text-faint)' }} />
            )}
            {org.name}
          </span>
        )}
        sub={org.slug}
        actions={<Link to="/deployments/organizations" className="btn-outline odp-back-link">← Toutes les organisations</Link>}
      />

      <div className="odp-menu-row">
        <Link to={`/deployments/organizations/${id}/wiki`} className="card odp-menu-item">
          <Icon name="book" size={20} />
          <div>
            <div className="odp-menu-item-title">Wiki d'équipe</div>
            <div className="faint odp-menu-item-sub">Procédures, décisions techniques, onboarding</div>
          </div>
        </Link>
        {canManage && (
          <div className="card odp-menu-item" onClick={() => setManagingMembers(true)} role="button">
            <Icon name="users" size={20} />
            <div>
              <div className="odp-menu-item-title">Membres</div>
              <div className="faint odp-menu-item-sub">Gérer qui appartient à cette organisation</div>
            </div>
          </div>
        )}
      </div>

      <Panel title="Projets de l'organisation" sub={`${projects.data?.items?.length ?? 0} projet(s)`} span={12}>
        {(projects.data?.items?.length ?? 0) === 0 ? (
          <div className="faint odp-projects-empty">Aucun projet dans cette organisation.</div>
        ) : (
          <div className="odp-projects-list">
            {projects.data.items.map((p) => (
              <Link key={p.id} to={`/deployments/projects/${p.legacy_id || p.id}`} className="odp-project-chip">
                {p.name}
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <div className="faint odp-role-note">Votre rôle dans cette organisation : {ROLE_LABEL[org.my_role] || 'aucun (accès administrateur plateforme)'}</div>

      {managingMembers && (
        <OrgMembersModal
          org={org}
          currentUserId={user?.id}
          canManageUsers={user?.role === 'admin'}
          onClose={() => setManagingMembers(false)}
        />
      )}
    </>
  );
}
