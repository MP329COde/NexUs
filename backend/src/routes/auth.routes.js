import { Router } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, toPublicUser, issueSessionCookies, clearSessionCookies } from '../middleware/auth.js';
import { findUserByEmail, findUserByIdentifier, findUserById, updateUser, updatePassword, clearOnboarding, getLockStatus, recordLoginFailure, recordLoginSuccess, validityWindowError, incrementTokenVersion, setPendingMfaSecret, enableMfa, disableMfa, consumeBackupCodeHash } from '../store/usersStore.js';
import { verifyPassword, hashPassword, encryptSecret, decryptSecret } from '../utils/crypto.js';
import { logAudit } from '../services/auditService.js';
import { passwordPolicyError, getLoginCidrAllowlist } from '../store/identityStore.js';
import { ipMatchesAnyCidr } from '../utils/cidr.js';
import { generateSecret, verifyTotpCode, buildOtpauthUrl } from '../utils/totp.js';
import { banIp, normalizeIp } from '../store/banlistStore.js';
import { permissionsForUser } from '../store/groupsStore.js';
import { createNotification } from '../store/notificationsStore.js';
import { readStore } from '../store/jsonStore.js';
import { env } from '../config/env.js';

const MFA_PENDING_ALGORITHM = 'HS256';
const MFA_PENDING_TTL = '5m';

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
  // Restriction CIDR (identityStore.loginCidrAllowlist) : vérifiée avant
  // toute recherche de compte, pour qu'une tentative depuis une IP non
  // autorisée n'entame jamais le compteur de verrouillage d'un compte réel
  // ni ne révèle son existence.
  const cidrAllowlist = getLoginCidrAllowlist();
  if (cidrAllowlist.length > 0 && !ipMatchesAnyCidr(normalizeIp(req.ip), cidrAllowlist)) {
    logAudit({ user: null, ip: req.ip }, 'auth.login.blocked_ip', {});
    return res.status(403).json({ ok: false, error: 'Connexion refusée depuis cette adresse (restriction réseau activée par un administrateur).' });
  }

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

  const validityError = validityWindowError(user);
  if (validityError) {
    logAudit({ user: { email: user.email }, ip: req.ip }, 'auth.login.failed', { reason: validityError });
    return res.status(401).json({ ok: false, error: validityError });
  }

  recordLoginSuccess(user.id);

  // MFA (todo.md, durcissement sécurité de plateforme) : le mot de passe seul
  // vient d'être validé, mais aucune session complète n'est émise tant que le
  // second facteur n'est pas vérifié — voir POST /auth/mfa/verify ci-dessous.
  // Le jeton retourné ici est volontairement à part du cookie de session
  // (jamais posé via issueSessionCookies) et porte mfaPending:true, rejeté
  // explicitement par requireAuth en défense en profondeur.
  if (user.mfaEnabled) {
    const mfaToken = jwt.sign({ sub: user.id, mfaPending: true }, env.jwtSecret, { expiresIn: MFA_PENDING_TTL, algorithm: MFA_PENDING_ALGORITHM });
    logAudit({ user: toPublicUser(user), ip: req.ip }, 'auth.login.mfa_required', {});
    return res.json({ ok: true, mfaRequired: true, mfaToken });
  }

  // Reflète la connexion réelle (via X-Forwarded-Proto derrière nginx/Traefik,
  // cf. trust proxy dans index.js) plutôt qu'un simple NODE_ENV : sur un LAN
  // homelab sans TLS, un cookie "Secure" ne serait jamais renvoyé par le
  // navigateur et la connexion échouerait silencieusement (voir secure: req.secure
  // dans issueSessionCookies).
  issueSessionCookies(res, req, user);
  logAudit({ user: toPublicUser(user), ip: req.ip }, 'auth.login', {});
  res.json({ ok: true, user: toPublicUser(user) });
}));

