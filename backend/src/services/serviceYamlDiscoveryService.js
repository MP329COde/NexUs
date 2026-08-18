import * as githubService from './integrations/githubService.js';
import { importServiceManifest, ManifestError } from './serviceManifestImportService.js';

// Auto-discovery service.yaml (ÉTAPE 22 IDP) : un push sur la branche par
// défaut qui touche service.yaml importe/synchronise automatiquement le
// composant du Software Catalog — même logique que l'import manuel collé
// dans l'interface (services/serviceManifestImportService.js), jamais une
// seconde implémentation. Ne réagit qu'à la branche par défaut du dépôt
// (event.repository.default_branch) : un push sur une branche de feature
// ne doit pas modifier le catalogue avant merge.
export async function handlePushEvent(project, event) {
  const ref = event?.ref;
  const defaultBranch = event?.repository?.default_branch;
  if (!ref || !defaultBranch || ref !== `refs/heads/${defaultBranch}`) {
    return { handled: false, reason: 'push hors branche par défaut' };
  }

  const changedFiles = new Set();
  for (const commit of event.commits || []) {
    for (const f of [...(commit.added || []), ...(commit.modified || [])]) changedFiles.add(f);
  }
  if (!changedFiles.has('service.yaml')) {
    return { handled: false, reason: 'service.yaml non modifié dans ce push' };
  }

  const fullName = event.repository?.full_name;
  if (!fullName) return { handled: false, reason: 'dépôt inconnu dans le payload' };
  const [owner, repo] = fullName.split('/');

  let file;
  try {
    file = await githubService.getFileContent(owner, repo, 'service.yaml', defaultBranch);
  } catch (err) {
    return { handled: true, status: 'failed', message: `Lecture de service.yaml impossible : ${err.message}` };
  }

  try {
    const result = await importServiceManifest({ projectId: project.id, yaml: file.content });
    return { handled: true, status: 'imported', created: result.created, componentId: result.component.id };
  } catch (err) {
    const message = err instanceof ManifestError ? err.message : (err.message || 'Échec de l\'import');
    return { handled: true, status: 'failed', message };
  }
}
