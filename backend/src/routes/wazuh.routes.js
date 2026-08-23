import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as wazuh from '../services/integrations/wazuhService.js';

const router = Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await wazuh.getStatus() })));
router.get('/agents', asyncHandler(async (req, res) => res.json({ ok: true, items: await wazuh.listAgents() })));
router.get('/summary', asyncHandler(async (req, res) => res.json({ ok: true, summary: await wazuh.getAgentSummary() })));
router.get('/agents/:id/sca', asyncHandler(async (req, res) => res.json({ ok: true, items: await wazuh.listAgentSCA(req.params.id) })));
router.get('/sca-summary', asyncHandler(async (req, res) => res.json({ ok: true, ...(await wazuh.getSCASummary()) })));

// Alertes (indexeur OpenSearch, intégration séparée du gestionnaire
// ci-dessus) : renvoie configured:false plutôt qu'une erreur si l'indexeur
// n'est pas configuré, pour que le frontend affiche un état vide honnête
// plutôt qu'une erreur réseau brute.
router.get('/alerts', asyncHandler(async (req, res) => {
  const status = wazuh.getIndexerStatusSync();
  if (!status.configured) return res.json({ ok: true, configured: false, message: status.message, items: [], total: 0 });
  const { q, severity, agentId, from, to, page, pageSize } = req.query;
  const result = await wazuh.searchAlerts({
    q: q || undefined,
    severity: severity || undefined,
    agentId: agentId || undefined,
    from: from || undefined,
    to: to || undefined,
    page: page ? Number(page) : 1,
    pageSize: pageSize ? Math.min(Number(pageSize), 100) : 25
  });
  res.json({ ok: true, configured: true, ...result });
}));

router.get('/alerts/:id', asyncHandler(async (req, res) => res.json({ ok: true, alert: await wazuh.getAlertById(req.params.id) })));

export default router;
