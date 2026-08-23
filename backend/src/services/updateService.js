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

// Dérive une URL "releases" à partir du remote `origin` (GitHub uniquement,
// ce qui couvre le mode de déploiement documenté). Reste `null` si aucun
// remote GitHub n'est configurable (dépôt hors git, remote absent/privé
// non-GitHub) — le frontend affiche alors un message sans lien plutôt
// qu'un lien mort.
function releasesUrlFromRemote() {
  const remote = git(['remote', 'get-url', 'origin']);
  if (!remote) return null;
  const match = remote.match(/github\.com[/:]([^/]+)\/([^/.]+?)(\.git)?$/);
  if (!match) return null;
  return `https://github.com/${match[1]}/${match[2]}/releases`;
}

// `git rev-parse --is-inside-work-tree` échoue proprement (execFileSync
// lève, `git()` renvoie null) si `repoRoot` n'est pas du tout un dépôt git
// (ex : archive/release téléchargée et dézippée sans `.git`, ou copie
// effectuée sans `git clone`). C'est un cas de déploiement légitime, pas
// une erreur de la console.
function isInsideGitRepo() {
  return git(['rev-parse', '--is-inside-work-tree']) === 'true';
}

// `git symbolic-ref -q --short HEAD` renvoie null (et un code de sortie non
// nul, absorbé par `git()`) quand HEAD est détaché — checkout direct d'un
// tag ou d'un commit précis, ce qui est la manière normale de déployer une
// version figée en production. Ce n'est pas un état invalide : on doit
// pouvoir vérifier les mises à jour et proposer explicitement une branche
// cible plutôt que de bloquer purement et simplement.
function currentBranchOrNull() {
  return git(['symbolic-ref', '-q', '--short', 'HEAD']);
}

export function getVersion() {
  if (!isInsideGitRepo()) {
    return {
      packageVersion: backendPkg.version,
      commit: null,
      branch: null,
      detached: false,
      gitAvailable: false
    };
  }
  const branch = currentBranchOrNull();
  return {
    packageVersion: backendPkg.version,
    commit: git(['rev-parse', '--short', 'HEAD']),
    branch, // null si HEAD détaché
    detached: branch === null,
    gitAvailable: true
  };
}

// `targetBranch` : branche à comparer avec `origin/<targetBranch>` quand
// HEAD est détaché (aucune branche courante à déduire). Le frontend la
// laisse vide par défaut (comparaison désactivée tant que l'administrateur
// ne l'a pas choisie explicitement) plutôt que de deviner "main"/"master",
// ce qui pourrait comparer contre la mauvaise ligne de publication.
export function checkForUpdates(targetBranch) {
  if (!isInsideGitRepo()) {
    return {
      checked: false,
      gitAvailable: false,
      detached: false,
      message: "Ce déploiement n'est pas un dépôt git (installation depuis une archive/release sans .git, ou copie de fichiers) : la vérification automatique est impossible ici.",
      alternative: 'download-archive',
      releasesUrl: releasesUrlFromRemote()
    };
  }

  const branch = currentBranchOrNull();
  const detached = branch === null;
  const currentCommit = git(['rev-parse', '--short', 'HEAD']);

  if (detached && !targetBranch) {
    return {
      checked: false,
      gitAvailable: true,
      detached: true,
      currentCommit,
      message: `HEAD détaché sur le commit ${currentCommit} (déploiement d'un tag/commit précis, ce qui est normal en production). Choisissez une branche cible pour comparer avec origin.`,
      needsTargetBranch: true
    };
  }

  const compareBranch = branch || targetBranch;
  const fetch = git(['fetch', '--quiet', 'origin', compareBranch]);
  if (fetch === null) {
    return {
      checked: false,
      gitAvailable: true,
      detached,
      branch: compareBranch,
      currentCommit,
      message: `Impossible de contacter le dépôt distant (origin) pour ${compareBranch}. Vérifiez l'accès réseau/les identifiants git.`
    };
  }
  const counts = git(['rev-list', '--left-right', '--count', `HEAD...origin/${compareBranch}`]);
  if (!counts) {
    return {
      checked: false,
      gitAvailable: true,
      detached,
      branch: compareBranch,
      currentCommit,
      message: `Comparaison avec origin/${compareBranch} impossible (branche distante introuvable ?).`
    };
  }
  const [ahead, behind] = counts.split(/\s+/).map(Number);
  return {
    checked: true,
    gitAvailable: true,
    detached,
    branch: compareBranch,
    currentCommit,
    ahead,
    behind,
    upToDate: behind === 0,
    message: behind > 0
      ? `${behind} commit(s) disponible(s) sur origin/${compareBranch}${detached ? ' (HEAD détaché — comparaison manuelle)' : ''}. Exécutez "git pull" puis réinstallez/redémarrez la console.`
      : `La console est à jour avec origin/${compareBranch}${detached ? ' (HEAD détaché — comparaison manuelle)' : ''}.`
  };
}
