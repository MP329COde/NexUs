import { buildClient, request } from './httpClient.js';

// Docker Hub Registry API v2 — endpoints publics, sans authentification, pour
// consulter les tags d'un dépôt public (bibliothèque officielle ou
// namespace/dépôt). Toujours réel, jamais de configuration requise côté
// Paramètres (contrairement aux autres intégrations) : c'est une simple
// consultation de registre public, pas un accès à une instance privée.
const client = buildClient('https://hub.docker.com/v2');

const NAMESPACE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,253}[a-z0-9])?$/;
const REPO_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,253}[a-z0-9])?$/;

function normalizeNamespace(namespace) {
  return namespace || 'library'; // images officielles Docker Hub (nginx, alpine, postgres...) sans namespace explicite
}

export async function listTags(namespace, repo, page = 1) {
  const ns = normalizeNamespace(namespace);
  if (!NAMESPACE_PATTERN.test(ns) || !REPO_PATTERN.test(repo)) {
    throw Object.assign(new Error('Namespace/dépôt invalide'), { status: 400 });
  }
  const data = await request(
    client,
    { method: 'GET', url: `/repositories/${ns}/${repo}/tags`, params: { page, page_size: 20, ordering: 'last_updated' } },
    'Docker Hub'
  );
  return {
    count: data.count,
    results: (data.results || []).map((t) => ({
      name: t.name,
      lastUpdated: t.tag_last_pushed || t.last_updated,
      digest: t.digest,
      sizeBytes: t.full_size,
      architectures: (t.images || []).map((i) => i.architecture).filter((v, i2, arr) => arr.indexOf(v) === i2)
    }))
  };
}

export async function getRepository(namespace, repo) {
  const ns = normalizeNamespace(namespace);
  if (!NAMESPACE_PATTERN.test(ns) || !REPO_PATTERN.test(repo)) {
    throw Object.assign(new Error('Namespace/dépôt invalide'), { status: 400 });
  }
  const data = await request(client, { method: 'GET', url: `/repositories/${ns}/${repo}` }, 'Docker Hub');
  return {
    name: data.name, namespace: data.namespace, description: data.description,
    starCount: data.star_count, pullCount: data.pull_count, isOfficial: ns === 'library',
    lastUpdated: data.last_updated
  };
}
