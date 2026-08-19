import Panel from '../../components/ui/Panel.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

const ACTION_LABELS = {
  'task.create': (m) => `a créé la tâche « ${m.title} »`,
  'task.status': (m) => `a déplacé « ${m.title} » vers ${m.status}`,
  'task.comment': (m) => `a commenté « ${m.title} »`,
  'adr.create': (m) => `a créé ADR-${String(m.number).padStart(3, '0')} « ${m.title} »`,
  'docSite.update': (m) => `a mis à jour le lien ${m.kind}`,
  'incident.comment': (m) => `a commenté l'incident « ${m.title} »`,
  'organization.member.add': (m) => `a ajouté ${m.userId} à l'organisation (${m.role})`,
  'organization.member.remove': (m) => `a retiré ${m.userId} de l'organisation`,
  'team.create': (m) => `a créé l'équipe « ${m.name} »`,
  'team.member.add': (m) => `a ajouté ${m.userId} à l'équipe (${m.role})`,
  'team.member.role': (m) => `a changé le rôle de ${m.userId} en ${m.role}`,
  'team.member.remove': (m) => `a retiré ${m.userId} de l'équipe`
};

// Activité d'équipe (todo.md items 28/31, généralisée organisation/équipe au
// Lot 42) : "qui a fait quoi, quand" — distincte du journal d'audit sécurité
// (réservé aux admins). Alimentée par logActivity()/logProjectActivity() aux
// points de mutation réels (tâches, commentaires, ADR, liens documentation,
// membres d'organisation/équipe) — jamais un événement inventé. `endpoint`
// pointe vers la route d'activité de l'entité concernée (projet, organisation
// ou équipe) ; `projectId` reste supporté pour compatibilité ascendante.
export default function ProjectActivityPanel({ projectId, endpoint, userName }) {
  const path = endpoint || `/projects/${projectId}/activity`;
  const activity = useApi(() => api.get(path), [path]);
  const items = activity.data?.items || [];

  return (
    <Panel title="Activité d'équipe" sub="Qui a fait quoi, quand" span={12}>
      {items.length === 0 ? (
        <div className="pd-empty">Aucune activité récente.</div>
      ) : (
        <div className="pd-list-loose">
          {items.map((a) => (
            <div key={a.id} className="pd-row">
              <span className="pd-row-title">
                <strong>{userName(a.actor_id)}</strong> {ACTION_LABELS[a.action]?.(a.meta) || a.action}
              </span>
              <span className="faint">{new Date(a.created_at).toLocaleString('fr-FR')}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
