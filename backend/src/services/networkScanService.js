import { execFile } from 'node:child_process';
import { readStore, writeStore } from '../store/jsonStore.js';

const MAX_SCANS_KEPT = 10;

// N'accepte qu'une IP unique ou un CIDR IPv4 strict (ex. 10.0.0.0/24), jamais
// un flag (rien commençant par "-") : même si execFile (pas de shell) rend
// déjà l'injection de commande impossible, on refuse aussi l'injection
// d'options nmap arbitraires (--script, -oN, etc.) via la cible.
const TARGET_PATTERN = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

function assertValidTarget(target) {
  if (!TARGET_PATTERN.test(target)) {
    throw Object.assign(new Error('Cible invalide : adresse IPv4 ou CIDR attendu (ex. 10.0.0.0/24)'), { status: 400 });
  }
  const octets = target.split('/')[0].split('.');
  if (!octets.every((o) => Number(o) <= 255)) {
    throw Object.assign(new Error('Cible invalide : octet hors plage (0-255)'), { status: 400 });
  }
  const prefix = target.split('/')[1];
  if (prefix !== undefined && Number(prefix) > 32) {
    throw Object.assign(new Error('Cible invalide : préfixe CIDR hors plage (0-32)'), { status: 400 });
  }
}

// Parse la sortie "grepable" de nmap (-oG -), plus simple et stable à parser
// que la sortie texte par défaut.
function parseGrepableOutput(output) {
  const hosts = [];
  for (const line of output.split('\n')) {
    if (!line.startsWith('Host:')) continue;
    const ipMatch = line.match(/^Host:\s+(\S+)/);
    const portsMatch = line.match(/Ports:\s+([^\t]+)/);
    if (!ipMatch) continue;
    const ports = [];
    if (portsMatch) {
      for (const entry of portsMatch[1].split(',')) {
        const parts = entry.trim().split('/');
        if (parts[1] === 'open') ports.push({ port: parts[0], service: parts[4] || 'inconnu' });
      }
    }
    if (ports.length > 0) hosts.push({ ip: ipMatch[1], ports });
  }
  return hosts;
}

export function listScans() {
  return readStore('networkScans') || [];
}

export function getLastScan() {
  const scans = listScans();
  return scans[0] || null;
}

export function runScan(target) {
  assertValidTarget(target);
  return new Promise((resolve, reject) => {
    execFile('nmap', ['-sV', '-T4', '--host-timeout', '30s', '-oG', '-', target], { timeout: 120_000 }, (err, stdout) => {
      if (err) {
        if (err.code === 'ENOENT') {
          return reject(Object.assign(new Error("nmap n'est pas installé sur cette machine (apt install nmap / brew install nmap)."), { status: 409 }));
        }
        return reject(Object.assign(new Error(`Échec du scan : ${err.message}`), { status: 502 }));
      }
      const hosts = parseGrepableOutput(stdout);
      const scan = { id: Date.now().toString(36), target, startedAt: new Date().toISOString(), hosts, hostCount: hosts.length };
      const scans = [scan, ...listScans()].slice(0, MAX_SCANS_KEPT);
      writeStore('networkScans', scans);
      resolve(scan);
    });
  });
}
