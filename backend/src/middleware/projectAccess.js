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

      if (req.user.role === 'admin') {
        req.projectRole = 'owner';
        return next();
      }

      if (req.pgProject) {
        req.projectRole = await getProjectRole(req.pgProject.id, req.user.id);
        if (!req.projectRole) return res.status(404).json({ ok: false, error: 'Projet introuvable' });
        return next();
      }

      // Projet pas encore migré : ancien comportement (membre = accès complet).
      if (legacyStore.isMember(project, req.user.id)) {
        req.projectRole = 'maintainer';
        return next();
      }
      return res.status(404).json({ ok: false, error: 'Projet introuvable' });
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
