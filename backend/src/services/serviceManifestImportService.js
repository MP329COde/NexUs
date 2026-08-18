import { parseServiceManifest, ManifestError } from './serviceManifest.js';
import * as orgStore from '../store/orgStore.js';

export { ManifestError };

// Import/synchronisation d'un service.yaml dans un projet : crée le
// composant s'il n'existe pas encore (slug = metadata.name), le met à jour
// sinon — idempotent, contrairement à orgStore.createComponent seul qui
// échouerait sur la contrainte UNIQUE (project_id, slug). Partagé entre
// POST /catalog/components/import (collé dans l'interface) et le webhook
// GitHub (ÉTAPE 22 IDP, voir routes/webhooks.routes.js) : même logique,
// jamais une seconde implémentation divergente.
export async function importServiceManifest({ projectId, yaml }) {
  const manifest = parseServiceManifest(yaml); // lève ManifestError si invalide — laissé à l'appelant

  let ownerTeamId = null;
  if (manifest.ownerTeamSlug) {
    const project = await orgStore.getProject(projectId);
    const team = await orgStore.getTeamBySlug(project.org_id, manifest.ownerTeamSlug);
    if (!team) throw new ManifestError(`Équipe introuvable pour spec.owner: "${manifest.ownerTeamSlug}" (créez-la d'abord depuis la fiche organisation)`);
    ownerTeamId = team.id;
  }

  const fields = {
    ownerTeamId, name: manifest.name, kind: manifest.kind, lifecycle: manifest.lifecycle,
    description: manifest.description, language: manifest.language, framework: manifest.framework,
    repositoryProvider: manifest.repositoryProvider, repositoryUrl: manifest.repositoryUrl, tags: manifest.tags, links: manifest.links
  };

  const existing = await orgStore.getComponentBySlug(projectId, manifest.name);
  const component = existing
    ? await orgStore.updateComponent(existing.id, fields)
    : await orgStore.createComponent({ projectId, slug: manifest.name, ...fields });
  return { component, created: !existing };
}
