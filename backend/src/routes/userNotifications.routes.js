import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as service from '../services/userNotificationService.js';

// Notifications persistantes de développement, pour TOUT utilisateur
// authentifié (pas seulement les admins, contrairement à /notifications qui
// reste réservé aux alertes de sécurité) — tâche assignée, revue demandée,
// pipeline échoué... survivent à un rechargement de page ou une
// déconnexion. Voir services/userNotificationService.js.
const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const items = await service.listForUser(req.user.id);
  const unreadCount = await service.countUnread(req.user.id);
  res.json({ ok: true, items, unreadCount });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  const entry = await service.markRead(req.user.id, req.params.id);
  if (!entry) return res.status(404).json({ ok: false, error: 'Notification introuvable' });
  res.json({ ok: true, entry });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  const changed = await service.markAllRead(req.user.id);
  res.json({ ok: true, changed });
}));

export default router;
