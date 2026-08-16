import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listCatalog, listTags, getManifest, deleteTag } from '../services/integrations/privateRegistryService.js';
import { logAudit } from '../services/auditService.js';

// Registre d'images privé (voir services/integrations/privateRegistryService.js) —
// contrairement à Docker Hub public, accès réservé aux admins : c'est une
// instance privée pouvant héberger des images propriétaires. Le nom d'un
// dépôt peut contenir des "/" (namespaces imbriqués, ex. "team/service") :
// passé en query string plutôt qu'en segment d'URL pour éviter tout souci
// de routage sur les slashes.
const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/repositories', asyncHandler(async (req, res) => {
  res.json({ ok: true, repositories: await listCatalog() });
}));

router.get('/tags', asyncHandler(async (req, res) => {
  const { repo } = req.query;
  if (!repo) return res.status(400).json({ ok: false, error: 'Paramètre "repo" requis' });
  res.json({ ok: true, tags: await listTags(repo) });
}));

router.get('/manifest', asyncHandler(async (req, res) => {
  const { repo, tag } = req.query;
  if (!repo || !tag) return res.status(400).json({ ok: false, error: 'Paramètres "repo" et "tag" requis' });
  res.json({ ok: true, manifest: await getManifest(repo, tag) });
}));

router.delete('/tags', asyncHandler(async (req, res) => {
  const { repo, tag } = req.query;
  if (!repo || !tag) return res.status(400).json({ ok: false, error: 'Paramètres "repo" et "tag" requis' });
  await deleteTag(repo, tag);
  logAudit(req, 'registry.tag.deleted', { repo, tag });
  res.json({ ok: true });
}));

export default router;
