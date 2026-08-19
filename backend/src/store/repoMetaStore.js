import { readStore, writeStore } from './jsonStore.js';

// Étiquettes attachées à un dépôt Git réel (GitLab/GitHub), identifié par
// `${provider}:${identifiant}` (id numérique GitLab, "owner/repo" GitHub).
// Ne duplique jamais les données du dépôt lui-même (nom, URL...), toujours
// relues en direct depuis GitLab/GitHub — seulement le rôle/les étiquettes
// posées manuellement par l'équipe.
export function listRepoMeta() {
  return readStore('repoMeta') || [];
}

export function getRepoMeta(key) {
  return listRepoMeta().find((m) => m.key === key) || null;
}

export function setRepoMeta(key, { role, tags }) {
  const all = listRepoMeta();
  const idx = all.findIndex((m) => m.key === key);
  const entry = {
    key,
    role: role || null, // application | framework | service | library | template | infra | docs | storybook | design-system | example
    tags: Array.isArray(tags) ? tags : (idx === -1 ? [] : all[idx].tags),
    updatedAt: new Date().toISOString()
  };
  if (idx === -1) all.push(entry);
  else all[idx] = { ...all[idx], ...entry };
  writeStore('repoMeta', all);
  return entry;
}
