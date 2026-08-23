import { useEffect, useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import LoadingState from '../../components/ui/LoadingState.jsx';
import { api, markBackground } from '../../lib/apiClient.js';
import './MonitorWallPage.css';

const REFRESH_MS = 20000;
const MAX_COMMIT_REPOS = 8; // évite une explosion du nombre d'appels si beaucoup de dépôts sont connectés
const STATUS_TONE = { success: 'ok', failed: 'crit', running: 'info', cancelled: 'mut', other: 'mut' };
const STATUS_LABEL = { success: 'Succès', failed: 'Échec', running: 'En cours', cancelled: 'Annulé', other: '—' };
const SEVERITY_TONE = { critical: 'crit', crit: 'crit', p1: 'crit', high: 'crit', warning: 'warn', warn: 'warn', p2: 'warn', medium: 'warn', info: 'mut', p3: 'mut', low: 'mut' };

// "Mur de surveillance" (Lot D13) : page pensée pour rester ouverte en
// continu sur un écran dédié (second moniteur) — jamais pour être manipulée.
// Elle n'introduit aucune nouvelle route backend : elle réutilise
// GET /repos, GET /repos/:key/commits (Repository Workspace), GET
// /pipelines/runs (PipelinesPage), GET /wazuh/alerts + /wazuh/summary
// (Lot D7) et GET /{gitlab,github,gitea}/status (badges d'intégration, Lot
// A5). Aucun commit/pipeline/alerte fictif n'est affiché : chaque section
// montre un état vide honnête si la forge/l'outil correspondant n'est pas
// configuré dans cet environnement.
export default function MonitorWallPage() {
  const [state, setState] = useState(null);
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    async function load(silent) {
      if (silent) markBackground();
      const [reposR, pipelinesR, alertsR, wazuhSummaryR, gitlabR, githubR, giteaR] = await Promise.allSettled([
        api.get('/repos'),
        api.get('/pipelines/runs'),
        api.get('/wazuh/alerts'),
        api.get('/wazuh/summary'),
        api.get('/gitlab/status'),
        api.get('/github/status'),
        api.get('/gitea/status')
      ]);
      if (cancelled) return;

      const repos = reposR.status === 'fulfilled' ? (reposR.value.items || []) : [];
      const pipelines = pipelinesR.status === 'fulfilled' ? (pipelinesR.value.items || []) : [];
      const alerts = alertsR.status === 'fulfilled' ? (alertsR.value.items || []) : [];
      const wazuhDisconnected = wazuhSummaryR.status === 'fulfilled' ? (wazuhSummaryR.value.summary?.disconnected || 0) : 0;

      // Commits : un appel par dépôt (plafonné, trié par activité récente
      // pour privilégier les dépôts actifs) — pas d'endpoint agrégé côté
      // backend, on réutilise donc /repos/:key/commits tel quel plutôt que
      // d'en créer un nouveau.
      const sortedRepos = [...repos]
        .sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0))
        .slice(0, MAX_COMMIT_REPOS);
      const commitResults = await Promise.allSettled(
        sortedRepos.map((r) => api.get(`/repos/${encodeURIComponent(r.key)}/commits`))
      );
      if (cancelled) return;
      const commits = [];
      commitResults.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          for (const c of (r.value.items || []).slice(0, 5)) {
            commits.push({ ...c, repo: sortedRepos[i].name, repoPath: sortedRepos[i].path, provider: sortedRepos[i].provider });
          }
        }
      });
      commits.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      setState({
        repoCount: repos.length,
        commits: commits.slice(0, 12),
        pipelines: pipelines.slice(0, 10),
        alerts: alerts.slice(0, 8),
        wazuhDisconnected,
        integrations: [
          { id: 'gitlab', label: 'GitLab', status: gitlabR.status === 'fulfilled' ? gitlabR.value.status : { configured: false } },
          { id: 'github', label: 'GitHub', status: githubR.status === 'fulfilled' ? githubR.value.status : { configured: false } },
          { id: 'gitea', label: 'Gitea', status: giteaR.status === 'fulfilled' ? giteaR.value.status : { configured: false } }
        ]
      });
    }
    load(tick > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    const clockId = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(id); clearInterval(clockId); };
  }, []);

  if (!state) {
    return (
      <div className="monwall-root">
        <LoadingState label="Chargement du mur de surveillance…" />
      </div>
    );
  }

  const anyForgeConfigured = state.integrations.some((i) => i.status?.configured);
  const running = state.pipelines.filter((p) => p.status === 'running').length;
  const failed24h = state.pipelines.filter((p) => p.status === 'failed' && Date.now() - new Date(p.createdAt).getTime() < 24 * 3_600_000).length;

  return (
    <div className="monwall-root">
      <header className="monwall-header">
        <div className="monwall-header-title">
          <Icon name="gauge" size={26} />
          <span>Mur de surveillance</span>
        </div>
        <div className="monwall-header-meta">
          <span className="monwall-clock mono">{new Date(now).toLocaleTimeString('fr-FR')}</span>
          <span className="monwall-refresh faint">actualisation auto {REFRESH_MS / 1000}s</span>
        </div>
      </header>

      <div className="monwall-kpis">
        <div className="monwall-kpi">
          <span className="monwall-kpi-value">{state.repoCount}</span>
          <span className="monwall-kpi-label">Dépôts connectés</span>
        </div>
        <div className={`monwall-kpi${running > 0 ? ' tone-info' : ''}`}>
          <span className="monwall-kpi-value">{running}</span>
          <span className="monwall-kpi-label">Pipelines en cours</span>
        </div>
        <div className={`monwall-kpi${failed24h > 0 ? ' tone-crit' : ' tone-ok'}`}>
          <span className="monwall-kpi-value">{failed24h}</span>
          <span className="monwall-kpi-label">Échecs (24h)</span>
        </div>
        <div className={`monwall-kpi${state.wazuhDisconnected > 0 ? ' tone-warn' : ' tone-ok'}`}>
          <span className="monwall-kpi-value">{state.alerts.length + state.wazuhDisconnected}</span>
          <span className="monwall-kpi-label">Alertes actives</span>
        </div>
      </div>

      <div className="monwall-grid">
        <section className="monwall-col">
          <h2 className="monwall-col-title">Derniers commits / push</h2>
          {!anyForgeConfigured ? (
            <div className="monwall-empty">Aucune forge configurée (GitLab/GitHub/Gitea) — voir Paramètres → Intégrations</div>
          ) : state.commits.length === 0 ? (
            <div className="monwall-empty">Aucun commit récent sur les dépôts connectés</div>
          ) : (
            <ul className="monwall-list">
              {state.commits.map((c, i) => (
                <li key={`${c.sha}-${i}`} className="monwall-item">
                  <Icon name={c.provider} size={18} className="monwall-item-icon" />
                  <div className="monwall-item-body">
                    <div className="monwall-item-title">{c.message || '(sans message)'}</div>
                    <div className="monwall-item-sub faint">
                      <span className="mono">{c.sha}</span> · {c.repoPath || c.repo} · {c.author || 'auteur inconnu'} · {relativeTime(c.date)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="monwall-col">
          <h2 className="monwall-col-title">Pipelines CI/CD récents</h2>
          {!anyForgeConfigured ? (
            <div className="monwall-empty">Aucune forge configurée — pas d'exécution CI/CD à afficher</div>
          ) : state.pipelines.length === 0 ? (
            <div className="monwall-empty">Aucune exécution de pipeline récente</div>
          ) : (
            <ul className="monwall-list">
              {state.pipelines.map((p) => (
                <li key={p.id} className="monwall-item">
                  <span className={`monwall-dot tone-${STATUS_TONE[p.status] || 'mut'}`} />
                  <div className="monwall-item-body">
                    <div className="monwall-item-title">
                      {p.repo} <span className="faint">· {p.branch || '—'}</span>
                    </div>
                    <div className="monwall-item-sub faint">
                      {STATUS_LABEL[p.status] || p.status} · {p.provider === 'gitlab' ? 'GitLab CI' : 'GitHub Actions'} · {relativeTime(p.createdAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="monwall-col">
          <h2 className="monwall-col-title">Alertes de sécurité</h2>
          {state.alerts.length === 0 && state.wazuhDisconnected === 0 ? (
            <div className="monwall-empty monwall-empty-ok">Aucune alerte ouverte</div>
          ) : (
            <ul className="monwall-list">
              {state.wazuhDisconnected > 0 && (
                <li className="monwall-item">
                  <span className="monwall-dot tone-warn" />
                  <div className="monwall-item-body">
                    <div className="monwall-item-title">{state.wazuhDisconnected} agent(s) Wazuh déconnecté(s)</div>
                    <div className="monwall-item-sub faint">Cybersécurité</div>
                  </div>
                </li>
              )}
              {state.alerts.map((a) => (
                <li key={a.id} className="monwall-item">
                  <span className={`monwall-dot tone-${SEVERITY_TONE[(a.severity || '').toLowerCase()] || 'mut'}`} />
                  <div className="monwall-item-body">
                    <div className="monwall-item-title">{a.title || a.rule?.description || 'Alerte'}</div>
                    <div className="monwall-item-sub faint">{a.agent?.name || ''} {relativeTime(a.timestamp || a.startsAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="monwall-footer">
        {state.integrations.map((i) => (
          <span key={i.id} className={`monwall-integration-badge${i.status?.configured ? (i.status.ok ? ' tone-ok' : ' tone-crit') : ' tone-mut'}`}>
            <Icon name={i.id} size={14} />
            {i.label}
            <span className="monwall-integration-state">{i.status?.configured ? (i.status.ok ? 'connecté' : 'erreur') : 'non configuré'}</span>
          </span>
        ))}
      </footer>
    </div>
  );
}

function relativeTime(iso) {
  if (!iso) return 'date inconnue';
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}
