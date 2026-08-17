import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import './AdminOverviewPanel.css';

// Vue destinée au responsable système (GET /api/system/overview, réservé
// aux admins côté backend) : ce que le reste du dashboard n'agrège pas —
// intégrations en erreur, incidents ouverts, jobs en échec/en cours,
// fraîcheur de la dernière sauvegarde. N'affiche jamais une section comme
// "tout va bien" faute de donnée : relationalCoreConfigured indique
// honnêtement quand incidents/jobs restent vides parce que Postgres n'est
// pas configuré, pas parce qu'il n'y a rien à signaler.
export default function AdminOverviewPanel() {
  const { data, loading, error } = useApi(() => api.get('/system/overview'), [], { pollMs: 20000 });

  if (loading && !data) {
    return (
      <Panel title="Vue d'ensemble administrateur" span={12}>
        <div className="aop-loading">Chargement…</div>
      </Panel>
    );
  }
  if (error || !data) return null; // pas admin, ou socle indisponible : ne pas encombrer l'accueil d'une erreur

  const problems = [
    ...data.integrationsInError.map((i) => ({ key: `int-${i.key}`, label: `${i.label} — ${i.message || 'en erreur'}`, tier: 'crit' })),
    ...data.incidents.critical.filter((i) => i.status !== 'resolved').map((i) => ({ key: `inc-${i.id}`, label: `Incident critique : ${i.title}`, tier: 'crit' })),
    ...data.incidents.open.filter((i) => i.severity !== 'critical').map((i) => ({ key: `inc-${i.id}`, label: `Incident ouvert : ${i.title}`, tier: 'warn' })),
    ...data.jobs.recentFailures.map((j) => ({ key: `job-${j.id}`, label: `Job en échec : ${j.type} — ${j.error || ''}`, tier: 'warn' })),
    ...(data.backups.stale ? [{ key: 'backup-stale', label: `Dernière sauvegarde vieille de ${Math.round(data.backups.lastAgeHours)} h`, tier: 'warn' }] : []),
    ...(!data.backups.last ? [{ key: 'backup-none', label: 'Aucune sauvegarde effectuée', tier: 'warn' }] : [])
  ];

  return (
    <Panel
      title="Vue d'ensemble administrateur"
      sub={problems.length === 0 ? 'Aucun problème détecté' : `${problems.length} point(s) à vérifier`}
      span={12}
    >
      {!data.relationalCoreConfigured && (
        <div className="faint aop-relational-note">
          Socle relationnel non configuré (DATABASE_URL) : incidents et jobs ne sont pas suivis sur cette instance.
        </div>
      )}
      {data.jobs.running.length > 0 && (
        <div className="aop-running-row">
          <Icon name="refresh" size={13} className="spin aop-running-icon" />
          <span className="aop-running-text">{data.jobs.running.length} opération(s) en cours</span>
        </div>
      )}
      {problems.length === 0 ? (
        <div className="aop-empty">Rien à signaler</div>
      ) : (
        <div className="aop-list">
          {problems.map((p) => (
            <div key={p.key} className="aop-item">
              <Icon name="alertTriangle" size={13} className="aop-item-icon" style={{ color: `var(--tone-${p.tier}-dot)` }} />
              <span className="aop-item-label">{p.label}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
