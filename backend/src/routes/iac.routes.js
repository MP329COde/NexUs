import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as store from '../store/iacWorkspacesStore.js';
import * as terraform from '../services/terraformService.js';
import { logAudit } from '../services/auditService.js';

// Infrastructure as Code : chaque "workspace" est une VM Proxmox déclarée
// depuis Nexus et matérialisée en fichiers Terraform réels (voir
// services/terraformService.js). Réservé aux admins : provisionner ou
// détruire une machine est au moins aussi sensible que les actions Proxmox
// déjà admin-only (routes/proxmox.routes.js).
const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/workspaces', (req, res) => {
  res.json({ ok: true, items: store.listWorkspaces() });
});

router.get('/workspaces/:id', (req, res) => {
  const ws = store.getWorkspace(req.params.id);
  if (!ws) return res.status(404).json({ ok: false, error: 'Espace de travail introuvable' });
  res.json({ ok: true, workspace: ws });
});

router.get('/workspaces/:id/main.tf', asyncHandler(async (req, res) => {
  const ws = store.getWorkspace(req.params.id);
  if (!ws) return res.status(404).json({ ok: false, error: 'Espace de travail introuvable' });
  res.json({ ok: true, content: terraform.readMainTf(req.params.id) });
}));

router.post('/workspaces', asyncHandler(async (req, res) => {
  const { name, node, vmId, vmName, templateVmId, cores, memoryMb, diskGb, projectId, environmentId } = req.body || {};
  if (!name || !node || !vmId || !vmName || !templateVmId) {
    return res.status(400).json({ ok: false, error: 'name, node, vmId, vmName et templateVmId sont requis' });
  }
  const ws = store.createWorkspace({ name, node, vmId, vmName, templateVmId, cores: cores || 2, memoryMb: memoryMb || 2048, diskGb: diskGb || 20, projectId: projectId || null, environmentId: environmentId || null });
  try {
    terraform.generateWorkspaceFiles(ws.id, { node, vmId, vmName, templateVmId, cores, memoryMb, diskGb });
  } catch (err) {
    store.deleteWorkspace(ws.id);
    throw err;
  }
  logAudit(req, 'iac.workspace.create', { workspaceId: ws.id, name });
  res.status(201).json({ ok: true, workspace: ws });
}));

router.post('/workspaces/:id/plan', asyncHandler(async (req, res) => {
  const ws = store.getWorkspace(req.params.id);
  if (!ws) return res.status(404).json({ ok: false, error: 'Espace de travail introuvable' });
  const result = await terraform.plan(req.params.id);
  const updated = store.updateWorkspace(req.params.id, { lastPlanAt: new Date().toISOString(), lastPlanSummary: result.hasChanges ? 'Changements détectés' : 'Aucun changement' });
  logAudit(req, 'iac.workspace.plan', { workspaceId: ws.id, hasChanges: result.hasChanges });
  res.json({ ok: true, ...result, workspace: updated });
}));

// Applique réellement l'infrastructure (crée/modifie la VM sur Proxmox) —
// action destructrice/à effet réel, jamais déclenchée sans confirmation
// explicite côté interface (voir ActionConfirmModal côté frontend).
router.post('/workspaces/:id/apply', asyncHandler(async (req, res) => {
  const ws = store.getWorkspace(req.params.id);
  if (!ws) return res.status(404).json({ ok: false, error: 'Espace de travail introuvable' });
  const result = await terraform.apply(req.params.id);
  const updated = store.updateWorkspace(req.params.id, { lastApplyAt: new Date().toISOString() });
  logAudit(req, 'iac.workspace.apply', { workspaceId: ws.id });
  res.json({ ok: true, ...result, workspace: updated });
}));

router.post('/workspaces/:id/destroy', asyncHandler(async (req, res) => {
  const ws = store.getWorkspace(req.params.id);
  if (!ws) return res.status(404).json({ ok: false, error: 'Espace de travail introuvable' });
  const result = await terraform.destroy(req.params.id);
  logAudit(req, 'iac.workspace.destroy', { workspaceId: ws.id });
  res.json({ ok: true, ...result });
}));

router.delete('/workspaces/:id', asyncHandler(async (req, res) => {
  const ws = store.getWorkspace(req.params.id);
  if (!ws) return res.status(404).json({ ok: false, error: 'Espace de travail introuvable' });
  terraform.removeWorkspaceFiles(req.params.id);
  store.deleteWorkspace(req.params.id);
  logAudit(req, 'iac.workspace.delete', { workspaceId: ws.id });
  res.json({ ok: true });
}));

export default router;
