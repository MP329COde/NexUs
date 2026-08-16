import { hasPermission } from '../store/groupsStore.js';

// À chaîner après requireAuth. Un compte 'admin' de plateforme garde un accès
// total implicite (même bypass que resolveTier() dans terminalService.js) :
// pas besoin de migrer les admins existants vers des groupes au déploiement.
// Un compte 'user' doit avoir, via ses groupes (voir groupsStore.js), au
// moins `minLevel` sur `domain`.
export function requirePermission(domain, minLevel = 'read') {
  return (req, res, next) => {
    if (req.user?.role === 'admin') return next();
    if (!req.user || !hasPermission(req.user.id, domain, minLevel)) {
      return res.status(403).json({ ok: false, error: 'Permission insuffisante' });
    }
    next();
  };
}
