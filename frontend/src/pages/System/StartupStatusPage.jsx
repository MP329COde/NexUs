import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import './StartupStatusPage.css';

const STATUS_LABEL = {
  ok: 'Succès',
  failed: 'Échec',
  degraded: 'Dégradé',
  running: 'En cours'
};

const STATUS_TONE = {
  ok: 'ok',
  failed: 'crit',
  degraded: 'warn',
  running: 'mut'
};

function StatusBadge({ status }) {
  const tone = STATUS_TONE[status] || 'mut';
  return (
    <span className="badge" style={{ background: `var(--tone-${tone}-bg)`, color: `var(--tone-${tone}-fg)` }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function formatDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatTimestamp(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR');
}

export default function StartupStatusPage() {
  // Démarrage : figé une fois le process lancé, pas besoin de polling
  // agressif — un rafraîchissement toutes les 15s suffit à refléter un
  // redémarrage récent sans bombarder l'API.
  const startup = useApi(() => api.get('/system/status/startup'), [], { pollMs: 15000 });
  // Runtime continu (backend/frontend/workers) : rafraîchi plus souvent,
  // c'est la partie "vivante" de l'écran.
  const runtime = useApi(() => api.get('/system/status/runtime'), [], { pollMs: 10000 });

  const s = startup.data?.startup;
  const r = runtime.data;

  return (
    <div className="startup-status-page">
      <PageHeader
        title="Démarrage & état du système"
        sub="Étapes réelles de démarrage du backend, durée mesurée, et état runtime continu (workers, intégrations, réseau)."
      />

      {startup.error && (
        <div className="startup-status-error">
          Impossible de charger le statut de démarrage : {startup.error.message}
        </div>
      )}

      {s && (
        <div className="startup-status-kpis">
          <KpiCard
            label="État global"
            value={s.ready ? (s.degraded ? 'Dégradé' : 'Prêt') : 'En échec'}
            tint={s.ready ? (s.degraded ? '#F59E0B' : '#22C55E') : '#EF4444'}
            note={s.failedAtStep ? `Arrêté à l'étape "${s.failedAtStep}"` : undefined}
          />
          <KpiCard label="Démarré à" value={formatTimestamp(s.startedAt)} tint="#3B82F6" />
          <KpiCard label="Prêt à" value={s.readyAt ? formatTimestamp(s.readyAt) : '—'} tint="#3B82F6" />
          <KpiCard label="Uptime process" value={formatDuration(s.uptimeMs)} tint="#8B5CF6" />
        </div>
      )}

      <Panel title="Timeline de démarrage" sub="Chaque étape est chronométrée en temps réel — aucune durée affichée ici n'est simulée.">
        <DataTable
          columns={['Étape', 'Statut', 'Durée', 'Détail / erreur']}
          rows={s?.steps}
          emptyTitle={startup.loading ? 'Chargement…' : 'Aucune étape enregistrée'}
          renderRow={(step) => (
            <tr key={step.name}>
              <td className="mono">{step.name}</td>
              <td><StatusBadge status={step.status} /></td>
              <td className="mono faint">{formatDuration(step.durationMs)}</td>
              <td className="startup-status-detail">
                {step.error && <span className="startup-status-error-text">{step.error}</span>}
                {!step.error && step.detail && (
                  <span className="faint mono">{typeof step.detail === 'string' ? step.detail : JSON.stringify(step.detail)}</span>
                )}
                {!step.error && !step.detail && '—'}
              </td>
            </tr>
          )}
        />
      </Panel>

      <Panel title="État runtime" sub="Backend, frontend et workers/jobs planifiés — rafraîchi automatiquement.">
        <div className="startup-status-runtime-grid">
          <div className="startup-status-runtime-block">
            <div className="startup-status-runtime-title">
              <Icon name="server" size={16} strokeWidth={1.7} /> Backend
            </div>
            {r?.backend ? (
              <ul className="startup-status-runtime-list">
                <li>État : <strong>{r.backend.up ? 'En ligne' : 'Hors ligne'}</strong></li>
                <li>PID : <span className="mono">{r.backend.pid}</span></li>
                <li>Démarré à : {formatTimestamp(r.backend.startedAt)}</li>
                <li>Uptime : {r.backend.uptimeSeconds}s</li>
                <li>Node : <span className="mono">{r.backend.nodeVersion}</span></li>
              </ul>
            ) : <p className="faint">Chargement…</p>}
          </div>

          <div className="startup-status-runtime-block">
            <div className="startup-status-runtime-title">
              <Icon name="globe" size={16} strokeWidth={1.7} /> Frontend
            </div>
            {r?.frontend ? (
              r.frontend.checked ? (
                <ul className="startup-status-runtime-list">
                  <li>Origine : <span className="mono">{r.frontend.origin}</span></li>
                  <li>État : <strong>{r.frontend.reachable ? 'Joignable' : 'Injoignable'}</strong></li>
                  {r.frontend.status !== undefined && <li>Code HTTP : {r.frontend.status}</li>}
                  {r.frontend.latencyMs !== undefined && <li>Latence : {formatDuration(r.frontend.latencyMs)}</li>}
                  {r.frontend.error && <li className="startup-status-error-text">{r.frontend.error}</li>}
                </ul>
              ) : <p className="faint">{r.frontend.message}</p>
            ) : <p className="faint">Chargement…</p>}
            <p className="faint startup-status-note">
              Vérifié depuis le backend (requête sortante vers FRONTEND_ORIGIN) — en développement le frontend Vite tourne
              souvent sur un process séparé, un échec ici ne signifie pas forcément qu'il est injoignable pour votre navigateur.
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="Workers & jobs planifiés" sub="Jobs réellement programmés dans index.js — dernière/prochaine exécution quand connue.">
        <DataTable
          columns={['Job', 'Description', 'Intervalle', 'Dernière exécution', 'Dernier résultat', 'Prochaine (estimée)']}
          rows={r?.workers}
          emptyTitle={runtime.loading ? 'Chargement…' : 'Aucun job enregistré'}
          renderRow={(w) => (
            <tr key={w.name}>
              <td className="mono">{w.name}</td>
              <td className="faint">{w.description || '—'}</td>
              <td className="mono faint">{w.intervalMs ? formatDuration(w.intervalMs) : (w.intervalHint || '—')}</td>
              <td className="mono faint">{w.lastRunAt ? formatTimestamp(w.lastRunAt) : 'Pas encore exécuté depuis ce démarrage'}</td>
              <td>
                {w.lastRunAt
                  ? <StatusBadge status={w.lastRunOk ? 'ok' : 'failed'} />
                  : <span className="faint">—</span>}
              </td>
              <td className="mono faint">{w.nextRunEstimateAt ? formatTimestamp(w.nextRunEstimateAt) : '—'}</td>
            </tr>
          )}
        />
      </Panel>
    </div>
  );
}
