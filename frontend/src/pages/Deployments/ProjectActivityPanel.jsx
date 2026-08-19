import Panel from '../../components/ui/Panel.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

const ACTION_LABELS = {
  'task.create': (m) => `a créé la tâche « ${m.title} »`,
  'task.status': (m) => `a déplacé « ${m.title} » vers ${m.status}`,
  'task.comment': (m) => `a commenté « ${m.title} »`,
  'adr.create': (m) => `a créé ADR-${String(m.number).padStart(3, '0')} « ${m.title} »`,
  'docSite.update': (m) => `a mis à jour le lien ${m.kind}`
};

// Activité d'équipe (todo.md items 28/31) : "qui a fait quoi, quand" —
// distincte du journal d'audit sécurité (réservé aux admins). Alimentée par
// logProjectActivity() aux points de mutation réels du projet (tâches,
// commentaires, ADR, liens documentation) — jamais un événement inventé.
export default function ProjectActivityPanel({ projectId, userName }) {
  const activity = useApi(() => api.get(`/projects/${projectId}/activity`), [projectId]);
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
