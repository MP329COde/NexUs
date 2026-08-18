import * as orgStore from '../store/orgStore.js';
import { provisionFromBlueprint } from './environmentProvisioningService.js';
import { checkQuotaBeforeCreate } from './quotaService.js';
import { logAudit } from './auditService.js';

// Preview Environments (ÉTAPE 10 IDP) : traite un événement GitHub
// `pull_request` déjà authentifié (signature vérifiée par
// routes/webhooks.routes.js, jamais ici) pour provisionner/détruire
// réellement l'environnement de la PR. Extrait de la route pour rester
// testable directement (même convention que scaffolderService.js,
// environmentPromotionService.js — pas de framework HTTP dans les tests).
//
// 'opened'/'reopened'/'synchronize' : crée l'environnement s'il n'existe pas
// encore (name = "pr-<numéro>", UNIQUE(project_id, name) empêche tout
// doublon même en cas de double livraison du même événement par GitHub) et
// provisionne réellement son namespace Kubernetes SEULEMENT si
// l'organisation a un blueprint de kind 'preview' — jamais deviné. Un
// commit supplémentaire sur une PR déjà ouverte ('synchronize') ne
// re-provisionne rien, seule la référence de commit est rafraîchie.
// 'closed' (mergée ou fermée sans merge) : détruit l'environnement s'il
// existe (deleteEnvironment refuse déjà toute production — sans effet ici
// puisqu'une preview n'est jamais marquée production).
export async function handlePullRequestEvent(project, action, pr, reqLike = {}) {
  const number = pr?.number;
  if (!number) return { handled: false, reason: 'pull_request sans numéro' };
  const envName = `pr-${number}`;

  if (['opened', 'reopened', 'synchronize'].includes(action)) {
    const existing = await orgStore.getEnvironmentByName(project.id, envName);
    if (existing) {
      await orgStore.updateEnvironmentSource(existing.id, { sourceCommit: pr.head?.sha });
      return { handled: true, action: 'updated', environmentId: existing.id };
    }
    const blueprints = await orgStore.listEnvironmentBlueprintsForOrg(project.org_id);
    const previewBlueprint = blueprints.find((b) => b.kind === 'preview') || null;

    // Quotas (ÉTAPE 26 IDP) : une rafale de PR ne doit pas pouvoir
    // contourner la limite de l'organisation — même vérification que la
    // création manuelle (routes/projects.routes.js).
    const quotaCheck = await checkQuotaBeforeCreate(project.org_id, previewBlueprint);
    if (!quotaCheck.allowed) {
      return { handled: true, action: 'rejected', reason: quotaCheck.reason };
    }

    const environment = await orgStore.createEnvironment(project.id, {
      name: envName, kind: 'preview', isProduction: false,
      blueprintId: previewBlueprint?.id || null,
      sourceBranch: pr.head?.ref, sourceCommit: pr.head?.sha, sourcePrUrl: pr.html_url
    });
    let provisioning = null;
    if (previewBlueprint) provisioning = await provisionFromBlueprint(environment, previewBlueprint, project.slug);
    logAudit(reqLike, 'webhook.preview_environment.create', { projectId: project.legacy_id, envName, hasBlueprint: Boolean(previewBlueprint) });
    return { handled: true, action: 'created', environmentId: environment.id, provisioning };
  }

  if (action === 'closed') {
    const existing = await orgStore.getEnvironmentByName(project.id, envName);
    if (!existing) return { handled: true, action: 'noop', reason: 'aucun environnement pour cette PR' };
    await orgStore.deleteEnvironment(existing.id);
    logAudit(reqLike, 'webhook.preview_environment.destroy', { projectId: project.legacy_id, envName });
    return { handled: true, action: 'destroyed', environmentId: existing.id };
  }

  return { handled: false, reason: `action non gérée : "${action}"` };
}
