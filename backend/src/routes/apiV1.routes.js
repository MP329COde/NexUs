import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireServiceAccount, requireScope } from '../middleware/serviceAuth.js';
import { pool } from '../db/pool.js';
import * as orgStore from '../store/orgStore.js';

// API publique (ÉTAPE 24 IDP, en commun avec ÉTAPE 23 — Service Accounts) :
// authentification exclusivement par jeton de service (Authorization:
// Bearer nxs_sa_...), jamais par session de navigateur — c'est le point
// d'entrée destiné à la CI/CD externe, pas à la console elle-même (qui
// continue d'utiliser les routes existantes avec requireAuth). Un seul
// endpoint réel pour l'instant (catalog:read) : mieux vaut une surface
// étroite entièrement réelle et testée qu'une façade large avec des scopes
// qui ne vérifient rien.
const router = Router();

router.use((req, res, next) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'Socle organisations indisponible (DATABASE_URL non configuré)' });
  next();
});
router.use(requireServiceAccount);

router.get('/catalog/components', requireScope('catalog:read'), asyncHandler(async (req, res) => {
  const items = await orgStore.listComponentsForOrg(req.serviceAccount.org_id);
  res.json({ ok: true, items });
}));

export default router;
