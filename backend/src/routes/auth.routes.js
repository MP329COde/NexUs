import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, signSession, toPublicUser, SESSION_COOKIE } from '../middleware/auth.js';
import { findUserByEmail, findUserByIdentifier, updateUser, updatePassword, clearOnboarding, getLockStatus, recordLoginFailure, recordLoginSuccess } from '../store/usersStore.js';
import { verifyPassword, hashPassword } from '../utils/crypto.js';
import { logAudit } from '../services/auditService.js';
import { getSessionMinutes, getMinPasswordLength } from '../store/identityStore.js';
import { banIp, normalizeIp } from '../store/banlistStore.js';
import { createNotification } from '../store/notificationsStore.js';

const router = Router();
const AVATAR_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
// Au-delà de ce nombre d'échecs successifs sur UN SEUL compte (bien plus que
// le seuil de verrouillage), l'IP source est bannie automatiquement : ce
// n'est plus une erreur de frappe mais une attaque ciblée et concentrée —
// à distinguer d'un volume de connexions élevé mais réparti sur des comptes
// différents, qui lui reste couvert par le seul rate-limit IP générique.
const AUTO_BAN_ATTEMPTS = 12;

// data URL uniquement (jamais une URL distante — pas de SSRF possible côté
// serveur puisque rien n'est jamais fetché) ; limite haute généreuse mais
// bornée pour éviter qu'un avatar ne gonfle indéfiniment le store SQLite
// (~700 Ko encodé ≈ 512 Ko d'image brute, largement suffisant après le
// redimensionnement côté client à 256×256).
const AVATAR_IMAGE_PATTERN = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const AVATAR_IMAGE_MAX_LENGTH = 700_000;

function validateAvatarImage(avatarImage) {
  if (!avatarImage) return null;
  if (avatarImage.length > AVATAR_IMAGE_MAX_LENGTH) return 'Image trop volumineuse (700 Ko max une fois encodée)';
  if (!AVATAR_IMAGE_PATTERN.test(avatarImage)) return 'Format d\'image invalide (PNG, JPEG, WEBP ou GIF attendu)';
  return null;
}

router.post('/login', asyncHandler(async (req, res) => {
  // `email` accepté par rétrocompatibilité (formulaires/scripts existants) ;
  // `identifier` est le nom générique côté API — l'un ou l'autre peut
  // contenir soit une adresse e-mail, soit un nom de connexion.
  const { email, identifier, password } = req.body || {};
  const login = identifier || email;
  const user = login && findUserByIdentifier(login);

  if (user) {
    const lock = getLockStatus(user);
    if (lock.locked) {
      logAudit({ user: { email: user.email }, ip: req.ip }, 'auth.login.locked', {});
      return res.status(423).json({ ok: false, error: `Compte temporairement verrouillé après plusieurs échecs. Réessayez après ${new Date(lock.lockUntil).toLocaleTimeString('fr-FR')}.` });
    }
  }

  if (!user || user.active === false || !verifyPassword(password || '', user.passwordHash)) {
    if (user) {
      const { locked, attempts } = recordLoginFailure(user.id);
      logAudit({ user: { email: user.email }, ip: req.ip }, 'auth.login.failed', { attempts, locked });
      if (locked) {
        createNotification({
          type: 'auth.login.locked', severity: 'warn', title: 'Compte verrouillé',
          message: `Le compte ${user.email} a été verrouillé temporairement après ${attempts} échecs de connexion.`,
          meta: { email: user.email, attempts, ip: normalizeIp(req.ip) }
        });
      }
      if (attempts >= AUTO_BAN_ATTEMPTS) {
        const ip = normalizeIp(req.ip);
        try {
          banIp(ip, `Bannissement automatique : ${attempts} échecs de connexion consécutifs ciblant le compte ${user.email}`, 'system');
          logAudit({ user: { email: user.email }, ip: req.ip }, 'auth.login.autoban', { ip, attempts });
          createNotification({
            type: 'auth.login.autoban', severity: 'crit', title: 'IP bannie automatiquement',
            message: `L'adresse ${ip} a été bannie après ${attempts} échecs consécutifs ciblant le compte ${user.email}.`,
            meta: { email: user.email, attempts, ip }
          });
        } catch { /* déjà bannie */ }
      }
    } else {
      logAudit({ user: { email: login }, ip: req.ip }, 'auth.login.failed', {});
    }
    return res.status(401).json({ ok: false, error: 'Identifiants invalides' });
  }

  recordLoginSuccess(user.id);
  const token = signSession(user);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Reflète la connexion réelle (via X-Forwarded-Proto derrière nginx/Traefik,
    // cf. trust proxy dans index.js) plutôt qu'un simple NODE_ENV : sur un LAN
    // homelab sans TLS, un cookie "Secure" ne serait jamais renvoyé par le
    // navigateur et la connexion échouerait silencieusement.
    secure: req.secure,
    maxAge: getSessionMinutes() * 60 * 1000
  });
  logAudit({ user: toPublicUser(user), ip: req.ip }, 'auth.login', {});
  res.json({ ok: true, user: toPublicUser(user) });
}));

