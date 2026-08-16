import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { generateSbom } from '../services/syftService.js';
import { listSboms, recordSbom, getSbom } from '../store/sbomStore.js';
import { logAudit } from '../services/auditService.js';

// Génération de SBOM (Software Bill of Materials) via Syft (open source —
// voir services/syftService.js). Réservé aux admins.
const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', (req, res) => {
  res.json({ ok: true, items: listSboms() });
});

router.get('/:id', (req, res) => {
  const sbom = getSbom(req.params.id);
  if (!sbom) return res.status(404).json({ ok: false, error: 'SBOM introuvable' });
  res.json({ ok: true, sbom });
});

router.post('/', asyncHandler(async (req, res) => {
  const { imageRef } = req.body || {};
  if (!imageRef) return res.status(400).json({ ok: false, error: "Référence d'image requise (ex. nginx:1.27)" });
  const result = await generateSbom(imageRef);
  const entry = recordSbom(result);
  logAudit(req, 'security.sbom.generated', { imageRef, total: result.total });
  res.status(201).json({ ok: true, sbom: entry });
}));

export default router;
