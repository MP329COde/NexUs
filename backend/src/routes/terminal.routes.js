import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { runCommand, resolveTier, allowedVerbs } from '../services/terminalService.js';
import { logAudit } from '../services/auditService.js';
import { setTerminalTier } from '../store/usersStore.js';
import { createNotification } from '../store/notificationsStore.js';
import { listPending, findPendingForUser, createRequest, decideRequest } from '../store/terminalAccessRequestsStore.js';

const router = Router();
router.use(requireAuth);

const REQUESTABLE_TIERS = ['developer', 'maintainer'];

router.get('/permissions', (req, res) => {
  const tier = resolveTier(req.user);
  res.json({ ok: true, tier, verbs: allowedVerbs(tier) });
});

// Demande d'accès en self-service : remplace le parcours "demandez en
// personne à un administrateur". Une seule demande en attente par
// utilisateur à la fois (voir findPendingForUser) — la reproposer alors
// qu'une décision n'a pas encore été prise n'a pas de sens.
router.get('/access-request', (req, res) => {
  res.json({ ok: true, pending: findPendingForUser(req.user.id) });
});

router.post('/access-request', asyncHandler(async (req, res) => {
  const { tier, reason } = req.body || {};
  if (!REQUESTABLE_TIERS.includes(tier)) {
    return res.status(400).json({ ok: false, error: `Palier invalide (attendu : ${REQUESTABLE_TIERS.join(', ')})` });
  }
  if (findPendingForUser(req.user.id)) {
    return res.status(409).json({ ok: false, error: 'Une demande est déjà en attente pour votre compte' });
  }
  const entry = createRequest({ userId: req.user.id, userEmail: req.user.email, userName: req.user.name, requestedTier: tier, reason });
  logAudit(req, 'terminal.access.requested', { tier, requestId: entry.id });
  createNotification({
    type: 'terminal.access.requested', severity: 'info', title: 'Demande d\'accès terminal',
    message: `${req.user.name} (${req.user.email}) demande le palier ${tier} du terminal sécurisé.`,
    meta: { requestId: entry.id, userId: req.user.id, tier }
  });
  res.status(201).json({ ok: true, request: entry });
}));

// Décisions : réservées aux admins, comme l'attribution manuelle du palier
// (routes/users.routes.js PUT /:id/terminal-tier, chemin toujours disponible
// en parallèle de ce parcours self-service).
router.get('/access-requests', requireRole('admin'), (req, res) => {
  res.json({ ok: true, items: listPending() });
});

router.post('/access-requests/:id/decide', requireRole('admin'), asyncHandler(async (req, res) => {
  const { approve } = req.body || {};
  const entry = decideRequest(req.params.id, { approve: Boolean(approve), decidedBy: req.user.email });
  if (!entry) return res.status(404).json({ ok: false, error: 'Demande introuvable' });
  if (approve) setTerminalTier(entry.userId, entry.requestedTier);
  logAudit(req, 'terminal.access.decided', { requestId: entry.id, approve: Boolean(approve), userId: entry.userId, tier: entry.requestedTier });
  res.json({ ok: true, request: entry });
}));

// Chaque commande est journalisée qu'elle réussisse ou échoue (y compris un
// refus de permission) — "audit, utilisateur, IP, date, commande, résultat"
// vit dans le même journal que le reste de la console (logAudit), pas un
// système séparé qui pourrait être oublié en cours de route.
router.post('/run', asyncHandler(async (req, res) => {
  const { command, manifest } = req.body || {};
  if (!command || typeof command !== 'string') return res.status(400).json({ ok: false, error: 'command requis' });
  try {
    const result = await runCommand(req.user, command, manifest);
    logAudit(req, 'terminal.command', { command, tier: resolveTier(req.user), ok: true });
    res.json({ ok: true, result });
  } catch (err) {
    logAudit(req, 'terminal.command', { command, tier: resolveTier(req.user), ok: false, error: err.message });
    throw err;
  }
}));

export default router;
