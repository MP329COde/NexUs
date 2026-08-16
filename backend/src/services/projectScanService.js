import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getRawIntegration } from '../store/settingsStore.js';
import * as gitlab from './integrations/gitlabService.js';
import * as semgrep from './semgrepService.js';
import * as checkov from './checkovService.js';
import * as trivy from './trivyService.js';

// SAST/SCA/IaC réels par projet : clone superficiellement (--depth 1) le
// dépôt d'un projet dans un dossier temporaire du système (jamais un chemin
// fourni par le client — voir aussi secretLeakScanService.js qui, lui, lit
// les fichiers via l'API sans cloner), lance Semgrep/Trivy/Checkov dessus,
// puis supprime le clone. Complémentaire aux scans "plateforme entière"
// existants (semgrepService.scanCode/checkovService.scanIac).
const CLONE_TIMEOUT_MS = 60_000;

function buildAuthUrl(provider, webUrl) {
  const url = new URL(webUrl.endsWith('.git') ? webUrl : `${webUrl}.git`);
  if (provider === 'github') {
    const { token } = getRawIntegration('github');
    if (token) { url.username = 'x-access-token'; url.password = token; }
  } else if (provider === 'gitlab') {
    const { token } = getRawIntegration('gitlab');
    if (token) { url.username = 'oauth2'; url.password = token; }
  }
  return url.toString();
}

async function resolveCloneUrl(repoKey) {
  const [provider, ...rest] = repoKey.split(':');
  const id = rest.join(':');
  if (provider === 'gitlab') {
    const project = await gitlab.getProject(id);
    return buildAuthUrl('gitlab', project.webUrl);
  }
  if (provider === 'github') {
    return buildAuthUrl('github', `https://github.com/${id}`);
  }
  throw Object.assign(new Error(`Scan par projet non pris en charge pour le fournisseur "${provider}"`), { status: 400 });
}

// Le jeton d'accès circule dans cloneUrl : jamais logué, jamais renvoyé dans
// un message d'erreur (git peut l'inclure dans stderr en cas d'échec
// d'authentification) — message générique côté appelant à la place.
function cloneRepo(cloneUrl, destDir) {
  return new Promise((resolve, reject) => {
    execFile('git', ['clone', '--depth', '1', '--quiet', cloneUrl, destDir], { timeout: CLONE_TIMEOUT_MS }, (err) => {
      if (err) {
        reject(Object.assign(new Error('Échec du clonage du dépôt (accès refusé ou dépôt introuvable — vérifiez le jeton configuré dans Paramètres → Services Git)'), { status: 502 }));
        return;
      }
      resolve();
    });
  });
}

export async function scanRepo(repoKey) {
  const cloneUrl = await resolveCloneUrl(repoKey);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-scan-'));
  try {
    await cloneRepo(cloneUrl, dir);
    const [sast, sca, iac] = await Promise.allSettled([
      semgrep.scanDirectory(dir),
      trivy.scanFilesystem(dir),
      checkov.scanDirectory(dir)
    ]);
    return {
      repoKey,
      scannedAt: new Date().toISOString(),
      sast: sast.status === 'fulfilled' ? sast.value : { error: sast.reason.message },
      sca: sca.status === 'fulfilled' ? sca.value : { error: sca.reason.message },
      iac: iac.status === 'fulfilled' ? iac.value : { error: iac.reason.message }
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function scanProjectRepos(repoKeys) {
  const results = [];
  for (const repoKey of repoKeys) {
    try {
      results.push(await scanRepo(repoKey));
    } catch (err) {
      results.push({ repoKey, scannedAt: new Date().toISOString(), error: err.message });
    }
  }
  return results;
}
