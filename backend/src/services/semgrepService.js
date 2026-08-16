import { execFile } from 'node:child_process';
import path from 'node:path';
import { logger } from '../utils/logger.js';

// Analyse statique réelle via le binaire Semgrep (open source, règles
// communautaires gratuites `--config auto`) — jamais de compte Semgrep
// AppSec payant, jamais de donnée simulée. Cible fixe et fermée (le code
// source de la plateforme elle-même : backend/src et frontend/src) plutôt
// qu'un chemin arbitraire fourni par le client, pour ne jamais exposer une
// traversée de chemin sur le système de fichiers du serveur.
const SCAN_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 20 * 1024 * 1024;

// Racine du dépôt : deux niveaux au-dessus de ce fichier
// (backend/src/services/semgrepService.js → backend/src → backend → racine).
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

const TARGETS = {
  backend: path.join(REPO_ROOT, 'backend', 'src'),
  frontend: path.join(REPO_ROOT, 'frontend', 'src'),
  all: REPO_ROOT
};

export function isValidTarget(target) {
  return Object.prototype.hasOwnProperty.call(TARGETS, target);
}

function run(args) {
  return new Promise((resolve, reject) => {
    execFile('semgrep', args, { timeout: SCAN_TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (err, stdout, stderr) => {
      if (err && !stdout) {
        reject(Object.assign(new Error(`Échec du scan Semgrep : ${(stderr || err.message || '').split('\n')[0]}`), { status: err.code === 'ENOENT' ? 503 : 502 }));
        return;
      }
      resolve(stdout);
    });
  });
}

const SEVERITY_ORDER = ['ERROR', 'WARNING', 'INFO'];

function summarize(report, rootPath) {
  const counts = { ERROR: 0, WARNING: 0, INFO: 0 };
  const findings = [];
  for (const r of report.results || []) {
    const sev = SEVERITY_ORDER.includes(r.extra?.severity) ? r.extra.severity : 'INFO';
    counts[sev] += 1;
    findings.push({
      ruleId: r.check_id,
      severity: sev,
      // Chemin relatif à la racine du dépôt, jamais le chemin absolu du
      // serveur — évite d'exposer la structure de fichiers de l'hôte.
      file: path.relative(rootPath, r.path),
      line: r.start?.line,
      message: (r.extra?.message || '').split('\n')[0].slice(0, 300),
      owasp: r.extra?.metadata?.owasp?.[0] || null,
      cwe: r.extra?.metadata?.cwe?.[0] || null
    });
  }
  findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  return { counts, total: findings.length, findings: findings.slice(0, 200) };
}

export async function scanCode(target) {
  if (!isValidTarget(target)) {
    throw Object.assign(new Error('Cible de scan invalide'), { status: 400 });
  }
  const targetPath = TARGETS[target];
  const stdout = await run(['--config', 'auto', '--json', '--quiet', '--timeout', '100', targetPath]);
  let report;
  try {
    report = JSON.parse(stdout);
  } catch (err) {
    logger.error({ err, target }, 'Sortie Semgrep illisible');
    throw Object.assign(new Error('Réponse Semgrep illisible'), { status: 502 });
  }
  const { counts, total, findings } = summarize(report, REPO_ROOT);
  return { target, scannedAt: new Date().toISOString(), counts, total, findings };
}

// Scan d'un répertoire arbitraire déjà présent sur disque (jamais un chemin
// fourni tel quel par le client — voir projectScanService.js, qui clone
// d'abord le dépôt d'un projet dans un dossier temporaire contrôlé par le
// backend avant d'appeler cette fonction). Même sortie que scanCode(),
// utilisée pour le SAST par projet plutôt que le seul code de la plateforme.
export async function scanDirectory(dirPath) {
  const stdout = await run(['--config', 'auto', '--json', '--quiet', '--timeout', '100', dirPath]);
  let report;
  try {
    report = JSON.parse(stdout);
  } catch (err) {
    logger.error({ err, dirPath }, 'Sortie Semgrep illisible');
    throw Object.assign(new Error('Réponse Semgrep illisible'), { status: 502 });
  }
  const { counts, total, findings } = summarize(report, dirPath);
  return { scannedAt: new Date().toISOString(), counts, total, findings };
}
