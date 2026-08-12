import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { readStore } from '../store/jsonStore.js';

// Nom de l'organisation seul (non sensible) : accessible à tout utilisateur
// connecté pour l'affichage dans le header, contrairement à /settings/console
// (réservé aux admins, qui expose la configuration complète).
const router = Router();

router.get('/', requireAuth, (req, res) => {
  const console_ = readStore('console');
  res.json({ ok: true, name: console_.name || 'Nexus Console' });
});

export default router;
