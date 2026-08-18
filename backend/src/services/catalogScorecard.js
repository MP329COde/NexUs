// Scorecard (ÉTAPE 22 IDP) : signal de "production readiness" par composant
// du Software Catalog. Volontairement limité à des faits déjà présents et
// vérifiés en base (métadonnées du composant + nombre d'environnements du
// projet parent) — pas de case "SAST/SCA/SBOM/image signée" tant que ces
// scans (services/codeScansStore.js, sbomStore.js, signaturesStore.js...)
// ne sont pas fiablement rattachables à UN composant précis du catalogue
// (ils sont aujourd'hui indexés par cible de scan, pas par component_id) :
// afficher une coche verte non vérifiée serait exactement le genre de faux
// signal de réussite que la plateforme doit éviter.
const CHECKS = [
  { id: 'documentation', label: 'Documentation', test: (c) => Boolean(c.description && c.description.trim()) },
  { id: 'owner', label: 'Équipe propriétaire', test: (c) => Boolean(c.owner_team_id) },
  { id: 'repository', label: 'Dépôt relié', test: (c) => Boolean(c.repository_url) },
  { id: 'stack', label: 'Stack technique déclarée', test: (c) => Boolean(c.language && c.framework) },
  { id: 'environments', label: 'Environnements configurés', test: (c) => Number(c.project_environment_count || 0) > 0 },
  { id: 'lifecycle', label: 'Cycle de vie en production', test: (c) => c.lifecycle === 'production' }
];

export function computeScorecard(component) {
  const checks = CHECKS.map((c) => ({ id: c.id, label: c.label, passed: c.test(component) }));
  const passed = checks.filter((c) => c.passed).length;
  const score = Math.round((passed / checks.length) * 100);
  // "Production eligible" reprend les trois signaux les plus structurants
  // (spec ÉTAPE 22) plutôt que d'exiger un score de 100 — un composant sans
  // environnement configuré peut légitimement être prod-ready par ailleurs.
  const productionEligible = ['documentation', 'owner', 'repository', 'lifecycle'].every(
    (id) => checks.find((c) => c.id === id)?.passed
  );
  return { checks, score, productionEligible };
}
