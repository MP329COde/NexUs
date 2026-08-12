// Aide à la saisie des URL d'intégration : déduit le suffixe de domaine du
// homelab (ex. "homelab.local") à partir des intégrations déjà configurées
// par l'utilisateur, puis propose une URL plausible pour les autres. Aucune
// requête réseau n'est faite : uniquement une suggestion, à un clic pour
// l'appliquer — jamais silencieuse.
const HOST_FIELDS = ['apiServer', 'baseUrl', 'apiUrl', 'dataPlaneUrl'];

export function detectDomainSuffix(allIntegrations) {
  if (!allIntegrations) return null;
  for (const entry of Object.values(allIntegrations)) {
    for (const field of HOST_FIELDS) {
      const value = entry?.[field];
      if (!value) continue;
      try {
        const host = new URL(value).hostname;
        const parts = host.split('.');
        if (parts.length >= 2 && !/^\d+$/.test(parts[0])) return parts.slice(-2).join('.');
      } catch {
        // valeur non parseable en URL (IP brute, etc.) : ignorée pour la détection du suffixe
      }
    }
  }
  return null;
}

export function suggestHostUrl(allIntegrations, hostSuggestion) {
  if (!hostSuggestion) return null;
  const suffix = detectDomainSuffix(allIntegrations);
  if (!suffix) return null;
  const port = hostSuggestion.port ? `:${hostSuggestion.port}` : '';
  return `https://${hostSuggestion.subdomain}.${suffix}${port}`;
}