// Second facteur (TOTP ou code de secours) : consomme le jeton intermédiaire
// émis par POST /auth/login quand mfaEnabled=true. Les échecs alimentent le
// même compteur de verrouillage que les mots de passe (recordLoginFailure) —
// un code à 6 chiffres est bien plus facile à brute-forcer qu'un mot de
// passe, il n'y a aucune raison qu'il échappe à la même protection.
router.post('/mfa/verify', asyncHandler(async (req, res) => {
  const { mfaToken, code } = req.body || {};
  let payload;
  try {
    payload = jwt.verify(mfaToken || '', env.jwtSecret, { algorithms: [MFA_PENDING_ALGORITHM] });
  } catch {
    return res.status(401).json({ ok: false, error: 'Jeton MFA invalide ou expiré — reconnectez-vous.' });
  }
  if (!payload.mfaPending) return res.status(401).json({ ok: false, error: 'Jeton MFA invalide' });
  const user = findUserById(payload.sub);
  if (!user || !user.mfaEnabled) return res.status(401).json({ ok: false, error: 'MFA non activé pour ce compte' });

  const lock = getLockStatus(user);
  if (lock.locked) {
    return res.status(423).json({ ok: false, error: `Compte temporairement verrouillé après plusieurs échecs. Réessayez après ${new Date(lock.lockUntil).toLocaleTimeString('fr-FR')}.` });
  }

  const secret = decryptSecret(user.mfaSecret);
  const validTotp = verifyTotpCode(secret, code);
  const validBackup = !validTotp && consumeBackupCodeHash(user.id, (h) => verifyPassword(code || '', h));
  if (!validTotp && !validBackup) {
    const { locked, attempts } = recordLoginFailure(user.id);
    logAudit({ user: toPublicUser(user), ip: req.ip }, 'auth.mfa.failed', { attempts, locked });
    return res.status(401).json({ ok: false, error: 'Code invalide' });
  }

  recordLoginSuccess(user.id);
  issueSessionCookies(res, req, user);
  logAudit({ user: toPublicUser(user), ip: req.ip }, 'auth.login', { via: validBackup ? 'mfa_backup_code' : 'mfa_totp' });
  if (validBackup) {
    createNotification({
      type: 'auth.mfa.backup_code_used', severity: 'warn', title: 'Code de secours MFA utilisé',
      message: `Le compte ${user.email} s'est connecté avec un code de secours MFA — il en reste ${(user.mfaBackupCodeHashes || []).length - 1}.`,
      meta: { email: user.email }
    });
  }
  res.json({ ok: true, user: toPublicUser(user) });
}));

// Étape 1/2 de l'activation : génère un secret et le stocke en attente
// (mfaPendingSecret, distinct de mfaSecret) — rien n'est actif tant que
// POST /auth/mfa/enable n'a pas reçu un code valide généré à partir de ce
// secret, pour ne jamais activer un secret que l'utilisateur n'a jamais
// réellement scanné/saisi dans son application d'authentification.
router.post('/mfa/setup', requireAuth, asyncHandler(async (req, res) => {
  const secret = generateSecret();
  setPendingMfaSecret(req.user.id, encryptSecret(secret));
  const consoleName = readStore('console')?.name || 'Nexus Console';
  const otpauthUrl = buildOtpauthUrl({ secret, accountName: req.user.email, issuer: consoleName });
  res.json({ ok: true, secret, otpauthUrl });
}));

// Étape 2/2 : vérifie un code généré à partir du secret en attente, puis
// l'active et génère les codes de secours — retournés une seule fois en
// clair ici (jamais renvoyés ensuite, seuls leurs hachages sont conservés,
// même fonction hashPassword/verifyPassword que les mots de passe de
// compte).
router.post('/mfa/enable', requireAuth, asyncHandler(async (req, res) => {
  const { code } = req.body || {};
  const user = findUserById(req.user.id);
  if (!user.mfaPendingSecret) return res.status(400).json({ ok: false, error: "Aucune configuration MFA en attente — commencez par POST /auth/mfa/setup" });
  const secret = decryptSecret(user.mfaPendingSecret);
  if (!verifyTotpCode(secret, code)) return res.status(400).json({ ok: false, error: 'Code invalide — vérifiez que l\'heure de votre appareil est synchronisée.' });
  const backupCodes = Array.from({ length: 8 }, () => cryptoRandomBackupCode());
  enableMfa(user.id, encryptSecret(secret), backupCodes.map((c) => hashPassword(c)));
  logAudit(req, 'auth.mfa.enabled', {});
  res.json({ ok: true, backupCodes });
}));

