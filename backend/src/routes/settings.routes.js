import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getAllRedacted, getRedactedIntegration, saveIntegration, INTEGRATION_KEYS } from '../store/settingsStore.js';
import { integrations } from '../services/integrationRegistry.js';
import { readStore, writeStore } from '../store/jsonStore.js';
import { logAudit } from '../services/auditService.js';

// Connexions à l'infrastructure (tokens, URLs...) : réservé aux administrateurs.
// Les préférences propres à chaque utilisateur vivent dans /api/auth/profile.
const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', asyncHandler(async (req, res) => {
  res.json({ ok: true, integrations: getAllRedacted(), console: readStore('console') });
}));

router.put('/console', asyncHandler(async (req, res) => {
  const next = writeStore('console', { ...readStore('console'), ...req.body });
  res.json({ ok: true, console: next });
}));

router.get('/:key', asyncHandler(async (req, res) => {
  assertKey(req.params.key);
  res.json({ ok: true, integration: getRedactedIntegration(req.params.key) });
}));

router.put('/:key', asyncHandler(async (req, res) => {
  assertKey(req.params.key);
  const saved = saveIntegration(req.params.key, req.body || {});
  // Ne jamais consigner le corps de la requête (secrets en clair) : seule la
  // clé d'intégration modifiée est journalisée.
  logAudit(req, 'settings.integration.save', { key: req.params.key });
  res.json({ ok: true, integration: saved });
}));

router.post('/:key/test', asyncHandler(async (req, res) => {
  assertKey(req.params.key);
  const entry = integrations[req.params.key];
  const status = await entry.service.getStatus();
  res.json({ ok: true, status });
}));

function assertKey(key) {
  if (!INTEGRATION_KEYS.includes(key)) {
    const err = new Error(`Intégration inconnue: ${key}`);
    err.status = 400;
    throw err;
  }
}

export default router;
