import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { integrations } from '../services/integrationRegistry.js';
import { getHistory } from '../services/statusHistoryService.js';

const router = Router();

// Sonde de vie publique (aucune authentification) pour Docker/systemd/le
// reverse proxy : répond dès que le process Express écoute, sans dépendre
// d'aucune intégration externe. Doit rester avant router.use(requireAuth).
router.get('/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', uptimeSeconds: Math.round(process.uptime()) });
});

router.use(requireAuth);

// Vue d'ensemble consommée par le dashboard "Vue générale": interroge toutes
// les intégrations en parallèle et tolère les échecs individuels (une intégration
// en panne ne doit jamais casser l'affichage des autres).
router.get('/overview', asyncHandler(async (req, res) => {
  const entries = await Promise.all(Object.entries(integrations).map(async ([key, def]) => {
    const startedAt = Date.now();
    try {
      const status = await def.service.getStatus();
      return { key, label: def.label, domain: def.domain, latencyMs: Date.now() - startedAt, ...status };
    } catch (err) {
      return { key, label: def.label, domain: def.domain, configured: true, ok: false, message: err.message, latencyMs: Date.now() - startedAt };
    }
  }));

  const configured = entries.filter((e) => e.configured);
  const healthy = configured.filter((e) => e.ok);
  const score = configured.length ? Math.round((healthy.length / configured.length) * 100) : 0;

  res.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    score,
    integrations: entries
  });
}));

// Disponibilité 24h (24 points, un par heure écoulée) et 30j (moyenne par
// domaine), consommées par la carte "Résumé de l'infrastructure" et le widget
// "Disponibilité 24h" de la page d'accueil. Alimentée par le relevé horaire
// planifié (voir services/statusHistoryService.js) : juste après le premier
// démarrage, l'historique est encore vide et se remplit heure après heure.
router.get('/history', asyncHandler(async (req, res) => {
  const history = getHistory();
  const now = Date.now();

  const hourly = [];
  for (let h = 23; h >= 0; h--) {
    const bucketStart = now - (h + 1) * 60 * 60 * 1000;
    const bucketEnd = now - h * 60 * 60 * 1000;
    const inBucket = history.filter((s) => {
      const t = new Date(s.ts).getTime();
      return t >= bucketStart && t < bucketEnd;
    });
    const last = inBucket[inBucket.length - 1] || null;
    hourly.push(last ? { ts: last.ts, score: last.score } : null);
  }

  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const recent = history.filter((s) => new Date(s.ts).getTime() >= thirtyDaysAgo);

  const scored = recent.filter((s) => s.score !== null);
  const globalAvg = scored.length ? Math.round(scored.reduce((sum, s) => sum + s.score, 0) / scored.length) : null;

  const byDomain = {};
  for (const s of recent) {
    for (const [domain, d] of Object.entries(s.domains || {})) {
      if (!d.configured) continue;
      if (!byDomain[domain]) byDomain[domain] = { healthy: 0, configured: 0 };
      byDomain[domain].healthy += d.healthy;
      byDomain[domain].configured += d.configured;
    }
  }
  const daily30ByDomain = {};
  for (const [domain, d] of Object.entries(byDomain)) {
    daily30ByDomain[domain] = d.configured ? Math.round((d.healthy / d.configured) * 100) : null;
  }

  res.json({ ok: true, hourly, daily30: { global: globalAvg, byDomain: daily30ByDomain } });
}));

export default router;
