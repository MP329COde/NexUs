import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { findUserById } from '../store/usersStore.js';

export const SESSION_COOKIE = 'nexus_session';

export function signSession(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: '12h' });
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ ok: false, error: 'Authentification requise' });
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = findUserById(payload.sub);
    if (!user) return res.status(401).json({ ok: false, error: 'Session invalide' });
    req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Session expirée ou invalide' });
  }
}
