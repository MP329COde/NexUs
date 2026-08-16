import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listNotifications, markRead, markAllRead, unreadCount } from '../store/notificationsStore.js';

// Notifications persistantes d'événements de sécurité — réservées aux
// admins, comme les événements qui les déclenchent (verrouillage de compte,
// bannissement IP, secret committé, vulnérabilité critique).
const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', (req, res) => {
  res.json({ ok: true, items: listNotifications().slice(0, 50), unreadCount: unreadCount() });
});

router.post('/:id/read', (req, res) => {
  const entry = markRead(req.params.id);
  if (!entry) return res.status(404).json({ ok: false, error: 'Notification introuvable' });
  res.json({ ok: true, entry });
});

router.post('/read-all', (req, res) => {
  const changed = markAllRead();
  res.json({ ok: true, changed });
});

export default router;
