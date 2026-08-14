import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { runCommand, resolveTier, allowedVerbs } from '../services/terminalService.js';
import { logAudit } from '../services/auditService.js';

const router = Router();
router.use(requireAuth);

router.get('/permissions', (req, res) => {
  const tier = resolveTier(req.user);
  res.json({ ok: true, tier, verbs: allowedVerbs(tier) });
});

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
