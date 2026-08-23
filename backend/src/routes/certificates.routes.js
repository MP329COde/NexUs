import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { saveIntegration, getTlsMode, setTlsMode } from '../store/settingsStore.js';
import { logAudit } from '../services/auditService.js';
import {
  TLS_INTEGRATIONS,
  listTlsIntegrationKeys,
  diagnoseIntegration,
  validateCaCertPem
} from '../services/tlsDiagnosticsService.js';

// Lot B4 (Certificats) : écran centralisé regroupant, pour toutes les
// intégrations HTTPS configurables, le statut TLS réel (pas de données
// inventées), l'import de CA personnalisée, et le mode de vérification
// global. Réservé aux administrateurs, même garde que /settings.
const router = Router();
router.use(requireAuth, requirePermission('settings', 'admin'));

function assertKey(key) {
  if (!TLS_INTEGRATIONS[key]) {
    throw Object.assign(new Error(`Intégration TLS inconnue: ${key}`), { status: 400 });
  }
}

router.get('/mode', asyncHandler(async (req, res) => {
  res.json({ ok: true, mode: getTlsMode() });
}));

router.put('/mode', asyncHandler(async (req, res) => {
  const next = setTlsMode(req.body?.mode);
  logAudit(req, 'settings.tls_mode.update', { mode: next.mode });
  res.json({ ok: true, ...next });
}));

// Liste toutes les intégrations TLS-configurables avec leur statut de
// certificat réel : une connexion TLS est effectivement tentée pour chacune
// (en parallèle) — si l'hôte est injoignable, le statut le reflète, sans
// inventer de sujet/émetteur/expiration.
router.get('/', asyncHandler(async (req, res) => {
  const items = await Promise.all(listTlsIntegrationKeys().map((key) => diagnoseIntegration(key)));
  res.json({ ok: true, items });
}));

router.get('/:key', asyncHandler(async (req, res) => {
  assertKey(req.params.key);
  const item = await diagnoseIntegration(req.params.key);
  res.json({ ok: true, item });
}));

// Relance à la demande (bouton "Test TLS") — identique au GET par clé,
// exposé en POST pour signaler explicitement une action déclenchée par
// l'utilisateur plutôt qu'un simple chargement de page.
router.post('/:key/test', asyncHandler(async (req, res) => {
  assertKey(req.params.key);
  const item = await diagnoseIntegration(req.params.key);
  res.json({ ok: true, item });
}));

router.post('/:key/ca', asyncHandler(async (req, res) => {
  assertKey(req.params.key);
  const key = req.params.key;
  if (!TLS_INTEGRATIONS[key].supportsCaImport) {
    return res.status(400).json({ ok: false, error: `${TLS_INTEGRATIONS[key].label} ne supporte pas l'import de CA personnalisée dans cette version.` });
  }
  const info = validateCaCertPem(req.body?.caCertPem);
  saveIntegration(key, { caCertPem: req.body.caCertPem });
  logAudit(req, 'settings.certificates.ca_import', { key, subject: info.subject });
  res.json({ ok: true, certificate: info });
}));

router.delete('/:key/ca', asyncHandler(async (req, res) => {
  assertKey(req.params.key);
  const key = req.params.key;
  saveIntegration(key, { caCertPem: null });
  logAudit(req, 'settings.certificates.ca_remove', { key });
  res.json({ ok: true });
}));

export default router;
