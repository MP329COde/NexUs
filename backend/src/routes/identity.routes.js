import { Router } from 'express';
import axios from 'axios';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { getRedacted, save } from '../store/identityStore.js';
import { logAudit } from '../services/auditService.js';

// Politique de connexion + configuration SSO : réservé aux administrateurs.
const router = Router();
router.use(requireAuth, requirePermission('identity', 'admin'));

router.get('/', (req, res) => {
  res.json({ ok: true, identity: getRedacted() });
});

router.put('/', asyncHandler(async (req, res) => {
  const { sessionMinutes, minPasswordLength } = req.body || {};
  if (sessionMinutes !== undefined) {
    const m = Number(sessionMinutes);
    if (!Number.isInteger(m) || m < 5 || m > 10080) {
      return res.status(400).json({ ok: false, error: 'Durée de session invalide (5 à 10080 minutes)' });
    }
  }
  if (minPasswordLength !== undefined) {
    const l = Number(minPasswordLength);
    if (!Number.isInteger(l) || l < 8 || l > 128) {
      return res.status(400).json({ ok: false, error: 'Longueur de mot de passe invalide (8 à 128)' });
    }
  }
  const identity = save(req.body || {});
  logAudit(req, 'identity.update', { fields: Object.keys(req.body || {}) });
  res.json({ ok: true, identity });
}));

// Vérifie que l'issuer OIDC déclaré expose bien un document de découverte
// valide (.well-known/openid-configuration) — un vrai test réseau, pas une
// simulation, mais qui ne fait pas de la console un client OIDC actif.
router.post('/test-oidc', asyncHandler(async (req, res) => {
  const { oidcIssuer } = req.body || {};
  if (!oidcIssuer) return res.status(400).json({ ok: false, error: 'Issuer OIDC requis' });
  const url = `${oidcIssuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
  try {
    const response = await axios.get(url, { timeout: 5000 });
    const hasAuthEndpoint = Boolean(response.data?.authorization_endpoint);
    res.json({
      ok: hasAuthEndpoint,
      message: hasAuthEndpoint
        ? `Document de découverte valide (${response.data.authorization_endpoint})`
        : 'Réponse reçue mais sans authorization_endpoint : vérifiez l\'issuer.'
    });
  } catch (err) {
    res.json({ ok: false, message: `Impossible de joindre ${url} : ${err.message}` });
  }
}));

export default router;
