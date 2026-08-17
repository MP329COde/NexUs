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

export default router;
