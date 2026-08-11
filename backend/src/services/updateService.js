import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const backendPkg = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));

function git(args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', timeout: 15_000 }).trim();
  } catch {
    return null;
  }
}

// Lecture seule : ne modifie jamais le dépôt. `git pull` reste une action
// volontaire de l'administrateur (en ligne de commande, ou via le processus
// de déploiement habituel) — la console ne se met jamais à jour ni ne se
// redémarre elle-même sans intervention humaine.
export function getVersion() {
  return {
    packageVersion: backendPkg.version,
    commit: git(['rev-parse', '--short', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD'])
  };
}

export function checkForUpdates() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch || branch === 'HEAD') {
    return { checked: false, message: 'Dépôt en détachement HEAD ou hors dépôt git : vérification impossible' };
  }
  const fetch = git(['fetch', '--quiet', 'origin', branch]);
  if (fetch === null) {
    return { checked: false, message: "Impossible de contacter le dépôt distant (origin). Vérifiez l'accès réseau/les identifiants git." };
  }
  const counts = git(['rev-list', '--left-right', '--count', `HEAD...origin/${branch}`]);
  if (!counts) return { checked: false, message: 'Comparaison avec origin impossible' };
  const [ahead, behind] = counts.split(/\s+/).map(Number);
  return {
    checked: true,
    branch,
    ahead,
    behind,
    upToDate: behind === 0,
    message: behind > 0
      ? `${behind} commit(s) disponible(s) sur origin/${branch}. Exécutez "git pull" puis réinstallez/redémarrez la console.`
      : 'La console est à jour avec origin.'
  };
}
