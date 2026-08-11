import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as proxyService from '../services/proxyService.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => res.json({ ok: true, items: proxyService.list() })));
router.post('/', asyncHandler(async (req, res) => res.status(201).json({ ok: true, proxy: proxyService.create(req.body || {}) })));
router.put('/:id', asyncHandler(async (req, res) => res.json({ ok: true, proxy: proxyService.update(req.params.id, req.body || {}) })));
router.delete('/:id', asyncHandler(async (req, res) => res.json(await proxyService.remove(req.params.id))));
router.post('/:id/apply', asyncHandler(async (req, res) => res.json(await proxyService.apply(req.params.id))));
router.post('/:id/test', asyncHandler(async (req, res) => res.json({ ok: true, result: await proxyService.testConnection(req.params.id) })));

export default router;
