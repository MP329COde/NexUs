import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { signSession, SESSION_COOKIE, toPublicUser, requireAuth, requireRole } from '../middleware/auth.js';
import { hasAnyUser, createUser } from '../store/usersStore.js';
import { readStore, writeStore } from '../store/jsonStore.js';
import { save as saveIdentity, getSessionMinutes } from '../store/identityStore.js';
import { saveIntegration } from '../store/settingsStore.js';
import { logAudit } from '../services/auditService.js';
import { startInstall, getJobs } from '../services/provisioningService.js';
import { listInstallableIds } from '../services/serviceCatalog.js';

// Non authentifié par nature : tant qu'aucun utilisateur n'existe, la console
// n'a pas encore de secret à protéger. Chaque route revérifie hasAnyUser() pour
// qu'un compte admin ne puisse jamais être recréé une fois la console initialisée.
const router = Router();

const GIT_FORGES = ['gitea', 'gitlab', 'github'];
// Catalogue des identifiants d'outils proposés à l'étape 5 — tenu en phase
// avec la liste statique côté frontend (pages/Setup/SetupPage.jsx). Toute
// entrée hors de cette liste envoyée par le client est silencieusement ignorée.
const TOOL_IDS = [
  'wazuh', 'prometheus', 'grafana', 'loki', 'alertmanager', 'zabbix',
  'uptime-kuma', 'netdata', 'influxdb', 'suricata', 'crowdsec', 'openvas',
  'trivy', 'vault', 'step-ca', 'authentik', 'keycloak', 'gitea', 'gitlab',
  'github', 'woodpecker', 'jenkins', 'sonarqube', 'harbor'
];

router.get('/status', (req, res) => {
  res.json({ ok: true, needsSetup: !hasAnyUser() });
});

router.post('/', asyncHandler(async (req, res) => {
  if (hasAnyUser()) {
    return res.status(409).json({ ok: false, error: 'La console est déjà configurée' });
  }

  const { organisation = {}, admin = {}, identity = {}, git = {}, tools = [] } = req.body || {};

  const { email, password, confirm, name, username } = admin;
  if (!email || !password || password.length < 8) {
    return res.status(400).json({ ok: false, error: "E-mail requis et mot de passe d'au moins 8 caractères" });
  }
  if (confirm !== undefined && confirm !== password) {
    return res.status(400).json({ ok: false, error: 'Les mots de passe ne correspondent pas' });
  }

  // Organisation : fusionnée avec les valeurs par défaut du store plutôt que
  // remplacée, pour ne jamais perdre baseDomain (utilisé ailleurs dans la console).
  const enabledTools = Array.isArray(tools) ? tools.filter((id) => TOOL_IDS.includes(id)) : [];
  writeStore('console', {
    ...readStore('console'),
    name: organisation.consoleName || 'Nexus Console',
    instanceUrl: organisation.instanceUrl || '',
    timezone: organisation.timezone || 'Europe/Paris',
    language: organisation.language || 'fr',
    dateFormat: organisation.dateFormat || 'dd/MM/yyyy',
    contactEmail: organisation.contactEmail || '',
    enabledTools
  });

  // Politique de connexion + fournisseur d'identité : mêmes clés que
  // PUT /api/identity (voir store/identityStore.js), enregistrées telles
  // quelles même si certaines (MFA, réseaux autorisés) ne sont pas encore
  // appliquées côté authentification — cf. le commentaire de identityStore.js.
  if (identity.sessionMinutes !== undefined) {
    const m = Number(identity.sessionMinutes);
    if (!Number.isInteger(m) || m < 5 || m > 10080) {
      return res.status(400).json({ ok: false, error: 'Durée de session invalide (5 à 10080 minutes)' });
    }
  }
  if (identity.minPasswordLength !== undefined) {
    const l = Number(identity.minPasswordLength);
    if (!Number.isInteger(l) || l < 8 || l > 128) {
      return res.status(400).json({ ok: false, error: 'Longueur de mot de passe invalide (8 à 128)' });
    }
  }
  saveIdentity({
    provider: identity.provider || 'none',
    sessionMinutes: identity.sessionMinutes,
    minPasswordLength: identity.minPasswordLength,
    mfaRequired: Boolean(identity.mfaRequired),
    allowedNetworks: identity.allowedNetworks || '',
    logoutOnInactivity: identity.logoutOnInactivity !== false
  });

  // Services Git : n'enregistre l'intégration que si une forge a été choisie
  // et qu'au moins l'URL est renseignée (évite de créer une entrée vide).
  const forge = GIT_FORGES.includes(git.forge) ? git.forge : null;
  if (forge && git.baseUrl) {
    saveIntegration(forge, {
      baseUrl: git.baseUrl,
      org: git.org || '',
      token: git.token || '',
      defaultBranch: git.defaultBranch || 'main',
      autoWebhooks: Boolean(git.autoWebhooks),
      outboundMirrors: Boolean(git.outboundMirrors),
      requireSignedCommits: Boolean(git.requireSignedCommits)
    });
  }

  const user = createUser({ email, password, name, username, role: 'admin' });

  const token = signSession(user);
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: getSessionMinutes() * 60 * 1000 });
  logAudit({ user: toPublicUser(user), ip: req.ip }, 'setup.completed', { forge, toolsCount: enabledTools.length });
  res.status(201).json({ ok: true, user: toPublicUser(user) });
}));

// Installation automatique des outils sélectionnés à l'étape 5 : n'est
// accessible qu'une fois l'administrateur créé (cookie de session posé par
// la route ci-dessus), donc protégée comme le reste de la console — voir
// pages/Setup/InstallScreen.jsx pour l'écran qui déclenche puis suit ces jobs.
router.get('/provision/catalog', requireAuth, requireRole('admin'), (req, res) => {
  res.json({ ok: true, installable: listInstallableIds() });
});

router.post('/provision', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { tools = [] } = req.body || {};
  if (!Array.isArray(tools) || tools.length === 0) {
    return res.status(400).json({ ok: false, error: 'Aucun outil à installer' });
  }
  const startedJobs = tools.map(({ toolId, address, port, sshUser }) => {
    try {
      return startInstall({ toolId, address, port, sshUser });
    } catch (err) {
      return { id: null, toolId, status: 'error', message: err.message };
    }
  });
  logAudit(req, 'setup.provision.start', { count: startedJobs.length, tools: startedJobs.map((j) => j.toolId) });
  res.status(202).json({ ok: true, jobs: startedJobs });
}));

router.get('/provision/status', requireAuth, requireRole('admin'), (req, res) => {
  const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',').filter(Boolean) : undefined;
  res.json({ ok: true, jobs: getJobs(ids) });
});

export default router;
