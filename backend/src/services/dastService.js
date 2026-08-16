import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listProxies } from '../store/proxyStore.js';
import { logger } from '../utils/logger.js';

// DAST réel via le binaire OWASP ZAP (open source, zap-baseline.py, jamais
// de service tiers hébergé) — analyse dynamique d'une application déjà en
// cours d'exécution, contrairement au SAST/SCA/IaC qui analysent du code
// statique. Cible strictement limitée à un domaine déjà déclaré côté
// Réseaux → Proxies : Nexus ne doit jamais servir de scanner ouvert contre
// une cible tierce arbitraire (SSRF/abus).
const SCAN_TIMEOUT_MS = 300_000; // un baseline scan ZAP peut prendre plusieurs minutes
const MAX_BUFFER = 20 * 1024 * 1024;

export function isKnownTarget(url) {
  let hostname;
  try {
    ({ hostname } = new URL(url));
  } catch {
    return false;
  }
  return listProxies().some((p) => p.domain === hostname);
}

function run(dir, args) {
  return new Promise((resolve, reject) => {
    execFile('zap-baseline.py', args, { cwd: dir, timeout: SCAN_TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (err) => {
      // zap-baseline.py sort avec un code non-nul dès qu'une alerte WARN/FAIL
      // est trouvée (comportement voulu en usage CI) : pas une erreur
      // d'exécution en soi tant que le rapport JSON a bien été écrit.
      if (err?.code === 'ENOENT') {
        reject(Object.assign(new Error('OWASP ZAP non installé sur la machine backend (zap-baseline.py introuvable)'), { status: 503 }));
        return;
      }
      resolve();
    });
  });
}

const RISK_ORDER = ['High', 'Medium', 'Low', 'Informational'];

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, '').trim();
}

function summarize(report) {
  const counts = { High: 0, Medium: 0, Low: 0, Informational: 0 };
  const findings = [];
  for (const site of report.site || []) {
    for (const alert of site.alerts || []) {
      const risk = RISK_ORDER.includes(alert.riskdesc?.split(' ')[0]) ? alert.riskdesc.split(' ')[0] : 'Informational';
      counts[risk] = (counts[risk] || 0) + 1;
      findings.push({
        name: alert.name,
        risk,
        confidence: alert.confidence || null,
        description: stripHtml(alert.desc).slice(0, 300),
        solution: stripHtml(alert.solution).slice(0, 300),
        instances: alert.instances?.length || 1,
        cweid: alert.cweid || null
      });
    }
  }
  findings.sort((a, b) => RISK_ORDER.indexOf(a.risk) - RISK_ORDER.indexOf(b.risk));
  return { counts, total: findings.length, findings: findings.slice(0, 100) };
}

export async function scanUrl(url) {
  if (!isKnownTarget(url)) {
    throw Object.assign(new Error('Cible refusée : seul un domaine déjà déclaré dans Réseaux → Proxies peut être scanné'), { status: 400 });
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-dast-'));
  try {
    await run(dir, ['-t', url, '-J', 'report.json', '-m', '5']);
    let report;
    try {
      report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
    } catch (err) {
      logger.error({ err, url }, 'Rapport ZAP illisible');
      throw Object.assign(new Error('Rapport OWASP ZAP illisible — le scan a peut-être échoué avant de terminer'), { status: 502 });
    }
    const { counts, total, findings } = summarize(report);
    return { url, scannedAt: new Date().toISOString(), counts, total, findings };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
