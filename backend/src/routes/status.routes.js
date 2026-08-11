import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { integrations } from '../services/integrationRegistry.js';

const router = Router();
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

export default router;
