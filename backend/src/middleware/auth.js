import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { findUserById, validityWindowError } from '../store/usersStore.js';
import { getSessionMinutes } from '../store/identityStore.js';

export const SESSION_COOKIE = 'nexus_session';

const JWT_ALGORITHM = 'HS256';

export function signSession(user) {
  return jwt.sign({ sub: user.id, role: user.role, tv: user.tokenVersion || 0 }, env.jwtSecret, { expiresIn: `${getSessionMinutes()}m`, algorithm: JWT_ALGORITHM });
}

// Vue "publique" d'un utilisateur : jamais passwordHash, exposée à /auth/me, /auth/login, /auth/profile.
export function toPublicUser(user) {
  return {
    id: user.id, email: user.email, name: user.name, username: user.username || null, role: user.role,
    active: user.active !== false, avatarEmoji: user.avatarEmoji, avatarColor: user.avatarColor, avatarImage: user.avatarImage || null,
    theme: user.theme || 'system', mustOnboard: user.mustOnboard === true,
    terminalTier: user.role === 'admin' ? 'admin' : (user.terminalTier || null),
    validFrom: user.validFrom || null, validUntil: user.validUntil || null,
    isPrimaryAdmin: user.isPrimaryAdmin === true
  };
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ ok: false, error: 'Authentification requise' });
  try {
    // algorithms: restreint explicitement à HS256 (défense en profondeur contre
    // une confusion d'algorithme si le secret venait à être mal réutilisé ailleurs) :
    // la bibliothèque jsonwebtoken rejette déjà "none" par défaut, mais autant
    // ne jamais dépendre du comportement implicite pour une vérification de session.
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: [JWT_ALGORITHM] });
    const user = findUserById(payload.sub);
    if (!user || user.active === false) return res.status(401).json({ ok: false, error: 'Session invalide' });
    // Session révoquée (logout serveur ou changement de mot de passe depuis
    // l'émission de ce token) : le token reste signé valide mais ne
    // correspond plus à la version courante de l'utilisateur.
    if ((payload.tv || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ ok: false, error: 'Session révoquée' });
    }
    const validityError = validityWindowError(user);
    if (validityError) return res.status(401).json({ ok: false, error: validityError });
    req.user = toPublicUser(user);
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Session expirée ou invalide' });
  }
}

// À chaîner après requireAuth. Réserve une route à un rôle donné (typiquement
// 'admin' pour les intégrations d'infrastructure et la gestion des utilisateurs) :
// le reste de la console reste accessible à tout utilisateur authentifié.
export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ ok: false, error: 'Réservé aux administrateurs' });
    }
    next();
  };
}
