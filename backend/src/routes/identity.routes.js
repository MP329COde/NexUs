import { Router } from 'express';
import axios from 'axios';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { getRedacted, save } from '../store/identityStore.js';
import { logAudit } from '../services/auditService.js';
import { isValidCidr, ipMatchesAnyCidr } from '../utils/cidr.js';
import { normalizeIp } from '../store/banlistStore.js';

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
  const { loginCidrAllowlist } = req.body || {};
  if (loginCidrAllowlist !== undefined) {
    if (!Array.isArray(loginCidrAllowlist) || !loginCidrAllowlist.every(isValidCidr)) {
      return res.status(400).json({ ok: false, error: 'Liste CIDR invalide (attendu : adresses/plages IPv4, ex. 10.0.0.0/24)' });
    }
    // Garde-fou : jamais enregistrer une restriction qui verrouillerait
    // l'administrateur qui l'enregistre hors de la console — il n'existerait
    // alors plus aucun moyen de la retirer sans accès direct au fichier de
    // données. Une liste vide (désactivation) reste toujours autorisée.
    const requesterIp = normalizeIp(req.ip);
    if (loginCidrAllowlist.length > 0 && !ipMatchesAnyCidr(requesterIp, loginCidrAllowlist)) {
      return res.status(400).json({ ok: false, error: `Votre propre adresse (${requesterIp}) ne correspond à aucune des plages fournies — refusé pour éviter de vous verrouiller vous-même hors de la console.` });
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
