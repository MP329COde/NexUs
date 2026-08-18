import { listScans as listCodeScans } from '../store/codeScansStore.js';
import { listScans as listDastScans } from '../store/dastScansStore.js';

// Policy Engine (ÉTAPE 16 IDP) : évalue un composant du Software Catalog
// contre les policies activées de son organisation, chacune calculée à
// partir d'un signal réel — jamais une case verte de complaisance. Les deux
// règles "block_*" lisent le DERNIER SCAN DE LA PLATEFORME (pas rattaché à
// UN composant précis) : même source et même limite que le Security Gate
// déjà appliqué aux promotions de production
// (services/environmentPromotionService.js#checkSecurityGate) — cohérence
// délibérée avec un signal déjà en production plutôt qu'une nouvelle
// approximation.
function evaluateOne(policy, component) {
  switch (policy.kind) {
    case 'require_owner_team':
      return { passed: Boolean(component.owner_team_id), detail: component.owner_team_id ? null : 'Aucune équipe propriétaire définie' };
    case 'require_production_lifecycle':
      return { passed: component.lifecycle === 'production', detail: component.lifecycle === 'production' ? null : `Cycle de vie actuel : ${component.lifecycle}` };
    case 'require_description':
      return { passed: Boolean(component.description?.trim()), detail: component.description?.trim() ? null : 'Description vide' };
    case 'require_repository':
      return { passed: Boolean(component.repository_url), detail: component.repository_url ? null : 'Aucun dépôt relié' };
    case 'require_linked_environment':
      // Même signal que le check "environments" du Scorecard (ÉTAPE 22) —
      // au moins un environnement du projet réellement relié à Argo CD
      // (linkEnvironment vérifie l'existence de l'application avant
      // d'accepter le lien, voir environmentPromotionService.js). Existence
      // seule des environnements ne compte plus : ils sont auto-créés pour
      // tout projet, ce ne serait jamais un signal utile.
      return {
        passed: Number(component.project_linked_environment_count || 0) > 0,
        detail: Number(component.project_linked_environment_count || 0) > 0 ? null : 'Aucun environnement du projet relié à une application Argo CD'
      };
    case 'block_critical_code_scan': {
      const last = listCodeScans()[0];
      const errors = last?.counts?.ERROR ?? 0;
      const max = policy.threshold ?? 0;
      return { passed: errors <= max, detail: errors > max ? `${errors} erreur(s) sur le dernier scan de code (seuil : ${max})` : null };
    }
    case 'block_high_dast_scan': {
      const last = listDastScans()[0];
      const high = last?.counts?.High ?? 0;
      const max = policy.threshold ?? 0;
      return { passed: high <= max, detail: high > max ? `${high} alerte(s) à risque élevé sur le dernier scan OWASP ZAP (seuil : ${max})` : null };
    }
    default:
      return { passed: true, detail: null };
  }
}

export function evaluatePolicies(component, policies) {
  const results = policies
    .filter((p) => p.enabled)
    .map((p) => {
      const { passed, detail } = evaluateOne(p, component);
      return { policyId: p.id, name: p.name, kind: p.kind, passed, detail };
    });
  return { allowed: results.every((r) => r.passed), results };
}
