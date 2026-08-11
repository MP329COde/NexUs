import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { signSession, SESSION_COOKIE } from '../middleware/auth.js';
import { hasAnyUser, createUser } from '../store/usersStore.js';
import { readStore, writeStore } from '../store/jsonStore.js';
import { env } from '../config/env.js';

// Non authentifié par nature : tant qu'aucun utilisateur n'existe, la console
// n'a pas encore de secret à protéger. Chaque route revérifie hasAnyUser() pour
// qu'un compte admin ne puisse jamais être recréé une fois la console initialisée.
const router = Router();

router.get('/status', (req, res) => {
  res.json({ ok: true, needsSetup: !hasAnyUser() });
});

router.post('/', asyncHandler(async (req, res) => {
  if (hasAnyUser()) {
    return res.status(409).json({ ok: false, error: 'La console est déjà configurée' });
  }
  const { consoleName, email, password, name } = req.body || {};
  if (!email || !password || password.length < 8) {
    return res.status(400).json({ ok: false, error: 'E-mail requis et mot de passe d\'au moins 8 caractères' });
  }
  const user = createUser({ email, password, name, role: 'admin' });
  if (consoleName) writeStore('console', { ...readStore('console'), name: consoleName });

  const token = signSession(user);
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: env.isProd, maxAge: 12 * 60 * 60 * 1000 });
  res.status(201).json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}));

export default router;
