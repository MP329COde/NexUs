import { Link } from 'react-router-dom';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';

// Équivalent de AdminOverviewPanel pour un compte non-admin : n'agrège que ce
// qui concerne SES propres projets (GET /projects/mine/overview, filtré
// côté backend par appartenance réelle — jamais par un rôle global). Un
// admin a déjà AdminOverviewPanel (vue plateforme) ; ce panneau ne s'affiche
// donc que pour les comptes "user", pour éviter la redondance de deux
// vues d'ensemble sur la même page.
export default function MyProjectsOverviewPanel() {
  const { user } = useAuth();
  const { data, loading, error } = useApi(() => api.get('/projects/mine/overview'), [], { pollMs: 30000 });

  if (user?.role === 'admin') return null;
  if (loading && !data) {
    return (
      <Panel title="Mes projets" span={12}>
        <div style={{ padding: 20, fontSize: 12.5, color: 'var(--text-faint)' }}>Chargement…</div>
      </Panel>
    );
  }
  if (error || !data) return null;

  if (data.projects.length === 0) {
    return (
      <Panel title="Mes projets" span={12}>
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>
          Vous n'êtes membre d'aucun projet pour le moment.
        </div>
      </Panel>
    );
  }

  const items = [
    ...data.openIncidents.map((i) => ({ key: `inc-${i.id}`, icon: 'alertTriangle', tone: i.severity === 'critical' || i.severity === 'high' ? 'crit' : 'warn', label: `${i.projectName} — Incident : ${i.title}`, to: `/deployments/projects/${i.projectId}` })),
    ...data.pendingChanges.map((c) => ({ key: `chg-${c.id}`, icon: 'gitBranch', tone: 'warn', label: `${c.projectName} — Changement à décider : ${c.title}`, to: `/deployments/projects/${c.projectId}` })),
    ...data.upcomingMaintenance.map((w) => ({ key: `mw-${w.id}`, icon: 'clock', tone: 'mut', label: `${w.projectName} — Maintenance : ${w.title} (${new Date(w.startsAt).toLocaleDateString('fr-FR')})`, to: `/deployments/projects/${w.projectId}` }))
  ];

  return (
    <Panel
      title="Mes projets"
      sub={items.length === 0 ? `${data.projects.length} projet(s), rien à signaler` : `${items.length} point(s) à vérifier sur vos projets`}
      span={12}
    >
      {items.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Rien à signaler sur vos projets.</div>
      ) : (
        <div style={{ padding: 6 }}>
          {items.map((it) => (
            <Link key={it.key} to={it.to} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', textDecoration: 'none', color: 'inherit' }}>
              <Icon name={it.icon} size={13} style={{ color: `var(--tone-${it.tone}-dot)`, flex: 'none' }} />
              <span style={{ fontSize: 12.5, flex: 1 }}>{it.label}</span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}
