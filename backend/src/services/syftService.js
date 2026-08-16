import { execFile } from 'node:child_process';
import { logger } from '../utils/logger.js';
import { isValidImageRef } from './trivyService.js';

// Génération de SBOM réelle via le binaire Syft (Anchore, open source) —
// même référence d'image que le scanner Trivy (voir trivyService.js pour
// la validation stricte du format), jamais de service tiers hébergé.
const SCAN_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 20 * 1024 * 1024;

function run(args) {
  return new Promise((resolve, reject) => {
    execFile('syft', args, { timeout: SCAN_TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (err, stdout, stderr) => {
      if (err && !stdout) {
        reject(Object.assign(new Error(`Échec de la génération SBOM : ${(stderr || err.message || '').split('\n')[0]}`), { status: err.code === 'ENOENT' ? 503 : 502 }));
        return;
      }
      resolve(stdout);
    });
  });
}

function summarize(report, imageRef) {
  const artifacts = report.artifacts || [];
  const byType = {};
  const packages = artifacts.map((a) => {
    byType[a.type] = (byType[a.type] || 0) + 1;
    return {
      name: a.name,
      version: a.version,
      type: a.type,
      licenses: (a.licenses || []).map((l) => l.value || l.spdxExpression).filter(Boolean),
      purl: a.purl || null
    };
  });
  packages.sort((a, b) => a.name.localeCompare(b.name));
  return {
    imageRef,
    total: packages.length,
    byType,
    packages: packages.slice(0, 500)
  };
}

export async function generateSbom(imageRef) {
  if (!isValidImageRef(imageRef)) {
    throw Object.assign(new Error('Référence d\'image invalide'), { status: 400 });
  }
  const stdout = await run([imageRef, '-o', 'json', '--quiet']);
  let report;
  try {
    report = JSON.parse(stdout);
  } catch (err) {
    logger.error({ err, imageRef }, 'Sortie Syft illisible');
    throw Object.assign(new Error('Réponse Syft illisible'), { status: 502 });
  }
  const { total, byType, packages } = summarize(report, imageRef);
  return { imageRef, generatedAt: new Date().toISOString(), total, byType, packages };
}
