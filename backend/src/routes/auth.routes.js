import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, signSession, toPublicUser, SESSION_COOKIE } from '../middleware/auth.js';
import { findUserByEmail, updateUser, updatePassword } from '../store/usersStore.js';
import { verifyPassword, hashPassword } from '../utils/crypto.js';
import { logAudit } from '../services/auditService.js';

const router = Router();
const AVATAR_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  const user = email && findUserByEmail(email);
  if (!user || user.active === false || !verifyPassword(password || '', user.passwordHash)) {
    logAudit({ user: { email }, ip: req.ip }, 'auth.login.failed', {});
    return res.status(401).json({ ok: false, error: 'Identifiants invalides' });
  }
  const token = signSession(user);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Reflète la connexion réelle (via X-Forwarded-Proto derrière nginx/Traefik,
    // cf. trust proxy dans index.js) plutôt qu'un simple NODE_ENV : sur un LAN
    // homelab sans TLS, un cookie "Secure" ne serait jamais renvoyé par le
    // navigateur et la connexion échouerait silencieusement.
    secure: req.secure,
    maxAge: 12 * 60 * 60 * 1000
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
  const { name, avatarEmoji, avatarColor, theme } = req.body || {};
  if (avatarColor && !AVATAR_COLOR_PATTERN.test(avatarColor)) {
    return res.status(400).json({ ok: false, error: 'Couleur invalide (format #RRGGBB attendu)' });
  }
  if (avatarEmoji && [...avatarEmoji].length > 2) {
    return res.status(400).json({ ok: false, error: 'Avatar trop long (1 à 2 caractères/emoji)' });
  }
  if (theme && !THEME_VALUES.includes(theme)) {
    return res.status(400).json({ ok: false, error: `Thème invalide (attendu: ${THEME_VALUES.join(', ')})` });
  }
  const updated = updateUser(req.user.id, { name, avatarEmoji, avatarColor, theme });
  res.json({ ok: true, user: toPublicUser(updated) });
}));

router.put('/password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ ok: false, error: 'Le nouveau mot de passe doit contenir au moins 8 caractères' });
  }
  const user = findUserByEmail(req.user.email);
  if (!verifyPassword(currentPassword || '', user.passwordHash)) {
    return res.status(401).json({ ok: false, error: 'Mot de passe actuel incorrect' });
  }
  updatePassword(user.id, hashPassword(newPassword));
  logAudit(req, 'auth.password.changed', {});
  res.json({ ok: true });
}));

export default router;
