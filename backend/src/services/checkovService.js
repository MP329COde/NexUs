import { execFile } from 'node:child_process';
import path from 'node:path';
import { logger } from '../utils/logger.js';

// Analyse IaC réelle via le binaire Checkov (open source, Bridgecrew/Prisma
// Cloud Community Edition, jamais de compte payant) sur les Dockerfiles et
// manifests de la plateforme elle-même — cible fermée, comme
// semgrepService.js/trivyService.js, jamais un chemin fourni par le client.
const SCAN_TIMEOUT_MS = 90_000;
const MAX_BUFFER = 20 * 1024 * 1024;

// Racine du dépôt : deux niveaux au-dessus de ce fichier.
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

// Frameworks Checkov réellement supportés par la CE et pertinents pour ce
// dépôt (Dockerfiles présents à la racine, backend/, frontend/) — le
// docker-compose.yml n'a pas de framework Checkov dédié en CE.
const FRAMEWORKS = 'dockerfile';

function run(args) {
  return new Promise((resolve, reject) => {
    execFile('checkov', args, { timeout: SCAN_TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (err, stdout, stderr) => {
      // Checkov sort avec un code non-nul dès qu'un check échoue (comportement
      // voulu pour un usage CI) : ce n'est pas une erreur d'exécution tant
      // qu'on a du JSON exploitable sur stdout.
      if (err && !stdout) {
        reject(Object.assign(new Error(`Échec du scan Checkov : ${(stderr || err.message || '').split('\n')[0]}`), { status: err.code === 'ENOENT' ? 503 : 502 }));
        return;
      }
      resolve(stdout);
    });
  });
}

function summarize(reports, rootPath) {
  const list = Array.isArray(reports) ? reports : [reports];
  const findings = [];
  for (const report of list) {
    for (const f of report.results?.failed_checks || []) {
      findings.push({
        checkId: f.check_id,
        name: f.check_name,
        file: path.relative(rootPath, f.file_abs_path || path.join(rootPath, f.file_path || '')),
        lines: f.file_line_range || null,
        guideline: f.guideline || null
      });
    }
  }
  return { total: findings.length, findings: findings.slice(0, 200) };
}

// Scan d'un répertoire arbitraire déjà cloné sur disque — voir
// projectScanService.js pour l'analyse IaC par projet (Dockerfiles,
// docker-compose, Terraform) plutôt que la seule plateforme elle-même.
export async function scanDirectory(dirPath, frameworks = 'dockerfile,terraform') {
  const stdout = await run(['-d', dirPath, '--framework', frameworks, '-o', 'json', '--compact', '--quiet']);
  let report;
  try {
    report = JSON.parse(stdout);
  } catch (err) {
    logger.error({ err, dirPath }, 'Sortie Checkov illisible');
    throw Object.assign(new Error('Réponse Checkov illisible'), { status: 502 });
  }
  const { total, findings } = summarize(report, dirPath);
  return { scannedAt: new Date().toISOString(), frameworks, total, findings };
}

export async function scanIac() {
  const stdout = await run(['-d', REPO_ROOT, '--framework', FRAMEWORKS, '-o', 'json', '--compact', '--quiet']);
  let report;
  try {
    report = JSON.parse(stdout);
  } catch (err) {
    logger.error({ err }, 'Sortie Checkov illisible');
    throw Object.assign(new Error('Réponse Checkov illisible'), { status: 502 });
  }
  const { total, findings } = summarize(report, REPO_ROOT);
  return { scannedAt: new Date().toISOString(), frameworks: FRAMEWORKS, total, findings };
}
