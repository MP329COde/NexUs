import * as legacyStore from '../store/projectsStore.js';
import { pool } from '../db/pool.js';
import { getProjectRole, getProjectByLegacyId, projectRoleAtLeast } from '../store/orgStore.js';

// Pont entre l'ancien modèle de projet (store/projectsStore.js, memberIds
// plat) et le nouveau socle relationnel à rôles granulaires
// (store/orgStore.js : viewer < developer < maintainer < owner). Tant qu'un
// projet n'a pas encore été migré vers Postgres (voir
// scripts/migrate-to-postgres.js), on retombe sur l'ancienne visibilité
// booléenne (isMember → rôle 'maintainer' complet), pour ne jamais casser un
// projet existant. Une fois migré, le rôle réel de l'utilisateur s'applique.
//
// Résolution de rôle réutilisable, indépendante d'Express : c'est la SEULE
// implémentation de "quel rôle a cet utilisateur sur ce projet legacy ?" de
// toute la plateforme. loadProjectAccess() (ci-dessous) l'utilise pour les
// routes /projects/:id/*, et routes/vault.routes.js l'utilise pour les
// entrées de coffre-fort de portée "project" (reveal/update/delete par id
// direct, hors du préfixe /projects/:id/*) — sans cette factorisation, ces
// deux chemins auraient pu diverger silencieusement (ce qui s'est produit
// avant cette refactorisation : le coffre-fort ignorait encore les rôles
// granulaires et ne vérifiait que l'ancienne appartenance plate).
export async function resolveProjectRole(legacyProject, user) {
  if (!legacyProject) return null;
  if (user.role === 'admin') return 'owner';
  if (pool) {
    const pgProject = await getProjectByLegacyId(legacyProject.id);
    if (pgProject) return getProjectRole(pgProject.id, user.id);
  }
  // Projet pas encore migré : ancien comportement (membre = accès complet).
  return legacyStore.isMember(legacyProject, user.id) ? 'maintainer' : null;
}

// req.legacyProject : objet du store JSON (name, description, tags, memberIds,
//   repoKeys...) — reste la source de vérité du contenu du projet.
// req.projectRole   : 'viewer' | 'developer' | 'maintainer' | 'owner' | null
export function loadProjectAccess() {
  return async (req, res, next) => {
    try {
      const project = legacyStore.getProject(req.params.id);
      if (!project) return res.status(404).json({ ok: false, error: 'Projet introuvable' });
      req.legacyProject = project;

      if (pool) {
        req.pgProject = await getProjectByLegacyId(project.id);
      }

      req.projectRole = await resolveProjectRole(project, req.user);
      if (!req.projectRole) return res.status(404).json({ ok: false, error: 'Projet introuvable' });
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireMinRole(minRole) {
  return (req, res, next) => {
    if (!projectRoleAtLeast(req.projectRole, minRole)) {
      return res.status(403).json({ ok: false, error: `Rôle insuffisant sur ce projet (requis : ${minRole})` });
    }
    next();
  };
}
