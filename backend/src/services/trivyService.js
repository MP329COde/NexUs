import { execFile } from 'node:child_process';
import { logger } from '../utils/logger.js';

// Scan de vulnérabilités réel via le binaire Trivy (Aqua Security, open
// source) installé sur la machine qui héberge le backend — jamais de
// service tiers hébergé, jamais de donnée simulée : si Trivy n'est pas
// installé, le scan échoue explicitement plutôt que d'inventer un résultat
// (voir devToolsService.js pour la détection de sa présence).
const SCAN_TIMEOUT_MS = 150_000; // trivy --timeout 120s + marge pour le démarrage du process
const MAX_BUFFER = 20 * 1024 * 1024; // un rapport JSON peut être volumineux sur une image chargée

// Référence d'image Docker valide : `[registre/]dépôt[:tag|@sha256:digest]`.
// Passée en argument execFile (jamais via un shell), donc pas d'injection de
// commande possible même sans cette validation — mais elle évite qu'un champ
// texte libre ne devienne accidentellement un flag Trivy (ex. "--reset").
const IMAGE_REF_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[a-zA-Z0-9._-]+|@sha256:[a-f0-9]{64})?$/;

export function isValidImageRef(ref) {
  return typeof ref === 'string' && ref.length > 0 && ref.length < 256 && IMAGE_REF_PATTERN.test(ref);
}

function run(args) {
  return new Promise((resolve, reject) => {
    execFile('trivy', args, { timeout: SCAN_TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (err, stdout, stderr) => {
      if (err && !stdout) {
        reject(Object.assign(new Error(`Échec du scan Trivy : ${(stderr || err.message || '').split('\n')[0]}`), { status: err.code === 'ENOENT' ? 503 : 502 }));
        return;
      }
      resolve(stdout);
    });
  });
}

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];

function summarize(report) {
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
  const findings = [];
  for (const result of report.Results || []) {
    for (const v of result.Vulnerabilities || []) {
      const sev = SEVERITY_ORDER.includes(v.Severity) ? v.Severity : 'UNKNOWN';
      counts[sev] += 1;
      findings.push({
        id: v.VulnerabilityID, severity: sev, target: result.Target,
        package: v.PkgName, installedVersion: v.InstalledVersion, fixedVersion: v.FixedVersion || null,
        title: v.Title || v.VulnerabilityID
      });
    }
  }
  findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  return { counts, total: findings.length, findings: findings.slice(0, 200) };
}

export async function scanImage(imageRef) {
  if (!isValidImageRef(imageRef)) {
    throw Object.assign(new Error('Référence d\'image invalide'), { status: 400 });
  }
  const stdout = await run(['image', '--format', 'json', '--quiet', '--timeout', '120s', imageRef]);
  let report;
  try {
    report = JSON.parse(stdout);
  } catch (err) {
    logger.error({ err, imageRef }, 'Sortie Trivy illisible');
    throw Object.assign(new Error('Réponse Trivy illisible'), { status: 502 });
  }
  const { counts, total, findings } = summarize(report);
  return {
    imageRef,
    scannedAt: new Date().toISOString(),
    osFamily: report.Metadata?.OS?.Family || null,
    osVersion: report.Metadata?.OS?.Name || null,
    counts, total, findings
  };
}

// SCA (Software Composition Analysis) sur les dépendances déclarées d'un
// répertoire déjà cloné sur disque (package-lock.json, requirements.txt,
// go.sum...) — `trivy fs`, complémentaire au scan d'image ci-dessus. Voir
// projectScanService.js pour le clonage contrôlé côté projet.
export async function scanFilesystem(dirPath) {
  const stdout = await run(['fs', '--format', 'json', '--quiet', '--timeout', '120s', dirPath]);
  let report;
  try {
    report = JSON.parse(stdout);
  } catch (err) {
    logger.error({ err, dirPath }, 'Sortie Trivy illisible');
    throw Object.assign(new Error('Réponse Trivy illisible'), { status: 502 });
  }
  const { counts, total, findings } = summarize(report);
  return { scannedAt: new Date().toISOString(), counts, total, findings };
}
