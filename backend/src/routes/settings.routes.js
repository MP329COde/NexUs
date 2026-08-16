import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { getAllRedacted, getRedactedIntegration, saveIntegration, INTEGRATION_KEYS, SECRET_FIELDS } from '../store/settingsStore.js';
import { integrations } from '../services/integrationRegistry.js';
import { readStore, writeStore } from '../store/jsonStore.js';
import { logAudit } from '../services/auditService.js';

// Connexions à l'infrastructure (tokens, URLs...) : réservé aux administrateurs.
// Les préférences propres à chaque utilisateur vivent dans /api/auth/profile.
const router = Router();
router.use(requireAuth, requirePermission('settings', 'admin'));

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
  const key = req.params.key;
  const secretFields = SECRET_FIELDS[key] || [];
  const before = getRedactedIntegration(key);
  const saved = saveIntegration(key, req.body || {});

  // Ne jamais consigner la valeur des champs secrets : seul un indicateur de
  // changement est journalisé pour eux. Les autres champs sont journalisés
  // avec leur ancienne/nouvelle valeur pour constituer un historique lisible.
  const changes = {};
  for (const field of Object.keys(req.body || {})) {
    if (field === 'enabled') continue;
    if (secretFields.includes(field)) {
      if (req.body[field]) changes[field] = { secret: true };
      continue;
    }
    const from = before?.[field] ?? null;
    const to = saved?.[field] ?? null;
    if (from !== to) changes[field] = { from, to };
  }

  logAudit(req, 'settings.integration.save', { key, changes });
  res.json({ ok: true, integration: saved });
}));

router.post('/:key/test', asyncHandler(async (req, res) => {
  assertKey(req.params.key);
  const entry = integrations[req.params.key];
  if (!entry) {
    return res.status(400).json({ ok: false, error: 'Test de connexion non disponible pour cette intégration' });
  }
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
