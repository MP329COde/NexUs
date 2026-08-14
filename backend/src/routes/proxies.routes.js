import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as proxyService from '../services/proxyService.js';
import { logAudit } from '../services/auditService.js';

const router = Router();
router.use(requireAuth);

// Le reverse proxy (HAProxy/Traefik) est une ressource réseau partagée par
// toute la plateforme, pas un objet appartenant à un projet — il n'y a donc
// pas de portée projet à vérifier ici (contrairement à /projects/:id/*).
// Cohérent avec le reste de la console (routes/hosts.routes.js,
// routes/backups.routes.js) : toute action qui modifie l'infrastructure
// partagée (création, édition, application de config, suppression,
// rattachement d'un frontend HAProxy, marquage "critique") est réservée aux
// administrateurs. La liste, elle, reste visible par tout utilisateur
// authentifié — un simple test de connexion aussi (diagnostic en lecture
// seule, ne modifie rien).
router.get('/', asyncHandler(async (req, res) => res.json({ ok: true, items: proxyService.list() })));
router.post('/:id/test', asyncHandler(async (req, res) => res.json({ ok: true, result: await proxyService.testConnection(req.params.id) })));

router.use(requireRole('admin'));

router.post('/', asyncHandler(async (req, res) => {
  const proxy = proxyService.create(req.body || {});
  logAudit(req, 'proxy.create', { proxyId: proxy.id, domain: proxy.domain });
  res.status(201).json({ ok: true, proxy });
}));
router.put('/:id', asyncHandler(async (req, res) => {
  const proxy = proxyService.update(req.params.id, req.body || {});
  logAudit(req, 'proxy.update', { proxyId: proxy.id, domain: proxy.domain });
  res.json({ ok: true, proxy });
}));
router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await proxyService.remove(req.params.id);
  logAudit(req, 'proxy.delete', { proxyId: req.params.id });
  res.json(result);
}));
router.post('/:id/apply', asyncHandler(async (req, res) => {
  const result = await proxyService.apply(req.params.id);
  logAudit(req, 'proxy.apply', { proxyId: req.params.id });
  res.json(result);
}));
router.post('/:id/critical', asyncHandler(async (req, res) => {
  const proxy = proxyService.setCritical(req.params.id, req.body?.critical);
  res.json({ ok: true, proxy });
}));
router.post('/:id/attach-frontend', asyncHandler(async (req, res) => {
  const result = await proxyService.attachToFrontend(req.params.id, req.body?.frontendName);
  logAudit(req, 'proxy.attach_frontend', { proxyId: req.params.id, frontendName: req.body?.frontendName });
  res.json(result);
}));

export default router;
