import { load as loadYaml, dump as dumpYaml } from 'js-yaml';

// Format déclaratif service.yaml : permet d'enregistrer/mettre à jour un
// composant du Software Catalog depuis un fichier versionné avec le code du
// service, plutôt qu'uniquement via le formulaire de CatalogPage.jsx (même
// esprit que Backstage catalog-info.yaml, adapté aux champs réels de la
// table components — voir db/migrations/0013_components.sql). Rien ne
// touche encore au dépôt Git lui-même (pas de lecture automatique du
// fichier côté repository) : l'import se fait par collage du contenu YAML,
// première étape avant une éventuelle synchronisation automatique.
const SUPPORTED_API_VERSION = 'nexus.dev/v1';
const SUPPORTED_KIND = 'Service';
const KINDS = ['service', 'api', 'website', 'worker', 'library', 'cronjob', 'infrastructure'];
const LIFECYCLES = ['experimental', 'production', 'deprecated'];
const NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

class ManifestError extends Error {}

function assert(condition, message) {
  if (!condition) throw new ManifestError(message);
}

// Lève une ManifestError avec un message directement affichable dans
// l'interface (pas de trace technique) en cas de YAML ou de schéma invalide.
export function parseServiceManifest(yamlText) {
  assert(typeof yamlText === 'string' && yamlText.trim(), 'Contenu YAML vide');

  let doc;
  try {
    doc = loadYaml(yamlText);
  } catch (err) {
    throw new ManifestError(`YAML invalide : ${err.message}`);
  }
  assert(doc && typeof doc === 'object' && !Array.isArray(doc), 'Le document YAML doit être un objet');

  assert(doc.apiVersion === SUPPORTED_API_VERSION, `apiVersion non supportée (attendu "${SUPPORTED_API_VERSION}")`);
  assert(doc.kind === SUPPORTED_KIND, `kind non supporté (attendu "${SUPPORTED_KIND}")`);

  const metadata = doc.metadata || {};
  assert(typeof metadata.name === 'string' && NAME_PATTERN.test(metadata.name), 'metadata.name requis (minuscules, chiffres, tirets, sans tiret en début/fin)');

  const spec = doc.spec || {};
  const kind = spec.type || 'service';
  assert(KINDS.includes(kind), `spec.type invalide (valeurs possibles : ${KINDS.join(', ')})`);
  const lifecycle = spec.lifecycle || 'experimental';
  assert(LIFECYCLES.includes(lifecycle), `spec.lifecycle invalide (valeurs possibles : ${LIFECYCLES.join(', ')})`);

  const repository = spec.repository || {};
  if (repository.provider) assert(typeof repository.provider === 'string', 'spec.repository.provider doit être une chaîne');
  if (repository.url) assert(typeof repository.url === 'string', 'spec.repository.url doit être une chaîne');

  const tags = spec.tags || [];
  assert(Array.isArray(tags) && tags.every((t) => typeof t === 'string'), 'spec.tags doit être une liste de chaînes');

  const links = spec.links || [];
  assert(
    Array.isArray(links) && links.every((l) => l && typeof l.label === 'string' && typeof l.url === 'string'),
    'spec.links doit être une liste de { label, url }'
  );

  return {
    name: metadata.name,
    description: metadata.description || '',
    kind,
    lifecycle,
    ownerTeamSlug: spec.owner || null,
    language: spec.language || '',
    framework: spec.framework || '',
    repositoryProvider: repository.provider || '',
    repositoryUrl: repository.url || '',
    tags,
    links
  };
}

// Sens inverse : reconstruit un service.yaml à partir d'un composant tel que
// stocké en base (voir orgStore.getComponent) — utilisé par
// GET /catalog/components/:id/manifest pour permettre d'exporter ce qu'on
// vient de créer via le formulaire, et donc de le committer dans le dépôt.
export function componentToManifest(component) {
  const doc = {
    apiVersion: SUPPORTED_API_VERSION,
    kind: SUPPORTED_KIND,
    metadata: {
      name: component.slug,
      description: component.description || undefined
    },
    spec: {
      type: component.kind,
      lifecycle: component.lifecycle,
      owner: component.owner_team_slug || undefined,
      language: component.language || undefined,
      framework: component.framework || undefined,
      repository: (component.repository_provider || component.repository_url)
        ? { provider: component.repository_provider || undefined, url: component.repository_url || undefined }
        : undefined,
      tags: (component.tags && component.tags.length) ? component.tags : undefined,
      links: (component.links && component.links.length) ? component.links : undefined
    }
  };
  return dumpYaml(doc, { skipInvalid: true });
}

export { ManifestError };
