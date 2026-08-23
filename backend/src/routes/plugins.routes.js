import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { pool } from '../db/pool.js';
import { logAudit } from '../services/auditService.js';
import * as pluginRegistry from '../services/plugins/pluginRegistry.js';
import { buildPluginTemplateZip } from '../services/plugins/pluginTemplateService.js';

// Registre des plugins NexUs (Lot 1 — socle backend). Lecture accessible à
// tout utilisateur authentifié disposant de plugins:read (visibilité du
// catalogue installé), écriture (installer/activer/désactiver/supprimer/
// configurer) réservée à plugins:write — jamais d'accès admin implicite
// pour un plugin lui-même, voir pluginHasPermission() dans pluginRegistry.js.
const router = Router();
router.use(requireAuth);

// Génération du template officiel de plugin (Lot D8, point 1) : pure
// génération de fichiers, aucune écriture DB — placée avant le middleware
// de disponibilité du socle Postgres pour rester utilisable même sans
// DATABASE_URL configuré (le template ne dépend d'aucune donnée en base).
router.get('/template', requirePermission('plugins', 'read'), asyncHandler(async (req, res) => {
  const { id, name, version } = req.query;
  const zip = buildPluginTemplateZip({ id, name, version });
  const fileName = `nexus-plugin-${(id && String(id).trim()) || 'template'}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(zip);
}));

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

// Mode dev local (Lot D8, point 6a) : lit et valide manifest.json depuis un
// dossier serveur, jamais d'installation si absent/invalide.
router.post('/install-local', requirePermission('plugins', 'write'), asyncHandler(async (req, res) => {
  const { path: dirPath } = req.body || {};
  const plugin = await pluginRegistry.installLocalPlugin(dirPath);
  logAudit(req, 'plugin.devload', { pluginId: plugin.id, path: dirPath });
  res.status(201).json({ ok: true, plugin });
}));

// Dépôt Git distant (Lot D8, point 6b) : télécharge et valide manifest.json
// avant toute installation, jamais de succès si le fetch/la validation échoue.
router.post('/install-git', requirePermission('plugins', 'write'), asyncHandler(async (req, res) => {
  const { repoUrl, ref } = req.body || {};
  const plugin = await pluginRegistry.installGitPlugin(repoUrl, ref);
  logAudit(req, 'plugin.gitinstall', { pluginId: plugin.id, repoUrl, ref: ref || 'main' });
  res.status(201).json({ ok: true, plugin });
}));

// Approbation admin des permissions déclarées par un plugin (Lot D8, point
// 2) : chaque permission entre en 'pending' à l'installation, un admin doit
// explicitement l'accorder ou la refuser avant qu'elle ne devienne
// utilisable, et avant que le plugin ne puisse s'activer (voir
// activatePlugin()).
router.post('/:id/permissions/:key/grant', requirePermission('plugins', 'write'), asyncHandler(async (req, res) => {
  const permission = await pluginRegistry.grantPluginPermission(req.params.id, req.params.key, req.user?.email);
  logAudit(req, 'plugin.permission.grant', { pluginId: req.params.id, permission: req.params.key });
  res.json({ ok: true, permission });
}));

router.post('/:id/permissions/:key/deny', requirePermission('plugins', 'write'), asyncHandler(async (req, res) => {
  const permission = await pluginRegistry.denyPluginPermission(req.params.id, req.params.key, req.user?.email);
  logAudit(req, 'plugin.permission.deny', { pluginId: req.params.id, permission: req.params.key });
  res.json({ ok: true, permission });
}));

// Mise à jour avec rollback réel en transaction (Lot D8, point 3).
router.post('/:id/update', requirePermission('plugins', 'write'), asyncHandler(async (req, res) => {
  const { manifest } = req.body || {};
  const plugin = await pluginRegistry.updatePlugin(req.params.id, manifest);
  logAudit(req, 'plugin.update', { pluginId: plugin.id, toVersion: plugin.version });
  res.json({ ok: true, plugin });
}));

// Healthcheck basé sur des données réelles (journal d'événements +
// cohérence des permissions), Lot D8 point 4.
router.get('/:id/health', requirePermission('plugins', 'read'), asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await pluginRegistry.getPluginHealth(req.params.id)) });
}));

export default router;
