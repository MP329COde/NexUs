import * as githubService from './integrations/githubService.js';
import * as orgStore from '../store/orgStore.js';
import { getTemplate } from './scaffolderTemplates.js';

class ScaffolderError extends Error {}

const NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const PROVIDERS = ['none', 'github'];

// Orchestration du golden path "créer un service" (ÉTAPE 8/9 IDP) : génère
// les fichiers du template choisi, crée le dépôt distant si un provider
// réel est demandé (aujourd'hui : GitHub seulement — voir audit de
// intégrations/{gitlab,gitea}Service.js, aucune des deux n'expose de
// création de projet), puis enregistre le composant dans le Software
// Catalog. Appelée depuis l'intérieur d'un jobService.enqueue() par
// routes/catalog.routes.js pour exposer état/logs/progression au frontend
// sans bloquer la requête HTTP.
//
// GitLab/Gitea ne sont PAS proposés comme provider ici : plutôt qu'une
// case à cocher qui échouerait silencieusement, l'API les refuse
// explicitement (voir validation ci-dessous) — cohérent avec la consigne de
// ne jamais simuler une réussite pour une intégration non branchée.
export async function scaffoldService({ templateId, name, description, projectId, ownerTeamId, repositoryProvider, log }) {
  // Attend chaque écriture de log avant de continuer : sans ce await, les
  // appels à jobService.appendJobStep() (une requête UPDATE chacun) partent
  // en parallèle et se terminent dans un ordre non déterministe côté base —
  // un client qui suit la progression en direct (GET .../jobs/:jobId)
  // pouvait alors voir "generate: running" avant "validate: done", ce qui
  // n'a pas de sens puisque validate se termine avant que generate ne
  // commence. Trouvé en testant le scaffolder via curl.
  const emit = async (step, status, detail) => { await log?.(step, status, detail); };

  await emit('validate', 'running');
  const template = getTemplate(templateId);
  if (!template) throw new ScaffolderError(`Template inconnu : "${templateId}"`);
  if (!NAME_PATTERN.test(name)) throw new ScaffolderError('Nom de service invalide (minuscules, chiffres, tirets, sans tiret en début/fin)');
  const provider = repositoryProvider || 'none';
  if (!PROVIDERS.includes(provider)) throw new ScaffolderError(`Provider de dépôt non supporté : "${provider}" (disponibles : ${PROVIDERS.join(', ')})`);
  const existing = await orgStore.getComponentBySlug(projectId, name);
  if (existing) throw new ScaffolderError(`Un composant "${name}" existe déjà dans ce projet`);
  let ownerTeamSlug = null;
  if (ownerTeamId) {
    const team = await orgStore.getTeam(ownerTeamId);
    ownerTeamSlug = team?.slug || null;
  }
  await emit('validate', 'done');

  await emit('generate', 'running');
  const files = template.files({
    name, description: description || template.description, kind: template.kind, lifecycle: 'experimental', ownerTeamSlug,
    language: template.language, framework: template.framework
  });
  await emit('generate', 'done', { fileCount: Object.keys(files).length, files: Object.keys(files) });

  let repository = null;
  if (provider === 'github') {
    await emit('create_repo', 'running');
    const repo = await githubService.createRepo(name, { private: true, description: description || template.description });
    const [owner, repoName] = repo.fullName.split('/');
    await emit('create_repo', 'done', { fullName: repo.fullName });

    await emit('push_files', 'running');
    let pushed = 0;
    for (const [path, content] of Object.entries(files)) {
      await githubService.commitFile(owner, repoName, 'main', path, content, `feat: scaffold ${path} (template ${template.id})`);
      pushed += 1;
      await emit('push_files', 'progress', { pushed, total: Object.keys(files).length });
    }
    await emit('push_files', 'done', { pushed });
    repository = { provider: 'github', url: `https://github.com/${repo.fullName}` };
  } else {
    await emit('create_repo', 'skipped', { reason: 'Aucun provider de dépôt sélectionné — composant enregistré sans dépôt distant' });
    await emit('push_files', 'skipped');
  }

  await emit('register_catalog', 'running');
  const component = await orgStore.createComponent({
    projectId, ownerTeamId: ownerTeamId || null, name, slug: name, kind: template.kind, lifecycle: 'experimental',
    description: description || template.description, language: template.language, framework: template.framework,
    repositoryProvider: repository?.provider || '', repositoryUrl: repository?.url || '', tags: [], links: []
  });
  await emit('register_catalog', 'done', { componentId: component.id });

  return { component, repository, files: Object.keys(files) };
}

export { ScaffolderError };
