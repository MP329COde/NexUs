import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import {
  listGroups, getGroup, createGroup, updateGroup, deleteGroup, permissionsForUser,
  getUserOverrides, setUserOverrides, PERMISSION_DOMAINS, PERMISSION_LEVELS,
  PERMISSION_PRESETS, SUBDOMAINS, SUBDOMAIN_KEYS
} from '../store/groupsStore.js';
import { logAudit } from '../services/auditService.js';

// Gestion des groupes et de la matrice de permissions : réservée aux
// administrateurs, comme la gestion des utilisateurs.
const router = Router();
// Gérer la matrice de permissions elle-même = élévation de privilège
// potentielle : exige le niveau max sur le sous-domaine 'users-permissions'
// (hérité de 'users' tant qu'aucun groupe ne l'isole explicitement — voir
// groupsStore.js), pas juste 'write' sur 'users'. Distinct de 'users:admin'
// (gestion des comptes) depuis ce lot : un admin peut désormais déléguer la
// gestion des comptes SANS déléguer la capacité de modifier qui a accès à
// quoi, en laissant 'users-permissions' à 'none' pour ce groupe.
router.use(requireAuth, requirePermission('users-permissions', 'admin'));

const LEVEL_RANK = { none: 0, read: 1, write: 2, admin: 3 };
const ALL_DOMAINS = [...PERMISSION_DOMAINS, ...SUBDOMAIN_KEYS];

// users-permissions:admin (via un groupe, pas forcément le rôle plateforme
// 'admin') suffit pour créer/modifier n'importe quel groupe — sans ce
// garde-fou, un tel utilisateur pourrait s'ajouter comme membre d'un groupe
// et s'y attribuer n'importe quel niveau sur n'importe quel domaine (vault,
// users, kubernetes...), s'auto-élevant bien au-delà de ce que son rôle réel
// autorise. Un admin plateforme (role === 'admin') n'est pas concerné : le
// bypass de requirePermission le laisse déjà tout faire. Couvre aussi les
// sous-domaines (vault-prod, users-permissions) et les préréglages, qui sont
// résolus en matrice concrète avant l'appel à cette fonction.
function assertNoSelfEscalation(req, { permissions, subPermissions, memberIds, existingGroup }) {
  if (req.user.role === 'admin') return;
  const willBeMember = memberIds !== undefined
    ? Array.isArray(memberIds) && memberIds.includes(req.user.id)
    : Boolean(existingGroup?.memberIds?.includes(req.user.id));
  if (!willBeMember) return;
  const ceiling = permissionsForUser(req.user.id);
  const presetDef = req.body?.preset && PERMISSION_PRESETS[req.body.preset];
  const resultingPermissions = { ...(existingGroup?.permissions || {}), ...(presetDef?.permissions || {}), ...(permissions || {}) };
  const resultingSubPermissions = { ...(existingGroup?.subPermissions || {}), ...(presetDef?.subPermissions || {}), ...(subPermissions || {}) };
  for (const domain of PERMISSION_DOMAINS) {
    const level = resultingPermissions[domain] || 'none';
    if (LEVEL_RANK[level] > LEVEL_RANK[ceiling[domain] || 'none']) {
      throw Object.assign(
        new Error(`Vous ne pouvez pas vous accorder vous-même un niveau supérieur au vôtre sur "${domain}" via ce groupe`),
        { status: 403 }
      );
    }
  }
  for (const sub of SUBDOMAIN_KEYS) {
    const explicit = resultingSubPermissions[sub];
    const level = explicit !== undefined ? explicit : (resultingPermissions[SUBDOMAINS[sub]] || 'none');
    if (LEVEL_RANK[level] > LEVEL_RANK[ceiling[sub] || 'none']) {
      throw Object.assign(
        new Error(`Vous ne pouvez pas vous accorder vous-même un niveau supérieur au vôtre sur "${sub}" via ce groupe`),
        { status: 403 }
      );
    }
  }
}

router.get('/', (req, res) => {
  res.json({
    ok: true,
    items: listGroups(),
    domains: PERMISSION_DOMAINS,
    levels: PERMISSION_LEVELS,
    presets: PERMISSION_PRESETS,
    subdomains: SUBDOMAINS
  });
});

router.post('/', asyncHandler(async (req, res) => {
  assertNoSelfEscalation(req, { permissions: req.body?.permissions, subPermissions: req.body?.subPermissions, memberIds: req.body?.memberIds, existingGroup: null });
  const group = createGroup(req.body || {});
  logAudit(req, 'group.create', { groupId: group.id, name: group.name, preset: req.body?.preset || null });
  res.status(201).json({ ok: true, group });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const existingGroup = getGroup(req.params.id);
  if (!existingGroup) return res.status(404).json({ ok: false, error: 'Groupe introuvable' });
  assertNoSelfEscalation(req, { permissions: req.body?.permissions, subPermissions: req.body?.subPermissions, memberIds: req.body?.memberIds, existingGroup });
  const updated = updateGroup(req.params.id, req.body || {});
  logAudit(req, 'group.update', { groupId: updated.id, name: updated.name });
  res.json({ ok: true, group: updated });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const removed = deleteGroup(req.params.id);
  if (!removed) return res.status(404).json({ ok: false, error: 'Groupe introuvable' });
  logAudit(req, 'group.delete', { groupId: req.params.id });
  res.json({ ok: true });
}));

// Permissions individuelles hors groupe ("sélection unique par utilisateur")
// : se superposent à la matrice des groupes de l'utilisateur ciblé, jamais
// en dessous (voir groupsStore.permissionsForUser). Même garde-fou
// anti-auto-élévation que pour les groupes : un manager non-admin plateforme
// ne peut pas s'accorder à lui-même plus que son plafond actuel.
router.get('/user-overrides/:userId', (req, res) => {
  res.json({ ok: true, overrides: getUserOverrides(req.params.userId), domains: ALL_DOMAINS, levels: PERMISSION_LEVELS });
});

router.put('/user-overrides/:userId', asyncHandler(async (req, res) => {
  const overrides = req.body?.overrides || {};
  if (req.user.role !== 'admin' && req.params.userId === req.user.id) {
    const ceiling = permissionsForUser(req.user.id);
    for (const domain of ALL_DOMAINS) {
      const level = overrides[domain];
      if (level && LEVEL_RANK[level] > LEVEL_RANK[ceiling[domain] || 'none']) {
        return res.status(403).json({ ok: false, error: `Vous ne pouvez pas vous accorder vous-même un niveau supérieur au vôtre sur "${domain}"` });
      }
    }
  }
  const saved = setUserOverrides(req.params.userId, overrides);
  logAudit(req, 'group.userOverrides.update', { userId: req.params.userId, overrides: saved });
  res.json({ ok: true, overrides: saved });
}));

export default router;
