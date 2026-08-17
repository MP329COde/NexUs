import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';
import * as ovh from '../services/integrations/ovhService.js';
import * as duckdns from '../services/integrations/duckdnsService.js';
import { getRawIntegration } from '../store/settingsStore.js';

const router = Router();
router.use(requireAuth);

// Liste les zones OVH gérées par le compte configuré — utilisé côté frontend
// pour proposer le bon nom de zone plutôt que de le faire ressaisir à l'admin.
router.get('/ovh/zones', asyncHandler(async (req, res) => res.json({ ok: true, items: await ovh.listZones() })));

router.use(requireRole('admin'));

// Point d'entrée unique "pointer ce domaine vers cette machine", indépendant
// du fournisseur DNS réellement configuré (OVH ou DuckDNS) : le frontend
// n'a pas à savoir lequel des deux est actif, seulement le domaine complet
// et l'adresse cible. Cohérent avec proxies.routes.js (actions réservées admin).
router.post('/sync', asyncHandler(async (req, res) => {
  const { domain, target } = req.body || {};
  if (!domain || !target) return res.status(400).json({ ok: false, message: 'domain et target requis' });

  if (domain.endsWith('.duckdns.org')) {
    const subdomain = domain.replace(/\.duckdns\.org$/, '');
    const result = await duckdns.updateRecord(subdomain, target);
    logAudit(req, 'dns.sync', { provider: 'duckdns', domain, target });
    return res.json(result);
  }

  const ovhCfg = getRawIntegration('ovh');
  if (!ovhCfg.appKey) return res.status(409).json({ ok: false, message: 'Aucun fournisseur DNS configuré pour ce domaine (OVH pour les zones classiques, DuckDNS pour *.duckdns.org) — voir Paramètres.' });

  const zones = await ovh.listZones();
  const zone = zones.find((z) => domain === z || domain.endsWith(`.${z}`));
  if (!zone) return res.status(404).json({ ok: false, message: `Aucune zone OVH ne correspond à ${domain} (zones disponibles: ${zones.join(', ') || 'aucune'})` });
  const subdomain = domain === zone ? '' : domain.slice(0, -(zone.length + 1));
  const result = await ovh.upsertRecord(zone, subdomain, target);
  logAudit(req, 'dns.sync', { provider: 'ovh', domain, target, zone });
  res.json(result);
}));

export default router;
