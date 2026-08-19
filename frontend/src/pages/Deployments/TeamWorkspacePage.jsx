import { useParams, Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import './TeamWorkspacePage.css';

const ROLE_LABELS = { lead: 'Lead', member: 'Membre' };
const LIFECYCLE_TONE = { production: 'ok', experimental: 'warn', deprecated: 'crit' };

// Espace d'équipe : ce que le todo appelle "Team Workspace" — membres,
// services/composants dont l'équipe est propriétaire (GET /catalog/
// components?ownerTeamId=, déjà réel — voir routes/catalog.routes.js) et
// accès direct à la documentation d'équipe (palier dédié du Wiki, Lot 6).
// Pas de nouvelle donnée : regroupe des vues déjà réelles par équipe.
export default function TeamWorkspacePage() {
  const { teamId } = useParams();
  const { user } = useAuth();
  const team = useApi(() => api.get(`/teams/${teamId}`), [teamId]);
  const t = team.data?.team;
  const org = useApi(() => (t?.org_id ? api.get(`/organizations/${t.org_id}`) : Promise.resolve(null)), [t?.org_id]);
  const components = useApi(() => api.get(`/catalog/components?ownerTeamId=${teamId}`), [teamId]);
  const allUsers = useApi(() => (user?.role === 'admin' ? api.get('/users') : Promise.resolve(null)), [user?.role]);

  function userName(uid) {
    return (allUsers.data?.items || []).find((u) => u.id === uid)?.name || uid;
  }

  if (team.error) return <div className="card twp-error">Équipe introuvable ou non accessible.</div>;
  if (!t) return <div className="faint">Chargement…</div>;

  const members = team.data?.members || [];
  const items = components.data?.items || [];

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Développement', to: '/deployments' },
          ...(org.data?.organization ? [{ label: org.data.organization.name, to: `/deployments/organizations/${org.data.organization.id}` }] : []),
          { label: t.name }
        ]}
        title={(
          <span className="twp-title-row">
            <Icon name="users" size={20} />
            {t.name}
          </span>
        )}
        sub={`${members.length} membre(s) — ${items.length} service(s)/composant(s) possédé(s)`}
        actions={(
          <Link to={`/deployments/organizations/${t.org_id}/wiki?teamId=${t.id}`} className="btn-outline">
            <Icon name="book" size={13} /> Documentation d'équipe
          </Link>
        )}
      />

      <div className="pd-grid-row">
        <Panel title="Membres" span={5}>
          {members.length === 0 ? (
            <div className="pd-empty">Aucun membre.</div>
          ) : (
            <div className="pd-list-loose">
              {members.map((m) => (
                <div key={m.user_id} className="twp-member-row">
                  <span>{userName(m.user_id)}</span>
                  <span className="faint">{ROLE_LABELS[m.role] || m.role}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Services & composants possédés" sub="Software Catalog — filtré sur cette équipe" span={7}>
          {items.length === 0 ? (
            <div className="pd-empty">Aucun composant du catalogue n'appartient à cette équipe.</div>
          ) : (
            <div className="pd-list-loose">
              {items.map((c) => (
                <Link key={c.id} to={`/deployments/catalog/${c.id}`} className="pd-row pd-row-link">
                  <span className="pd-row-title">{c.name}</span>
                  {c.lifecycle && <span className={`badge badge-${LIFECYCLE_TONE[c.lifecycle] || 'mut'}`}>{c.lifecycle}</span>}
                  <span className="faint">{c.project_name}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
