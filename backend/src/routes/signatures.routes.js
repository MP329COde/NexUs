import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { signBlob, verifyBlob, getPublicKey } from '../services/cosignService.js';
import { getSignature, recordSignature } from '../store/signaturesStore.js';
import { getSbom } from '../store/sbomStore.js';
import { logAudit } from '../services/auditService.js';

// Signature cryptographique réelle (cosign / Sigstore, open source) des SBOM
// générés par Syft. Réservé aux admins.
const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/public-key', asyncHandler(async (req, res) => {
  res.type('text/plain').send(await getPublicKey());
}));

router.get('/sbom/:sbomId', (req, res) => {
  res.json({ ok: true, signature: getSignature(req.params.sbomId) });
});

router.post('/sbom/:sbomId', asyncHandler(async (req, res) => {
  const sbom = getSbom(req.params.sbomId);
  if (!sbom) return res.status(404).json({ ok: false, error: 'SBOM introuvable' });
  const content = JSON.stringify(sbom);
  const { signature, publicKey, algorithm } = await signBlob(content);
  const entry = recordSignature(sbom.id, { signature, publicKey, algorithm });
  logAudit(req, 'security.sbom.signed', { sbomId: sbom.id, imageRef: sbom.imageRef });
  res.status(201).json({ ok: true, signature: entry });
}));

router.post('/sbom/:sbomId/verify', asyncHandler(async (req, res) => {
  const sbom = getSbom(req.params.sbomId);
  if (!sbom) return res.status(404).json({ ok: false, error: 'SBOM introuvable' });
  const entry = getSignature(sbom.id);
  if (!entry) return res.status(404).json({ ok: false, error: 'Aucune signature enregistrée pour ce SBOM' });
  const valid = await verifyBlob(JSON.stringify(sbom), entry.signature);
  res.json({ ok: true, valid });
}));

export default router;
