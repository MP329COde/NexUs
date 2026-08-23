import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { getAllRedacted, getRedactedIntegration, saveIntegration, INTEGRATION_KEYS, SECRET_FIELDS, getNetworkConfig, setCentralDomain, getRawIntegration } from '../store/settingsStore.js';
import { integrations, notificationWebhookService } from '../services/integrationRegistry.js';
import { readStore, writeStore } from '../store/jsonStore.js';
import { logAudit } from '../services/auditService.js';

// Connexions à l'infrastructure (tokens, URLs...) : réservé aux administrateurs.
// Les préférences propres à chaque utilisateur vivent dans /api/auth/profile.
const router = Router();
router.use(requireAuth, requirePermission('settings', 'admin'));

router.get('/', asyncHandler(async (req, res) => {
  res.json({ ok: true, integrations: getAllRedacted(), console: readStore('console') });
}));

router.put('/console', asyncHandler(async (req, res) => {
  const next = writeStore('console', { ...readStore('console'), ...req.body });
  res.json({ ok: true, console: next });
}));

// Domaine central (Lot C3) : n'est réellement exploitable que si HAProxy OU
// Traefik est configuré (même logique de détection que
// services/networkTopologyService.js#getTopology, réutilisée ici plutôt que
// dupliquée : `dataPlaneUrl` pour HAProxy, `apiUrl` pour Traefik).
router.get('/network', asyncHandler(async (req, res) => {
  const haproxyCfg = getRawIntegration('haproxy');
  const traefikCfg = getRawIntegration('traefik');
  const ovhCfg = getRawIntegration('ovh');
  const duckdnsCfg = getRawIntegration('duckdns');
  res.json({
    ok: true,
    network: {
      ...getNetworkConfig(),
      proxyAvailable: Boolean(haproxyCfg.dataPlaneUrl || traefikCfg.apiUrl),
      haproxyConfigured: Boolean(haproxyCfg.dataPlaneUrl),
      traefikConfigured: Boolean(traefikCfg.apiUrl),
      ovhConfigured: Boolean(ovhCfg.appKey && ovhCfg.appSecret && ovhCfg.consumerKey),
      duckdnsConfigured: Boolean(duckdnsCfg.token)
    }
  });
}));

router.put('/network', asyncHandler(async (req, res) => {
  const before = getNetworkConfig();
  const next = setCentralDomain(req.body?.centralDomain);
  logAudit(req, 'settings.network.central_domain_set', { from: before.centralDomain, to: next.centralDomain });
  res.json({ ok: true, network: next });
}));

router.get('/:key', asyncHandler(async (req, res) => {
  assertKey(req.params.key);
  res.json({ ok: true, integration: getRedactedIntegration(req.params.key) });
}));

router.put('/:key', asyncHandler(async (req, res) => {
  assertKey(req.params.key);
  const key = req.params.key;
  const secretFields = SECRET_FIELDS[key] || [];
  const before = getRedactedIntegration(key);
  const saved = saveIntegration(key, req.body || {});

  // Ne jamais consigner la valeur des champs secrets : seul un indicateur de
  // changement est journalisé pour eux. Les autres champs sont journalisés
  // avec leur ancienne/nouvelle valeur pour constituer un historique lisible.
  const changes = {};
  for (const field of Object.keys(req.body || {})) {
    if (field === 'enabled') continue;
    if (secretFields.includes(field)) {
      if (req.body[field]) changes[field] = { secret: true };
      continue;
    }
    const from = before?.[field] ?? null;
    const to = saved?.[field] ?? null;
    if (from !== to) changes[field] = { from, to };
  }

  logAudit(req, 'settings.integration.save', { key, changes });
  res.json({ ok: true, integration: saved });
}));

router.post('/:key/test', asyncHandler(async (req, res) => {
  assertKey(req.params.key);
  // Notifications sortantes : "Tester" doit réellement poster un message
  // (sendTestMessage), à la différence de getStatus() ici volontairement
  // sans effet de bord car interrogée en continu par le tableau de bord —
  // voir le commentaire dans notificationWebhookService.js.
  if (req.params.key === 'notificationsWebhook') {
    return res.json({ ok: true, status: await notificationWebhookService.sendTestMessage() });
  }
  const entry = integrations[req.params.key];
  if (!entry) {
    return res.status(400).json({ ok: false, error: 'Test de connexion non disponible pour cette intégration' });
  }
  const status = await entry.service.getStatus();
  res.json({ ok: true, status });
}));

function assertKey(key) {
  if (!INTEGRATION_KEYS.includes(key)) {
    const err = new Error(`Intégration inconnue: ${key}`);
    err.status = 400;
    throw err;
  }
}

export default router;
