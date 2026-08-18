import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, isPlatformAdmin } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import * as orgStore from '../store/orgStore.js';
import * as serviceAccountStore from '../store/serviceAccountStore.js';
import { logAudit } from '../services/auditService.js';

// Service Accounts (ÉTAPE 23 IDP) : gestion réservée owner/admin de
// l'organisation — même politique que Platform Requests/Policies/Teams.
// Le CRUD lui-même passe par une session humaine normale (requireAuth) ;
// seul l'USAGE du jeton émis ici passe par requireServiceAccount
// (middleware/serviceAuth.js) sur l'API publique.
const router = Router({ mergeParams: true });
router.use(requireAuth);

router.use((req, res, next) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'Socle organisations indisponible (DATABASE_URL non configuré)', configured: false });
  next();
});

async function requireOrgAdmin(req, res) {
  const role = await orgStore.getOrgRole(req.params.id, req.user.id);
  if (!role && !isPlatformAdmin(req.user)) { res.status(404).json({ ok: false, error: 'Organisation introuvable' }); return false; }
  if (!isPlatformAdmin(req.user) && !orgStore.orgRoleAtLeast(role, 'admin')) {
    res.status(403).json({ ok: false, error: "Réservé owner/admin de l'organisation" });
    return false;
  }
  return true;
}

router.get('/', asyncHandler(async (req, res) => {
  if (!(await requireOrgAdmin(req, res))) return;
  res.json({ ok: true, items: await serviceAccountStore.listServiceAccountsForOrg(req.params.id), availableScopes: serviceAccountStore.SERVICE_ACCOUNT_SCOPES });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!(await requireOrgAdmin(req, res))) return;
  const { name, scopes } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ ok: false, error: 'Nom requis' });
  if (!Array.isArray(scopes) || scopes.length === 0) return res.status(400).json({ ok: false, error: 'Au moins un scope requis' });
  let created;
  try {
    created = await serviceAccountStore.createServiceAccount({ orgId: req.params.id, name: name.trim(), scopes, createdBy: req.user.id });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ ok: false, error: err.message });
    throw err;
  }
  logAudit(req, 'service_account.create', { orgId: req.params.id, serviceAccountId: created.serviceAccount.id, name: name.trim(), scopes });
  // Le token en clair n'apparaît que dans CETTE réponse, une seule fois —
  // jamais reconstructible ni renvoyé par GET ensuite (voir store, colonne
  // token_hash uniquement).
  res.status(201).json({ ok: true, serviceAccount: created.serviceAccount, token: created.token });
}));

router.delete('/:serviceAccountId', asyncHandler(async (req, res) => {
  if (!(await requireOrgAdmin(req, res))) return;
  const account = await serviceAccountStore.getServiceAccount(req.params.serviceAccountId);
  if (!account || account.org_id !== req.params.id) return res.status(404).json({ ok: false, error: 'Service account introuvable' });
  const revoked = await serviceAccountStore.revokeServiceAccount(req.params.serviceAccountId);
  if (!revoked) return res.status(409).json({ ok: false, error: 'Déjà révoqué' });
  logAudit(req, 'service_account.revoke', { orgId: req.params.id, serviceAccountId: req.params.serviceAccountId, name: account.name });
  res.json({ ok: true });
}));

export default router;
