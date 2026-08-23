import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { findUserById, validityWindowError } from '../store/usersStore.js';
import { getSessionMinutes } from '../store/identityStore.js';
import { createSession, getSession, touchSession } from '../store/sessionsStore.js';

export const SESSION_COOKIE = 'nexus_session';
// Cookie CSRF (double-submit) : volontairement PAS httpOnly — le frontend
// doit pouvoir le lire pour le renvoyer en en-tête (voir lib/apiClient.js).
// Sa seule protection est que sameSite=lax + le renvoi manuel en en-tête
// empêchent un site tiers de le rejouer : un attaquant ne peut ni le lire
// (cross-origin) ni le forger côté navigateur de la victime.
export const CSRF_COOKIE = 'nexus_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const JWT_ALGORITHM = 'HS256';

export function signSession(user, sid) {
  return jwt.sign({ sub: user.id, role: user.role, tv: user.tokenVersion || 0, sid }, env.jwtSecret, { expiresIn: `${getSessionMinutes()}m`, algorithm: JWT_ALGORITHM });
}

function baseCookieOptions(req) {
  return { sameSite: 'lax', secure: req.secure, maxAge: getSessionMinutes() * 60 * 1000 };
}

// Point unique d'émission de session : pose à la fois le cookie JWT
// (httpOnly) et le cookie CSRF associé — appelé par les trois routes qui
// délivrent une session (login classique, WebAuthn, configuration initiale).
export function issueSessionCookies(res, req, user) {
  const session = createSession(user.id, { ip: req.ip, userAgent: req.headers['user-agent'] });
  const token = signSession(user, session.id);
  res.cookie(SESSION_COOKIE, token, { ...baseCookieOptions(req), httpOnly: true });
  res.cookie(CSRF_COOKIE, crypto.randomBytes(32).toString('hex'), { ...baseCookieOptions(req), httpOnly: false });
  return token;
}

export function clearSessionCookies(res) {
  res.clearCookie(SESSION_COOKIE);
  res.clearCookie(CSRF_COOKIE);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Routes qui ÉMETTENT une nouvelle session (issueSessionCookies) plutôt que
// d'agir au nom d'une session existante : le double-submit CSRF protège une
// action mutative jouée via une session déjà établie, pas la création de
// cette session elle-même. Les exempter évite un vrai verrou sans issue :
// un client qui a perdu son cookie nexus_csrf (purge partielle du navigateur,
// ITP Safari...) tout en gardant un nexus_session encore valide ne pouvait
// plus JAMAIS se reconnecter — /auth/login retombait dans la branche
// "session cookie présent" ci-dessous et exigeait un jeton CSRF introuvable,
// sans aucun moyen de s'en sortir (le logout, mutatif lui aussi, était tout
// autant bloqué). Bug trouvé en testant le Software Catalog avec un onglet
// resté connecté longtemps. SameSite=Lax empêche déjà un navigateur
// d'envoyer ces cookies sur une requête POST cross-site déclenchée par un
// autre site, donc ces routes n'ont pas besoin d'une protection double-submit
// en plus.
const SESSION_ISSUING_PATHS = new Set(['/auth/login', '/auth/webauthn/login-verify', '/auth/mfa/verify', '/setup']);

// Double-submit cookie : n'a de sens que pour les requêtes authentifiées par
// cookie (seul mécanisme qu'un navigateur envoie automatiquement cross-site
// et donc vulnérable au CSRF) — un appel via Authorization: Bearer n'est pas
// concerné, le navigateur ne rejoue jamais cet en-tête tout seul.
export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (SESSION_ISSUING_PATHS.has(req.path)) return next();
  const sessionCookie = req.cookies?.[SESSION_COOKIE];
  const hasBearer = /^Bearer\s+/i.test(req.headers.authorization || '');
  if (!sessionCookie || hasBearer) return next();
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ ok: false, error: 'Jeton CSRF invalide ou manquant' });
  }
  next();
}

// Vue "publique" d'un utilisateur : jamais passwordHash, exposée à /auth/me, /auth/login, /auth/profile.
export function toPublicUser(user) {
  return {
    id: user.id, email: user.email, name: user.name, username: user.username || null, role: user.role,
    active: user.active !== false, avatarEmoji: user.avatarEmoji, avatarColor: user.avatarColor, avatarImage: user.avatarImage || null,
    theme: user.theme || 'system', mustOnboard: user.mustOnboard === true,
    terminalTier: user.role === 'admin' ? 'admin' : (user.terminalTier || null),
    validFrom: user.validFrom || null, validUntil: user.validUntil || null,
    isPrimaryAdmin: user.isPrimaryAdmin === true,
    mfaEnabled: user.mfaEnabled === true
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
    // Défense en profondeur : un jeton MFA intermédiaire (mfaPending, émis par
    // POST /auth/login quand mfaEnabled=true, voir routes/auth.routes.js) ne
    // doit jamais pouvoir servir de session complète, même s'il finissait par
    // être envoyé dans le cookie de session par erreur côté client.
    if (payload.mfaPending) return res.status(401).json({ ok: false, error: 'Vérification MFA requise' });
    const user = findUserById(payload.sub);
    if (!user || user.active === false) return res.status(401).json({ ok: false, error: 'Session invalide' });
    // Session révoquée (logout serveur ou changement de mot de passe depuis
    // l'émission de ce token) : le token reste signé valide mais ne
    // correspond plus à la version courante de l'utilisateur.
    if ((payload.tv || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ ok: false, error: 'Session révoquée' });
    }
    // Jetons émis avant l'introduction du suivi de session (payload.sid absent)
    // restent valides jusqu'à expiration naturelle — pas de session à vérifier.
    if (payload.sid) {
      const session = getSession(payload.sid);
      if (!session || session.revoked) return res.status(401).json({ ok: false, error: 'Session révoquée' });
      touchSession(payload.sid);
    }
    const validityError = validityWindowError(user);
    if (validityError) return res.status(401).json({ ok: false, error: validityError });
    req.user = toPublicUser(user);
    req.sessionId = payload.sid || null;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Session expirée ou invalide' });
  }
}

// À chaîner après requireAuth. Réserve une route à un rôle donné (typiquement
// 'admin' pour les intégrations d'infrastructure et la gestion des utilisateurs) :
// le reste de la console reste accessible à tout utilisateur authentifié.
// Bascule "admin plateforme = accès complet" utilisée dans plusieurs
// domaines qui ont chacun leur propre hiérarchie de rôle (organisation,
// équipe, page de wiki, job...) — centralisée ici plutôt que réimplémentée
// en `req.user.role === 'admin'` dans chaque route (voir teams.routes.js,
// organizations.routes.js, wiki.routes.js, jobs.routes.js), pour qu'un futur
// changement de ce bypass n'ait qu'un seul endroit à corriger.
export function isPlatformAdmin(user) {
  return user?.role === 'admin';
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ ok: false, error: 'Réservé aux administrateurs' });
    }
    next();
  };
}
