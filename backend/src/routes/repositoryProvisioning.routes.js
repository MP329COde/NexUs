import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, isPlatformAdmin } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import * as orgStore from '../store/orgStore.js';
import * as repoStore from '../store/managedRepositoriesStore.js';
import { logAudit } from '../services/auditService.js';
import { runProvisioning } from '../services/repositoryProvisioningService.js';

// Repository provisioning (Lot 54 puis Priorité 1) : modèle de données +
// exécution réelle du provisioning. `POST /` crée la demande ('pending')
// PUIS déclenche immédiatement runProvisioning() — la demande ne reste
// 'pending' que le temps de l'appel réseau, jamais indéfiniment. En cas
// d'échec (fournisseur non configuré, dépôt déjà pris ailleurs, etc.) le
// statut passe à 'failed' avec le détail réel de l'erreur, jamais un faux
// succès. `POST /:id/provision` permet de rejouer une demande 'failed'
// (ex. après avoir configuré les credentials manquants) sans la recréer.
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
  const { provider, account, owner, name, orgId, projectId, teamId, componentId, templateKey, teamSlug, ciVariables } = req.body || {};
  if (!owner || !owner.trim()) return res.status(400).json({ ok: false, error: 'owner requis' });
  if (!name || !name.trim()) return res.status(400).json({ ok: false, error: 'name requis' });
  if (!orgId) return res.status(400).json({ ok: false, error: 'orgId requis' });
  if (!['github', 'gitlab', 'gitea'].includes(provider || 'github')) return res.status(400).json({ ok: false, error: 'provider invalide' });
  if (account && !['personal', 'platform'].includes(account)) return res.status(400).json({ ok: false, error: 'account invalide (personal ou platform)' });
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
      account: account || 'personal',
      owner: owner.trim(),
      name: name.trim(),
      orgId,
      projectId: projectId || null,
      teamId: teamId || null,
      componentId: componentId || null,
      templateKey,
      teamSlug: teamSlug || null,
      ciVariables: ciVariables || {},
      requestedBy: req.user.id
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Une demande existe déjà pour ce owner/name/provider' });
    }
    throw err;
  }
  logAudit(req, 'repositoryProvisioning.request', { id: item.id, provider: item.provider, account: item.account, owner: item.owner, name: item.name, templateKey, status: item.status });

  // Provisioning immédiat : ne laisse jamais une demande en 'pending' sans
  // avoir tenté la création réelle (Priorité 1). Si le fournisseur n'est
  // pas configuré/gitea non supporté, runProvisioning() écrit 'failed' avec
  // le détail — la demande reste rejouable via POST /:id/provision.
  const result = provider === 'gitea'
    ? await repoStore.updateProvisioningStatus(item.id, { status: 'failed', statusDetail: 'Provisioning Gitea non implémenté pour le moment' })
    : await runProvisioning(item.id);
  logAudit(req, 'repositoryProvisioning.provisioned', { id: item.id, status: result.status, statusDetail: result.status_detail });
  res.status(201).json({ ok: true, item: result });
}));

// Rejoue une demande existante (utile après un échec 'failed', par exemple
// une fois les credentials du fournisseur configurés en Paramètres).
router.post('/:id/provision', asyncHandler(async (req, res) => {
  const item = await repoStore.getManagedRepository(req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: 'Demande de provisioning introuvable' });
  if (item.org_id) {
    const role = await requireOrgMembership(req, res, item.org_id);
    if (!role) return;
    if (!['owner', 'admin'].includes(role)) return res.status(403).json({ ok: false, error: "Seul un owner/admin de l'organisation peut relancer un provisioning" });
  } else if (!isPlatformAdmin(req.user)) {
    return res.status(403).json({ ok: false, error: 'Accès refusé' });
  }
  const result = await runProvisioning(item.id);
  logAudit(req, 'repositoryProvisioning.provisioned', { id: item.id, status: result.status, statusDetail: result.status_detail });
  res.json({ ok: true, item: result });
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