router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

const THEME_VALUES = ['system', 'light', 'dark', 'schedule'];

router.put('/profile', requireAuth, asyncHandler(async (req, res) => {
  const { name, avatarEmoji, avatarColor, avatarImage, theme } = req.body || {};
  if (avatarColor && !AVATAR_COLOR_PATTERN.test(avatarColor)) {
    return res.status(400).json({ ok: false, error: 'Couleur invalide (format #RRGGBB attendu)' });
  }
  if (avatarEmoji && [...avatarEmoji].length > 2) {
    return res.status(400).json({ ok: false, error: 'Avatar trop long (1 à 2 caractères/emoji)' });
  }
  const avatarImageError = validateAvatarImage(avatarImage);
  if (avatarImageError) return res.status(400).json({ ok: false, error: avatarImageError });
  if (theme && !THEME_VALUES.includes(theme)) {
    return res.status(400).json({ ok: false, error: `Thème invalide (attendu: ${THEME_VALUES.join(', ')})` });
  }
  // Image et emoji sont mutuellement exclusifs à l'affichage (voir
  // components/ui/Avatar.jsx) : renseigner explicitement l'un efface l'autre,
  // pour ne jamais laisser les deux enregistrés en même temps.
  const body = req.body || {};
  const patch = { name, theme };
  if (Object.prototype.hasOwnProperty.call(body, 'avatarImage')) {
    patch.avatarImage = avatarImage;
    patch.avatarEmoji = avatarImage ? '' : avatarEmoji;
  } else if (Object.prototype.hasOwnProperty.call(body, 'avatarEmoji')) {
    // Le formulaire envoie toujours avatarEmoji (même vide, pour revenir aux
    // initiales) quand aucune image n'est sélectionnée — ce champ étant
    // présent, l'image précédente doit être effacée dans tous les cas,
    // sinon "Retirer l'image importée" puis "Enregistrer" ne fait rien.
    patch.avatarEmoji = avatarEmoji;
    patch.avatarImage = '';
  }
  if (avatarColor !== undefined) patch.avatarColor = avatarColor;
  const updated = updateUser(req.user.id, patch);
  logAudit(req, 'auth.profile.updated', { avatarImageChanged: avatarImage !== undefined });
  res.json({ ok: true, user: toPublicUser(updated) });
}));

router.put('/password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const minLength = getMinPasswordLength();
  if (!newPassword || newPassword.length < minLength) {
    return res.status(400).json({ ok: false, error: `Le nouveau mot de passe doit contenir au moins ${minLength} caractères` });
  }
  const user = findUserByEmail(req.user.email);
  if (!verifyPassword(currentPassword || '', user.passwordHash)) {
    return res.status(401).json({ ok: false, error: 'Mot de passe actuel incorrect' });
  }
  updatePassword(user.id, hashPassword(newPassword));
  logAudit(req, 'auth.password.changed', {});
  res.json({ ok: true });
}));

// Assistant de première connexion (compte créé par un admin) : nom et mot de
// passe optionnel en un seul appel, puis sort définitivement l'utilisateur de
// ce parcours. Le mot de passe reste optionnel — l'utilisateur peut garder
// celui fourni par l'admin et ne renseigner que son profil.
router.put('/onboarding/complete', requireAuth, asyncHandler(async (req, res) => {
  const { name, avatarEmoji, avatarColor, newPassword } = req.body || {};
  if (avatarColor && !AVATAR_COLOR_PATTERN.test(avatarColor)) {
    return res.status(400).json({ ok: false, error: 'Couleur invalide (format #RRGGBB attendu)' });
  }
  if (newPassword) {
    const minLength = getMinPasswordLength();
    if (newPassword.length < minLength) {
      return res.status(400).json({ ok: false, error: `Le mot de passe doit contenir au moins ${minLength} caractères` });
    }
    updatePassword(req.user.id, hashPassword(newPassword));
  }
  updateUser(req.user.id, { name, avatarEmoji, avatarColor });
  const updated = clearOnboarding(req.user.id);
  logAudit(req, 'auth.onboarding.completed', {});
  res.json({ ok: true, user: toPublicUser(updated) });
}));

export default router;
