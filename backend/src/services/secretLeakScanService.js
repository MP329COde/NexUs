import * as gitlab from './integrations/gitlabService.js';
import * as github from './integrations/githubService.js';
import { listProjects } from '../store/projectsStore.js';
import { findSecretMatchInText, forceRotateSecret } from '../store/vaultStore.js';
import { recordLeak } from '../store/secretLeaksStore.js';
import { createNotification } from '../store/notificationsStore.js';
import { logger } from '../utils/logger.js';

// Scan quotidien des dépôts liés à un projet, à la recherche d'un mot de
// passe prod/projet connu du coffre-fort committé en clair. Bornes
// volontairement strictes (racine + un niveau, 40 fichiers max par dépôt,
// extensions textuelles courantes) : c'est un filet de sécurité pour un
// homelab, pas un scanner exhaustif type gitleaks/trufflehog — l'objectif
// est de détecter les cas évidents (fichier .env commité par erreur, script
// avec un mot de passe en dur) sans ralentir la plateforme ni épuiser les
// quotas API GitLab/GitHub.
const MAX_FILES_PER_REPO = 40;
const SKIP_DIR_PATTERN = /^(\.git|node_modules|dist|build|vendor|\.venv|__pycache__)$/;
const TEXT_EXTENSION_PATTERN = /\.(env|ya?ml|json|ini|conf|cfg|toml|sh|bash|zsh|py|js|mjs|cjs|ts|tsx|jsx|rb|go|php|java|properties|txt|md|tf|tfvars)$/i;

async function collectFiles(list, path, depth) {
  const entries = await list(path);
  const files = [];
  for (const entry of entries) {
    if (entry.type === 'dir' && depth > 0 && !SKIP_DIR_PATTERN.test(entry.name)) {
      files.push(...await collectFiles(list, entry.path, depth - 1).catch(() => []));
    } else if (entry.type === 'file' && TEXT_EXTENSION_PATTERN.test(entry.name)) {
      files.push(entry.path);
    }
    if (files.length >= MAX_FILES_PER_REPO) break;
  }
  return files.slice(0, MAX_FILES_PER_REPO);
}

async function scanRepo(project, repoKey) {
  const [provider, ...rest] = repoKey.split(':');
  const id = rest.join(':');
  let list, read;

  if (provider === 'gitlab') {
    list = (path) => gitlab.listTree(id, path);
    read = (path) => gitlab.getFileContent(id, path).then((f) => f.content);
  } else if (provider === 'github') {
    const [owner, repo] = id.split('/');
    list = (path) => github.listTree(owner, repo, path);
    read = (path) => github.getFileContent(owner, repo, path).then((f) => f.content);
  } else {
    return;
  }

  const files = await collectFiles(list, '', 1);
  for (const filePath of files) {
    let content;
    try {
      content = await read(filePath);
    } catch {
      continue; // fichier illisible (permissions, supprimé entre-temps...) : ignoré, pas bloquant
    }
    const matches = findSecretMatchInText(content);
    for (const match of matches) {
      const rotated = forceRotateSecret(match.id);
      recordLeak({
        projectId: project.id, repoKey, filePath, vaultEntryId: match.id,
        label: match.label, tier: match.tier, action: rotated ? 'rotated' : 'detected'
      });
      logger.warn(`Secret "${match.label}" (${match.tier}) détecté dans ${repoKey}:${filePath} — rotation automatique déclenchée.`);
      createNotification({
        type: 'vault.leak.detected', severity: 'crit', title: 'Secret committé détecté',
        message: `"${match.label}" (${match.tier}) trouvé en clair dans ${repoKey}:${filePath} — régénéré automatiquement.`,
        meta: { projectId: project.id, repoKey, filePath, vaultEntryId: match.id }
      });
    }
  }
}

export async function runSecretLeakScan() {
  const projects = listProjects();
  let scanned = 0;
  for (const project of projects) {
    for (const repoKey of project.repoKeys || []) {
      try {
        await scanRepo(project, repoKey);
        scanned += 1;
      } catch (err) {
        logger.error({ err }, `Échec du scan de fuite de secrets pour ${repoKey}`);
      }
    }
  }
  return { scanned };
}

export function scheduleDailySecretLeakScan() {
  const msUntilNext4am = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  };
  const run = async () => {
    try { await runSecretLeakScan(); } catch (err) { logger.error({ err }, 'Échec du scan planifié de fuite de secrets'); }
    setTimeout(run, 24 * 60 * 60 * 1000);
  };
  setTimeout(run, msUntilNext4am());
}
