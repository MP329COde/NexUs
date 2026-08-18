import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { toPublicUser, requireAuth, requireRole, issueSessionCookies } from '../middleware/auth.js';
import { hasAnyUser, createUser } from '../store/usersStore.js';
import { readStore, writeStore } from '../store/jsonStore.js';
import { logAudit } from '../services/auditService.js';
import { startInstall, getJobs } from '../services/provisioningService.js';
import { listInstallableIds } from '../services/serviceCatalog.js';
import { pool } from '../db/pool.js';

// Non authentifié par nature : tant qu'aucun utilisateur n'existe, la console
// n'a pas encore de secret à protéger. Chaque route revérifie hasAnyUser() pour
// qu'un compte admin ne puisse jamais être recréé une fois la console initialisée.
const router = Router();

router.get('/status', (req, res) => {
  // postgresConfigured : reflète honnêtement si le socle organisations /
  // projets / environnements à rôles granulaires (voir db/, store/orgStore.js)
  // est disponible. false n'empêche jamais l'installation ni l'usage du
  // reste de la console — seule cette brique reste dégradée en mode legacy
  // (isolation par appartenance simple, sans rôle fin) tant que DATABASE_URL
  // n'est pas défini.
  res.json({ ok: true, needsSetup: !hasAnyUser(), postgresConfigured: Boolean(pool) });
});

// Ne crée plus que l'organisation + le compte administrateur : c'est la
// seule étape qui doit précéder l'ouverture d'une session, car toute la
// suite de l'assistant (identité, forge Git, services réels) réutilise
// ensuite les routes authentifiées standard (PUT /identity, PUT/POST
// /settings/:key) exactement comme le fait Paramètres après coup — plutôt
// que de dupliquer leur logique ici. Cela permet aussi de tester une vraie
// connexion (Kubernetes, GitLab, Proxmox...) DURANT l'assistant, avant
// d'ouvrir la console, ce qu'un unique appel final ne permettait pas.
router.post('/', asyncHandler(async (req, res) => {
  if (hasAnyUser()) {
    return res.status(409).json({ ok: false, error: 'La console est déjà configurée' });
  }

  const { organisation = {}, admin = {} } = req.body || {};

  const { email, password, confirm, name, username } = admin;
  if (!email || !password || password.length < 8) {
    return res.status(400).json({ ok: false, error: "E-mail requis et mot de passe d'au moins 8 caractères" });
  }
  if (confirm !== undefined && confirm !== password) {
    return res.status(400).json({ ok: false, error: 'Les mots de passe ne correspondent pas' });
  }

  // Organisation : fusionnée avec les valeurs par défaut du store plutôt que
  // remplacée, pour ne jamais perdre baseDomain (utilisé ailleurs dans la console).
  writeStore('console', {
    ...readStore('console'),
    name: organisation.consoleName || 'Nexus Console',
    instanceUrl: organisation.instanceUrl || '',
    timezone: organisation.timezone || 'Europe/Paris',
    language: organisation.language || 'fr',
    dateFormat: organisation.dateFormat || 'dd/MM/yyyy',
    contactEmail: organisation.contactEmail || ''
  });

  const user = createUser({ email, password, name, username, role: 'admin' });

  issueSessionCookies(res, req, user);
  logAudit({ user: toPublicUser(user), ip: req.ip }, 'setup.completed', {});
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
  const startedJobs = await Promise.all(tools.map(async ({ toolId, address, port, sshUser }) => {
    try {
      return await startInstall({ toolId, address, port, sshUser });
    } catch (err) {
      return { id: null, toolId, status: 'error', message: err.message };
    }
  }));
  logAudit(req, 'setup.provision.start', { count: startedJobs.length, tools: startedJobs.map((j) => j.toolId) });
  res.status(202).json({ ok: true, jobs: startedJobs });
}));

router.get('/provision/status', requireAuth, requireRole('admin'), (req, res) => {
  const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',').filter(Boolean) : undefined;
  res.json({ ok: true, jobs: getJobs(ids) });
});

export default router;
