import { DOMAINS } from '../config/domains.js';

export function toneFromScore(score) {
  if (score === null || score === undefined) return 'mut';
  if (score >= 90) return 'ok';
  if (score >= 60) return 'warn';
  return 'crit';
}

export function toneLabel(score) {
  if (score === null || score === undefined) return 'Aucune donnée';
  if (score >= 90) return 'Optimal';
  if (score >= 60) return 'Dégradation mineure';
  return 'Dégradation critique';
}

// Regroupe les intégrations brutes de /status/overview par domaine métier
// (Infrastructure, Réseaux, ...), utilisé à la fois par le menu "Santé globale"
// du Header et par la carte "Résumé de l'infrastructure" de la page d'accueil.
export function buildDomainRows(integrations) {
  return DOMAINS.filter((d) => !['home', 'adm'].includes(d.id)).map((d) => {
    const entries = integrations.filter((e) => e.domain === d.id);
    const configured = entries.filter((e) => e.configured);
    const healthy = configured.filter((e) => e.ok);
    const domainScore = configured.length ? Math.round((healthy.length / configured.length) * 100) : null;
    return { ...d, entries, configured, healthy, score: domainScore, tone: toneFromScore(domainScore) };
  });
}
