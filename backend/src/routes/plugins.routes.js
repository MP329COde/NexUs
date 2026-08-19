import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { pool } from '../db/pool.js';
import { logAudit } from '../services/auditService.js';
import * as pluginRegistry from '../services/plugins/pluginRegistry.js';

// Registre des plugins NexUs (Lot 1 — socle backend). Lecture accessible à
// tout utilisateur authentifié disposant de plugins:read (visibilité du
// catalogue installé), écriture (installer/activer/désactiver/supprimer/
// configurer) réservée à plugins:write — jamais d'accès admin implicite
// pour un plugin lui-même, voir pluginHasPermission() dans pluginRegistry.js.
const router = Router();
router.use(requireAuth);
router.use((req, res, next) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'Socle plugins indisponible (DATABASE_URL non configuré)', configured: false });
  next();
});

router.get('/', requirePermission('plugins', 'read'), asyncHandler(async (req, res) => {
  res.json({ ok: true, items: await pluginRegistry.listPlugins() });
}));

router.get('/:id', requirePermission('plugins', 'read'), asyncHandler(async (req, res) => {
  const plugin = await pluginRegistry.getPlugin(req.params.id);
  if (!plugin) return res.status(404).json({ ok: false, error: 'Plugin introuvable' });
  res.json({ ok: true, plugin });
}));

router.get('/:id/permissions', requirePermission('plugins', 'read'), asyncHandler(async (req, res) => {
  res.json({ ok: true, items: await pluginRegistry.getPluginPermissions(req.params.id) });
}));

router.get('/:id/events', requirePermission('plugins', 'read'), asyncHandler(async (req, res) => {
  res.json({ ok: true, items: await pluginRegistry.getPluginEvents(req.params.id, Number(req.query.limit) || 50) });
}));

router.post('/install', requirePermission('plugins', 'write'), asyncHandler(async (req, res) => {
  const { manifest } = req.body || {};
  const plugin = await pluginRegistry.installPlugin(manifest);
  logAudit(req, 'plugin.install', { pluginId: plugin.id, version: plugin.version });
  res.status(201).json({ ok: true, plugin });
}));

router.post('/:id/activate', requirePermission('plugins', 'write'), asyncHandler(async (req, res) => {
  const plugin = await pluginRegistry.activatePlugin(req.params.id);
  logAudit(req, 'plugin.activate', { pluginId: plugin.id });
  res.json({ ok: true, plugin });
}));

router.post('/:id/disable', requirePermission('plugins', 'write'), asyncHandler(async (req, res) => {
  const plugin = await pluginRegistry.disablePlugin(req.params.id);
  logAudit(req, 'plugin.disable', { pluginId: plugin.id });
  res.json({ ok: true, plugin });
}));

router.delete('/:id', requirePermission('plugins', 'write'), asyncHandler(async (req, res) => {
  await pluginRegistry.uninstallPlugin(req.params.id);
  logAudit(req, 'plugin.uninstall', { pluginId: req.params.id });
  res.json({ ok: true });
}));

router.put('/:id/config', requirePermission('plugins', 'write'), asyncHandler(async (req, res) => {
  const { key, value, encrypted } = req.body || {};
  if (!key) return res.status(400).json({ ok: false, error: 'key requis' });
  await pluginRegistry.setPluginConfig(req.params.id, key, value, !!encrypted);
  logAudit(req, 'plugin.config.update', { pluginId: req.params.id, key });
  res.json({ ok: true, items: await pluginRegistry.getPluginConfig(req.params.id) });
}));

router.get('/:id/config', requirePermission('plugins', 'read'), asyncHandler(async (req, res) => {
  res.json({ ok: true, items: await pluginRegistry.getPluginConfig(req.params.id) });
}));

export default router;
