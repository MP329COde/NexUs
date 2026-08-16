import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listVaultEntries, createVaultEntry, updateVaultEntry, deleteVaultEntry, revealVaultEntry, findVaultEntry, generateProdSecret, nextRotationAt
} from '../store/vaultStore.js';
import { findUserByEmail } from '../store/usersStore.js';
import { verifyPassword } from '../utils/crypto.js';
import { logAudit } from '../services/auditService.js';
import { getProject } from '../store/projectsStore.js';
import { resolveProjectRole } from '../middleware/projectAccess.js';
import { projectRoleAtLeast, getProjectByLegacyId, getResourceGrant, resourceLevelAtLeast } from '../store/orgStore.js';

// Résout le rôle réel (viewer/developer/maintainer/owner, ou null) via la
// même logique que /projects/:id/* (middleware/projectAccess.js) — aupara-
// vant ces routes ne vérifiaient que l'ancienne appartenance plate
// (memberIds), ce qui laissait un accès complet (reveal/update/delete) à un
// utilisateur explicitement rétrogradé en "viewer" via le socle relationnel.
async function projectEntryRole(entry, user) {
  if (!entry) return null;
  if (entry.tier !== 'project') return 'owner'; // dev/prod : logique existante ci-dessous, inchangée
  const project = getProject(entry.projectId);
  return resolveProjectRole(project, user);
}

// Complète projectEntryRole : un membre en dessous du rôle global requis
// (ex. viewer) peut tout de même satisfaire minRole si un octroi ponctuel
// "vault" d'au moins resourceLevel lui a été accordé sur ce projet (voir
// store/orgStore.js, hasResourceAccess/RESOURCE_BASE_ROLE) — jamais
// l'inverse : un rôle global déjà suffisant n'a pas besoin d'octroi.
async function projectEntryAccess(entry, user, minRole, resourceLevel) {
  if (!entry) return false;
  const role = await projectEntryRole(entry, user);
  if (projectRoleAtLeast(role, minRole)) return true;
  if (entry.tier !== 'project') return false;
  const pgProject = await getProjectByLegacyId(entry.projectId);
  if (!pgProject) return false;
  const grant = await getResourceGrant(pgProject.id, user.id, 'vault');
  return resourceLevelAtLeast(grant?.level, resourceLevel);
}

// Mots de passe dev : visibles par tout utilisateur authentifié (aide les
// développeurs à accéder aux machines de test partagées). Mots de passe
// prod : réservés aux admins, générés automatiquement, et ré-protégés par
// mot de passe (l'utilisateur retape le sien pour révéler le secret).
const router = Router();
router.use(requireAuth);

router.get('/dev', (req, res) => {
  res.json({ ok: true, items: listVaultEntries('dev') });
});

router.get('/prod', requireRole('admin'), (req, res) => {
  res.json({ ok: true, items: listVaultEntries('prod') });
});

router.post('/dev', requireRole('admin'), asyncHandler(async (req, res) => {
  const { label, username, secret, notes, url } = req.body || {};
  if (!label || !secret) return res.status(400).json({ ok: false, error: 'Nom et mot de passe requis' });
  const entry = createVaultEntry({ tier: 'dev', label, username, secret, notes, url, actor: req.user });
  logAudit(req, 'vault.create', { id: entry.id, tier: 'dev', label });
  res.status(201).json({ ok: true, entry });
}));

router.post('/prod', requireRole('admin'), asyncHandler(async (req, res) => {
  const { label, username, notes, url, rotationMinutes } = req.body || {};
  if (!label) return res.status(400).json({ ok: false, error: 'Nom requis' });
  const entry = createVaultEntry({ tier: 'prod', label, username, secret: generateProdSecret(), notes, url, rotationMinutes, actor: req.user });
  logAudit(req, 'vault.create', { id: entry.id, tier: 'prod', label, rotationMinutes: entry.rotationMinutes });
  res.status(201).json({ ok: true, entry });
}));

