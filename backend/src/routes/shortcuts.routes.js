import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as store from '../store/shortcutsStore.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => res.json({ ok: true, items: store.listShortcuts() }));

router.post('/', asyncHandler(async (req, res) => {
  const { label, url, category } = req.body || {};
  if (!label || !url) return res.status(400).json({ ok: false, error: 'Nom et URL requis' });
  res.status(201).json({ ok: true, shortcut: store.createShortcut({ label, url, category }) });
}));

router.delete('/:id', (req, res) => {
  if (!store.deleteShortcut(req.params.id)) return res.status(404).json({ ok: false, error: 'Raccourci introuvable' });
  res.json({ ok: true });
});

router.post('/:id/open', (req, res) => {
  const shortcut = store.recordOpen(req.params.id);
  if (!shortcut) return res.status(404).json({ ok: false, error: 'Raccourci introuvable' });
  res.json({ ok: true, shortcut });
});

export default router;
