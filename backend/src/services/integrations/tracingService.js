import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured, IntegrationError } from './httpClient.js';

// Traces distribuées (Priorité 5, décision actée dans todo.md Lot 56-nav de
// ne construire cette intégration qu'une fois un vrai collecteur accessible
// — jamais de traces inventées). Supporte Grafana Tempo et Jaeger, deux API
// HTTP différentes mais toutes deux interrogées en direct, sans cache ni
// donnée locale : une trace affichée ici est toujours lue au moment de la
// requête depuis le collecteur configuré.
function client() {
  const cfg = getRawIntegration('tracing');
  if (!cfg.baseUrl) return null;
  return {
    http: buildClient(cfg.baseUrl.replace(/\/$/, ''), { headers: cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {} }),
    cfg
  };
}

export async function getStatus() {
  const c = client();
  if (!c) return notConfigured('Traces distribuées (Tempo/Jaeger)');
  const type = c.cfg.type === 'jaeger' ? 'jaeger' : 'tempo';
  const url = type === 'jaeger' ? '/api/services' : '/api/echo';
  await request(c.http, { method: 'GET', url }, 'Traces');
  return { configured: true, ok: true, message: `${type === 'jaeger' ? 'Jaeger' : 'Tempo'} joignable`, type };
}

// Recherche par nom de service (tag `service.name`, convention OpenTelemetry)
// — c'est la seule clé de recherche pertinente pour scoper par composant du
// catalog, en l'absence de tout autre identifiant NexUs propagé dans les
// traces (aucun SDK OTel n'est injecté par NexUs lui-même : le composant
// doit déjà émettre ses traces avec ce nom de service).
export async function searchTraces(serviceName, { limit = 20 } = {}) {
  const c = client();
  if (!c) throw new IntegrationError('Traces distribuées non configurées', { status: 409 });
  const type = c.cfg.type === 'jaeger' ? 'jaeger' : 'tempo';

  if (type === 'jaeger') {
    const data = await request(c.http, { method: 'GET', url: '/api/traces', params: { service: serviceName, limit } }, 'Traces');
    return (data.data || []).map((t) => ({
      traceId: t.traceID,
      spanCount: (t.spans || []).length,
      durationMs: t.spans?.length ? Math.round(Math.max(...t.spans.map((s) => s.startTime + s.duration)) / 1000 - Math.min(...t.spans.map((s) => s.startTime)) / 1000) : null,
      startTime: t.spans?.[0] ? new Date(t.spans[0].startTime / 1000).toISOString() : null
    }));
  }

  const data = await request(c.http, { method: 'GET', url: '/api/search', params: { tags: `service.name=${serviceName}`, limit } }, 'Traces');
  return (data.traces || []).map((t) => ({
    traceId: t.traceID,
    spanCount: t.spanCount ?? null,
    durationMs: t.durationMs ?? null,
    startTime: t.startTimeUnixNano ? new Date(Number(t.startTimeUnixNano) / 1e6).toISOString() : null
  }));
}

export function tracingUiUrl(serviceName) {
  const cfg = getRawIntegration('tracing');
  if (!cfg.baseUrl) return null;
  const base = cfg.baseUrl.replace(/\/$/, '');
  return cfg.type === 'jaeger' ? `${base}/search?service=${encodeURIComponent(serviceName)}` : `${base}/search?tags=service.name%3D${encodeURIComponent(serviceName)}`;
}