// Réauthentification par mot de passe exigée, comme pour tout changement
// touchant la sécurité du compte (voir PUT /password) — désactiver le MFA
// est une action au moins aussi sensible que changer le mot de passe.
router.post('/mfa/disable', requireAuth, asyncHandler(async (req, res) => {
  const { password } = req.body || {};
  const user = findUserByEmail(req.user.email);
  if (!password || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ ok: false, error: 'Mot de passe incorrect' });
  }
  disableMfa(user.id);
  logAudit(req, 'auth.mfa.disabled', {});
  res.json({ ok: true });
}));

function cryptoRandomBackupCode() {
  // 10 caractères alphanumériques majuscules, lisibles à la main (pas de
  // confusion 0/O ou 1/I/L) — un code de secours doit pouvoir être recopié
  // depuis un papier sans ambiguïté.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

router.post('/logout', requireAuth, (req, res) => {
  // Révoque le token courant côté serveur (voir tokenVersion dans
  // requireAuth) : sans ça, un JWT volé avant le logout resterait exploitable
  // jusqu'à son expiration naturelle malgré le cookie effacé.
  incrementTokenVersion(req.user.id);
  clearSessionCookies(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  // homeRestrictedToAdmins vit dans les paramètres console (admin-only en
  // écriture, cf. settings.routes.js) mais doit être lisible par tout compte
  // connecté pour que le frontend sache s'il doit masquer "Vue générale".
  const console_ = readStore('console');
  // Union des permissions de tous les groupes/rôles de l'utilisateur (voir
  // groupsStore.permissionsForUser) : un admin de plateforme n'a pas besoin
  // de groupes, RequirePermission côté frontend applique le même bypass
  // implicite que le middleware backend (role === 'admin').
  const permissions = permissionsForUser(req.user.id);
  res.json({ ok: true, user: { ...req.user, permissions }, homeRestrictedToAdmins: Boolean(console_.homeRestrictedToAdmins) });
});

const THEME_VALUES = ['system', 'light', 'dark', 'schedule'];
const ACCENT_VALUES = ['blue', 'pink', 'purple', 'green', 'orange', 'red', 'teal'];

router.put('/profile', requireAuth, asyncHandler(async (req, res) => {
  const { name, avatarEmoji, avatarColor, avatarImage, theme, accentColor } = req.body || {};
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
  if (accentColor && !ACCENT_VALUES.includes(accentColor)) {
    return res.status(400).json({ ok: false, error: `Accent invalide (attendu: ${ACCENT_VALUES.join(', ')})` });
  }
  // Image et emoji sont mutuellement exclusifs à l'affichage (voir
  // components/ui/Avatar.jsx) : renseigner explicitement l'un efface l'autre,
  // pour ne jamais laisser les deux enregistrés en même temps.
  const body = req.body || {};
  const patch = { name, theme, accentColor };
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
  const policyError = passwordPolicyError(newPassword);
  if (policyError) {
    return res.status(400).json({ ok: false, error: policyError });
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
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      return res.status(400).json({ ok: false, error: policyError });
    }
    updatePassword(req.user.id, hashPassword(newPassword));
  }
  updateUser(req.user.id, { name, avatarEmoji, avatarColor });
  const updated = clearOnboarding(req.user.id);
  logAudit(req, 'auth.onboarding.completed', {});
  res.json({ ok: true, user: toPublicUser(updated) });
}));

export default router;
