import { Router } from 'express';
import crypto from 'node:crypto';
import { asyncHandler } from '../middleware/errorHandler.js';
import { pool } from '../db/pool.js';
import * as orgStore from '../store/orgStore.js';
import * as incidentStore from '../store/incidentStore.js';
import { logAudit } from '../services/auditService.js';
import { logger } from '../utils/logger.js';
import { handlePullRequestEvent } from '../services/previewEnvironmentWebhookService.js';
import { handlePushEvent as handleServiceYamlPush } from '../services/serviceYamlDiscoveryService.js';
import { notifyUser } from '../services/userNotificationService.js';

// Notifie owner+maintainer du projet (jamais l'auteur du push, non
// résolvable en compte Nexus depuis un simple nom/e-mail de forge) —
// même liste de destinataires que pour la création d'incident
// (routes/projects.routes.js), cohérence de convention.
async function notifyProjectOwners(project, { type, title, message, meta }) {
  const members = await orgStore.listMembers(project.id);
  for (const m of members.filter((x) => ['owner', 'maintainer'].includes(x.role))) {
    notifyUser(m.user_id, { type, title, message, meta });
  }
}

// Points d'entrée publics (pas de requireAuth : GitLab/GitHub ne peuvent pas
// s'authentifier comme un utilisateur Nexus) mais jamais des portes non
// authentifiées : chaque requête doit prouver la connaissance du secret
// propre au projet ciblé, généré à sa création (voir store/orgStore.js
// createProject) et consultable/régénérable uniquement par un maintainer+
// du projet (routes/projects.routes.js GET/POST /:id/webhook*).
//
// GitLab envoie le secret en clair dans X-Gitlab-Token (comparaison à temps
// constant) ; GitHub signe le corps avec HMAC-SHA256 dans
// X-Hub-Signature-256 (le secret lui-même ne transite jamais sur le
// réseau). Toute vérification échouée répond 401 sans détail, journalisée,
// avant même de lire le corps de l'événement.
const router = Router();

router.use((req, res, next) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'Socle relationnel indisponible' });
  next();
});

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function loadProjectBySecret(legacyProjectId) {
  const project = await orgStore.getProjectByLegacyId(legacyProjectId);
  if (!project || !project.webhook_secret) return null;
  return project;
}

// GitLab System Hooks / Project Hooks : POST .../pipeline avec object_kind
// 'pipeline' et object_attributes.status. On ne réagit qu'à un pipeline en
// échec pour l'instant : ouvre un incident de sévérité 'medium' rattaché au
// projet, avec le lien vers le pipeline dans la description — évite d'avoir
// à surveiller GitLab manuellement pour détecter une régression de CI.
router.post('/gitlab/:legacyProjectId', asyncHandler(async (req, res) => {
  const project = await loadProjectBySecret(req.params.legacyProjectId);
  if (!project) return res.status(401).json({ ok: false, error: 'Projet ou secret invalide' });

  const token = req.headers['x-gitlab-token'];
  if (!timingSafeEqualStr(token, project.webhook_secret)) {
    logger.warn({ projectId: project.id }, 'Webhook GitLab rejeté : jeton invalide');
    return res.status(401).json({ ok: false, error: 'Jeton invalide' });
  }

  const event = req.body || {};
  logAudit({ user: { email: 'webhook:gitlab' }, ip: req.ip }, 'webhook.received', { provider: 'gitlab', projectId: project.legacy_id, kind: event.object_kind });

  if (event.object_kind === 'pipeline' && event.object_attributes?.status === 'failed') {
    await incidentStore.create({
      projectId: project.id,
      title: `Pipeline GitLab en échec — ${event.object_attributes.ref || 'branche inconnue'}`,
      description: event.object_attributes.url || '',
      severity: 'medium',
      resourceType: 'pipeline',
      resourceRef: String(event.object_attributes.id || ''),
      createdBy: 'webhook:gitlab'
    });
    await notifyProjectOwners(project, {
      type: 'pipeline.failed', title: 'Pipeline en échec',
      message: `Pipeline GitLab en échec sur « ${project.name} » (${event.object_attributes.ref || 'branche inconnue'})`,
      meta: { projectId: project.legacy_id, ref: event.object_attributes.ref }
    });
  } else if (event.object_kind === 'pipeline' && event.object_attributes?.status === 'success') {
    await notifyProjectOwners(project, {
      type: 'pipeline.success', title: 'Pipeline réussi',
      message: `Pipeline GitLab réussi sur « ${project.name} » (${event.object_attributes.ref || 'branche inconnue'})`,
      meta: { projectId: project.legacy_id, ref: event.object_attributes.ref }
    });
  }

  res.json({ ok: true });
}));

