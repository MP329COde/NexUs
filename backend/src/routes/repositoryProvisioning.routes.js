import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, isPlatformAdmin } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import * as orgStore from '../store/orgStore.js';
import * as repoStore from '../store/managedRepositoriesStore.js';
import { logAudit } from '../services/auditService.js';

// Repository provisioning (Lot 54, Étape 20 du plan Developer Experience,
// chantiers #41/#42/#43) : modèle de données + suivi des DEMANDES de
// provisioning uniquement.
//
// IMPORTANT — ce que ces routes NE font PAS : aucune ne crée réellement un
// dépôt chez GitHub/GitLab/Gitea. `POST /` enregistre une demande au statut
// 'pending' et s'arrête là. L'appel réel (githubPlatformService, credentials
// de plateforme dédiés) reste à construire une fois le compte GitHub de
// plateforme fourni par l'utilisateur (Étape 19 du plan) — le construire
// sans pouvoir tester un vrai appel serait un succès simulé. Voir
// todo-lot54.md pour le détail de cette limite.
const router = Router();
router.use(requireAuth);

router.use((req, res, next) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'Socle organisations indisponible (DATABASE_URL non configuré)', configured: false });
  next();
});

async function requireOrgMembership(req, res, orgId) {
  if (isPlatformAdmin(req.user)) return 'owner';
  const role = await orgStore.getOrgRole(orgId, req.user.id);
  if (!role) {
    res.status(404).json({ ok: false, error: 'Organisation introuvable' });
    return null;
  }
  return role;
}

router.get('/templates', asyncHandler(async (req, res) => {
  res.json({ ok: true, items: repoStore.listTemplates() });
}));

// Liste des demandes de provisioning, filtrable par organisation/projet/
// équipe/statut. Sans orgId, réservé aux admins plateforme (évite de
// lister des demandes d'organisations auxquelles l'appelant n'appartient
// pas).
router.get('/', asyncHandler(async (req, res) => {
  const { orgId, projectId, teamId, status } = req.query || {};
  if (orgId) {
    const role = await requireOrgMembership(req, res, orgId);
    if (!role) return;
  } else if (!isPlatformAdmin(req.user)) {
    return res.status(403).json({ ok: false, error: 'orgId requis (ou compte admin plateforme)' });
  }
  const items = await repoStore.listManagedRepositories({ orgId, projectId, teamId, status });
  res.json({ ok: true, items });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const item = await repoStore.getManagedRepository(req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: 'Demande de provisioning introuvable' });
  if (item.org_id) {
    const role = await requireOrgMembership(req, res, item.org_id);
    if (!role) return;
  } else if (!isPlatformAdmin(req.user)) {
    return res.status(403).json({ ok: false, error: 'Accès refusé' });
  }
  res.json({ ok: true, item });
}));

// Crée une demande de provisioning au statut 'pending'. N'appelle aucune
// forge externe (voir en-tête de fichier) : c'est un enregistrement de
// l'intention, pas une confirmation de création.
router.post('/', asyncHandler(async (req, res) => {
  const { provider, owner, name, orgId, projectId, teamId, componentId, templateKey } = req.body || {};
  if (!owner || !owner.trim()) return res.status(400).json({ ok: false, error: 'owner requis' });
  if (!name || !name.trim()) return res.status(400).json({ ok: false, error: 'name requis' });
  if (!orgId) return res.status(400).json({ ok: false, error: 'orgId requis' });
  const template = templateKey && repoStore.getTemplate(templateKey);
  if (!template) return res.status(400).json({ ok: false, error: 'templateKey invalide ou inconnu' });
  const role = await requireOrgMembership(req, res, orgId);
  if (!role) return;
  if (!['owner', 'admin'].includes(role)) {
    return res.status(403).json({ ok: false, error: "Seul un owner/admin de l'organisation peut demander un provisioning" });
  }
  let item;
  try {
    item = await repoStore.createProvisioningRequest({
      provider: provider || 'github',
      owner: owner.trim(),
      name: name.trim(),
      orgId,
      projectId: projectId || null,
      teamId: teamId || null,
      componentId: componentId || null,
      templateKey,
      requestedBy: req.user.id
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Une demande existe déjà pour ce owner/name/provider' });
    }
    throw err;
  }
  logAudit(req, 'repositoryProvisioning.request', { id: item.id, provider: item.provider, owner: item.owner, name: item.name, templateKey, status: item.status });
  res.status(201).json({ ok: true, item });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const item = await repoStore.getManagedRepository(req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: 'Demande de provisioning introuvable' });
  const role = item.org_id ? await requireOrgMembership(req, res, item.org_id) : null;
  if (item.org_id && !role) return;
  if (!isPlatformAdmin(req.user) && !['owner', 'admin'].includes(role)) {
    return res.status(403).json({ ok: false, error: 'Accès refusé' });
  }
  await repoStore.deleteManagedRepository(req.params.id);
  logAudit(req, 'repositoryProvisioning.delete', { id: item.id, provider: item.provider, owner: item.owner, name: item.name });
  res.json({ ok: true });
}));

export default router;
