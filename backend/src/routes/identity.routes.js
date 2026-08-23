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
  const { loginCidrAllowlist, mfaRequiredRoles, inactivityTimeoutMinutes } = req.body || {};
  if (loginCidrAllowlist !== undefined) {
    if (!Array.isArray(loginCidrAllowlist) || !loginCidrAllowlist.every(isValidCidr)) {
      return res.status(400).json({ ok: false, error: 'Liste CIDR invalide (attendu : adresses/plages IPv4, ex. 10.0.0.0/24)' });
    }
    // Garde-fou : jamais enregistrer une restriction qui verrouillerait
    // l'administrateur qui l'enregistre hors de la console — il n'existerait
    // alors plus aucun moyen de la retirer sans accès direct au fichier de
    // données. Une liste vide (désactivation) reste toujours autorisée.
    // S'applique désormais à CHAQUE requête authentifiée (middleware/auth.js),
    // pas seulement à la connexion — donc requesterIp doit rester valide
    // aussi pour la requête PUT elle-même qui vient de passer requireAuth.
    const requesterIp = normalizeIp(req.ip);
    if (loginCidrAllowlist.length > 0 && !ipMatchesAnyCidr(requesterIp, loginCidrAllowlist)) {
      return res.status(400).json({ ok: false, error: `Votre propre adresse (${requesterIp}) ne correspond à aucune des plages fournies — refusé pour éviter de vous verrouiller vous-même hors de la console.` });
    }
  }
  if (mfaRequiredRoles !== undefined) {
    const validRoles = ['admin', 'user'];
    if (!Array.isArray(mfaRequiredRoles) || !mfaRequiredRoles.every((r) => validRoles.includes(r))) {
      return res.status(400).json({ ok: false, error: "Rôles invalides (attendu : 'admin' et/ou 'user')" });
    }
    // Garde-fou symétrique au CIDR ci-dessus : jamais imposer le MFA à un
    // rôle si le compte qui enregistre ce réglage (l'admin courant) n'a pas
    // lui-même déjà activé le sien — sans quoi il se bloquerait lui-même dès
    // la requête suivante, sans aucune route d'enrôlement accessible avant
    // d'avoir pu configurer son MFA depuis un état déjà bloqué. Il doit
    // d'abord activer son propre MFA (POST /auth/mfa/setup puis /enable),
    // ENSUITE seulement rendre le MFA obligatoire pour son rôle.
    if (mfaRequiredRoles.includes(req.user.role) && req.user.mfaEnabled !== true) {
      return res.status(400).json({ ok: false, error: `Activez d'abord le MFA sur votre propre compte avant de le rendre obligatoire pour le rôle "${req.user.role}" — sinon vous vous bloqueriez vous-même.` });
    }
  }
  if (inactivityTimeoutMinutes !== undefined) {
    const m = Number(inactivityTimeoutMinutes);
    if (!Number.isInteger(m) || m < 0 || m > 1440) {
      return res.status(400).json({ ok: false, error: "Délai d'inactivité invalide (0 = désactivé, 1 à 1440 minutes)" });
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