router.post('/:id/reveal', asyncHandler(async (req, res) => {
  const entry = findVaultEntry(req.params.id);
  // 404 générique (pas 403) pour ne pas confirmer l'existence d'une entrée
  // hors de portée — même logique que projects.routes.js. Révéler un secret
  // exige au moins developer (même seuil que la création — voir
  // projects.routes.js POST /:id/vault), ou un octroi ponctuel "vault"
  // (lecture) accordé au membre pour ce projet précis.
  if (!entry || !(await projectEntryAccess(entry, req.user, 'developer', 'read'))) {
    return res.status(404).json({ ok: false, error: 'Entrée introuvable' });
  }

  if (entry.tier === 'prod' && req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Réservé aux administrateurs' });
  }

  if (entry.tier === 'prod') {
    const me = findUserByEmail(req.user.email);
    if (!verifyPassword(req.body?.currentPassword || '', me.passwordHash)) {
      return res.status(401).json({ ok: false, error: 'Mot de passe incorrect' });
    }
  }

  // Tier 'project' : si le projet a défini un mot de passe de coffre-fort
  // dédié, il remplace le mot de passe du compte (verrou propre au projet,
  // partagé entre ses membres, plutôt que le mot de passe personnel de
  // chacun). Rétrocompatible : tant qu'aucun mot de passe de coffre n'est
  // défini, on retombe sur l'ancien comportement (mot de passe du compte).
  if (entry.tier === 'project') {
    const project = getProject(entry.projectId);
    if (project?.vaultPasswordHash) {
      if (!verifyPassword(req.body?.projectPassword ?? req.body?.currentPassword ?? '', project.vaultPasswordHash)) {
        return res.status(401).json({ ok: false, error: 'Mot de passe de coffre-fort du projet incorrect' });
      }
    } else {
      const me = findUserByEmail(req.user.email);
      if (!verifyPassword(req.body?.currentPassword || '', me.passwordHash)) {
        return res.status(401).json({ ok: false, error: 'Mot de passe incorrect' });
      }
    }
  }

  const secret = revealVaultEntry(entry.id);
  logAudit(req, 'vault.reveal', { id: entry.id, tier: entry.tier, label: entry.label });
  res.json({ ok: true, secret, secretVersion: entry.secretVersion || 1, rotatesAt: nextRotationAt(entry), rotationMinutes: entry.rotationMinutes || null });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const entry = findVaultEntry(req.params.id);
  // Modifier les métadonnées exige un octroi "vault" au niveau écriture
  // (pas seulement lecture) quand le rôle global ne suffit pas déjà.
  if (!entry || !(await projectEntryAccess(entry, req.user, 'developer', 'write'))) {
    return res.status(404).json({ ok: false, error: 'Entrée introuvable' });
  }
  if (entry.tier !== 'project' && req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Réservé aux administrateurs' });
  }
  const { label, username, url, notes, rotationMinutes } = req.body || {};
  const updated = updateVaultEntry(entry.id, { label, username, url, notes, rotationMinutes });
  logAudit(req, 'vault.update', { id: entry.id, tier: entry.tier, label: updated.label, rotationMinutes: updated.rotationMinutes });
  res.json({ ok: true, entry: updated });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const entry = findVaultEntry(req.params.id);
  // Suppression = action destructrice : seuil plus élevé que la simple
  // modification de métadonnées (maintainer, pas developer).
  const role = await projectEntryRole(entry, req.user);
  if (!entry || !projectRoleAtLeast(role, 'maintainer')) return res.status(404).json({ ok: false, error: 'Entrée introuvable' });
  if (entry.tier !== 'project' && req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Réservé aux administrateurs' });
  }
  deleteVaultEntry(req.params.id);
  logAudit(req, 'vault.delete', { id: req.params.id, tier: entry.tier, label: entry.label });
  res.json({ ok: true });
}));

export default router;