// GitHub Webhooks : POST .../workflow_run avec action 'completed' et
// conclusion 'failure'. Signature vérifiée sur req.rawBody (capturé par
// express.json({ verify }) dans index.js), jamais sur une reconstruction
// JSON.stringify(req.body) qui pourrait différer octet pour octet de ce que
// GitHub a réellement signé.
router.post('/github/:legacyProjectId', asyncHandler(async (req, res) => {
  const project = await loadProjectBySecret(req.params.legacyProjectId);
  if (!project) return res.status(401).json({ ok: false, error: 'Projet ou secret invalide' });

  const signature = req.headers['x-hub-signature-256'];
  const expected = 'sha256=' + crypto.createHmac('sha256', project.webhook_secret).update(req.rawBody || Buffer.alloc(0)).digest('hex');
  if (!timingSafeEqualStr(signature, expected)) {
    logger.warn({ projectId: project.id }, 'Webhook GitHub rejeté : signature invalide');
    return res.status(401).json({ ok: false, error: 'Signature invalide' });
  }

  const event = req.body || {};
  const githubEvent = req.headers['x-github-event'];
  logAudit({ user: { email: 'webhook:github' }, ip: req.ip }, 'webhook.received', { provider: 'github', projectId: project.legacy_id, event: githubEvent });

  if (githubEvent === 'workflow_run' && event.action === 'completed' && event.workflow_run?.conclusion === 'failure') {
    await incidentStore.create({
      projectId: project.id,
      title: `Workflow GitHub Actions en échec — ${event.workflow_run.name || 'workflow inconnu'}`,
      description: event.workflow_run.html_url || '',
      severity: 'medium',
      resourceType: 'workflow_run',
      resourceRef: String(event.workflow_run.id || ''),
      createdBy: 'webhook:github'
    });
    await notifyProjectOwners(project, {
      type: 'pipeline.failed', title: 'Pipeline en échec',
      message: `Workflow GitHub Actions en échec sur « ${project.name} » (${event.workflow_run.name || 'workflow inconnu'})`,
      meta: { projectId: project.legacy_id, webUrl: event.workflow_run.html_url }
    });
  } else if (githubEvent === 'workflow_run' && event.action === 'completed' && event.workflow_run?.conclusion === 'success') {
    await notifyProjectOwners(project, {
      type: 'pipeline.success', title: 'Pipeline réussi',
      message: `Workflow GitHub Actions réussi sur « ${project.name} » (${event.workflow_run.name || 'workflow inconnu'})`,
      meta: { projectId: project.legacy_id, webUrl: event.workflow_run.html_url }
    });
  }

  // Preview Environments (ÉTAPE 10 IDP) — voir previewEnvironmentWebhookService.js
  // pour la logique réelle (provisioning Kubernetes/destruction), testée
  // indépendamment de ce routeur HTTP.
  if (githubEvent === 'pull_request') {
    const result = await handlePullRequestEvent(project, event.action, event.pull_request, { user: { email: 'webhook:github' }, ip: req.ip });
    if (result.action === 'created') {
      await notifyProjectOwners(project, {
        type: 'preview.created', title: 'Preview créée',
        message: `Environnement de preview créé pour la PR #${event.pull_request?.number} sur « ${project.name} »`,
        meta: { projectId: project.legacy_id, environmentId: result.environmentId, prUrl: event.pull_request?.html_url }
      });
    }
  }

  // Auto-discovery service.yaml (ÉTAPE 22 IDP) — voir serviceYamlDiscoveryService.js.
  if (githubEvent === 'push') {
    const discovery = await handleServiceYamlPush(project, event);
    if (discovery.handled) {
      logAudit({ user: { email: 'webhook:github' }, ip: req.ip }, 'webhook.service_yaml.discover', { projectId: project.legacy_id, status: discovery.status, componentId: discovery.componentId });
    }
  }

  res.json({ ok: true });
}));

export default router;
