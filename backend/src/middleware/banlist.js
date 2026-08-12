import { isBanned } from '../store/banlistStore.js';

// Bloque toute requête dont l'adresse IP source figure dans la liste bannie
// (Paramètres → ... non, Cybersécurité → IPs bannies). Monté tôt dans la
// chaîne de middlewares pour couper la connexion avant même l'authentification.
export function banlistGuard(req, res, next) {
  if (isBanned(req.ip)) {
    return res.status(403).json({ ok: false, error: 'Accès refusé depuis cette adresse' });
  }
  next();
}
