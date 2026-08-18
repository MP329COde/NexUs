import { Router } from 'express';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, toPublicUser, issueSessionCookies } from '../middleware/auth.js';
import { findUserById, findUserByIdentifier, recordLoginSuccess } from '../store/usersStore.js';
import { listCredentialsForUser, findCredentialById, addCredential, updateCounter, removeCredential } from '../store/webauthnStore.js';
import { env } from '../config/env.js';
import { logAudit } from '../services/auditService.js';

// Clés d'accès (passkeys WebAuthn/FIDO2) — authentification cryptographique
// réelle (ECDSA/RSA selon l'authentificateur), en complément de la connexion
// par mot de passe déjà en place (jamais un remplacement obligatoire : un
// compte sans passkey enregistrée continue de se connecter normalement).
// Bibliothèque de référence @simplewebauthn (server + browser), jamais de
// vérification de signature maison.
const router = Router();

const RP_NAME = 'Nexus Console';
const RP_ID = new URL(env.frontendOrigin).hostname;
const ORIGIN = env.frontendOrigin;

// Défis de cérémonie WebAuthn : courte durée de vie, jamais persistés au
// disque (contrairement aux credentials eux-mêmes) — perdre ces défis au
// redémarrage du serveur ne fait qu'obliger à relancer la cérémonie en cours.
const CHALLENGE_TTL_MS = 5 * 60_000;
const challenges = new Map();

function putChallenge(key, challenge) {
  challenges.set(key, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}
function takeChallenge(key) {
  const entry = challenges.get(key);
  challenges.delete(key);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.challenge;
}

router.get('/credentials', requireAuth, (req, res) => {
  const items = listCredentialsForUser(req.user.id).map((c) => ({
    id: c.id, label: c.label, deviceType: c.deviceType, backedUp: c.backedUp,
    createdAt: c.createdAt, lastUsedAt: c.lastUsedAt
  }));
  res.json({ ok: true, items });
});

router.delete('/credentials/:id', requireAuth, (req, res) => {
  const removed = removeCredential(req.user.id, req.params.id);
  if (!removed) return res.status(404).json({ ok: false, error: 'Clé introuvable' });
  logAudit(req, 'auth.webauthn.credential.removed', { credentialRecordId: req.params.id });
  res.json({ ok: true });
});

router.post('/register-options', requireAuth, asyncHandler(async (req, res) => {
  const existing = listCredentialsForUser(req.user.id);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: req.user.email,
    userDisplayName: req.user.name || req.user.email,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: c.transports })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' }
  });
  putChallenge(`register:${req.user.id}`, options.challenge);
  res.json({ ok: true, options });
}));

router.post('/register-verify', requireAuth, asyncHandler(async (req, res) => {
  const { response, label } = req.body || {};
  const expectedChallenge = takeChallenge(`register:${req.user.id}`);
  if (!expectedChallenge) return res.status(400).json({ ok: false, error: 'Cérémonie expirée, relancez l\'enregistrement' });

  let verification;
  try {
    verification = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID });
  } catch (err) {
    return res.status(400).json({ ok: false, error: `Vérification échouée : ${err.message}` });
  }
  if (!verification.verified || !verification.registrationInfo) {
    return res.status(400).json({ ok: false, error: 'Enregistrement non vérifié' });
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  addCredential({
    userId: req.user.id,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    transports: credential.transports,
    label: (label || '').trim() || undefined
  });
  logAudit(req, 'auth.webauthn.credential.registered', { credentialId: credential.id });
  res.status(201).json({ ok: true });
}));

router.post('/login-options', asyncHandler(async (req, res) => {
  const { identifier } = req.body || {};
  const user = identifier && findUserByIdentifier(identifier);
  // Toujours renvoyer des options valides même si l'utilisateur/les clés
  // n'existent pas (allowCredentials vide laisse le navigateur proposer les
  // passkeys "découvrables" qu'il connaît) — évite de révéler par le timing
  // ou le contenu de la réponse si un identifiant existe ou non.
  const credentials = user ? listCredentialsForUser(user.id) : [];
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'preferred',
    allowCredentials: credentials.length ? credentials.map((c) => ({ id: c.credentialId, transports: c.transports })) : undefined
  });
  const requestId = `login:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  putChallenge(requestId, options.challenge);
  res.json({ ok: true, requestId, options });
}));

router.post('/login-verify', asyncHandler(async (req, res) => {
  const { requestId, response } = req.body || {};
  const expectedChallenge = requestId && takeChallenge(requestId);
  if (!expectedChallenge) return res.status(400).json({ ok: false, error: 'Cérémonie expirée, relancez la connexion' });

  const record = response?.id && findCredentialById(response.id);
  if (!record) return res.status(400).json({ ok: false, error: 'Clé d\'accès inconnue' });
  const user = findUserById(record.userId);
  if (!user || user.active === false) return res.status(401).json({ ok: false, error: 'Compte indisponible' });

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response, expectedChallenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID,
      credential: { id: record.credentialId, publicKey: Buffer.from(record.publicKey, 'base64url'), counter: record.counter, transports: record.transports }
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: `Vérification échouée : ${err.message}` });
  }
  if (!verification.verified) return res.status(400).json({ ok: false, error: 'Authentification non vérifiée' });

  updateCounter(record.credentialId, verification.authenticationInfo.newCounter);
  recordLoginSuccess(user.id);
  issueSessionCookies(res, req, user);
  logAudit({ user: toPublicUser(user), ip: req.ip }, 'auth.webauthn.login', { credentialId: record.credentialId });
  res.json({ ok: true, user: toPublicUser(user) });
}));

export default router;
