import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { getPersonalToken, setPersonalToken, deletePersonalToken } from '../store/personalGitTokensStore.js';
import { logAudit } from '../services/auditService.js';

// Tokens d'accès personnels (ex: GitLab) : gérés par chaque utilisateur pour
// SON propre compte, via la page Compte (frontend/src/pages/Account/
// AccountPage.jsx) — à distinguer de l'intégration GitLab d'instance
// (Paramètres admin, backend/src/routes/settings.routes.js), qui reste un
// compte de service partagé au niveau plateforme. Jamais de lecture croisée :
// req.user.id borne systématiquement chaque opération, y compris pour un
// admin, qui n'a ici aucun accès au token d'un autre utilisateur.
const router = Router();
router.use(requireAuth);

router.get('/:provider', (req, res) => {
  const entry = getPersonalToken(req.user.id, req.params.provider);
  res.json({ ok: true, token: entry });
});

router.put('/:provider', asyncHandler(async (req, res) => {
  const { token, label } = req.body || {};
  if (!token || !String(token).trim()) {
    return res.status(400).json({ ok: false, error: 'Token requis' });
  }
  const entry = setPersonalToken(req.user.id, req.params.provider, String(token).trim(), { label });
  logAudit(req, 'personalToken.set', { provider: req.params.provider });
  res.json({ ok: true, token: entry });
}));

router.delete('/:provider', (req, res) => {
  deletePersonalToken(req.user.id, req.params.provider);
  logAudit(req, 'personalToken.deleted', { provider: req.params.provider });
  res.json({ ok: true });
});

export default router;
