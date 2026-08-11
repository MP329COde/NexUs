import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, signSession, SESSION_COOKIE } from '../middleware/auth.js';
import { findUserByEmail } from '../store/usersStore.js';
import { verifyPassword } from '../utils/crypto.js';
import { env } from '../config/env.js';

const router = Router();

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  const user = email && findUserByEmail(email);
  if (!user || !verifyPassword(password || '', user.passwordHash)) {
    return res.status(401).json({ ok: false, error: 'Identifiants invalides' });
  }
  const token = signSession(user);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    maxAge: 12 * 60 * 60 * 1000
  });
  res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}));

router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

export default router;
