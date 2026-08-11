import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');
fs.mkdirSync(dataDir, { recursive: true });

const DEFAULTS = {
  users: [],
  integrations: {}, // { kubernetes: {...}, argocd: {...}, haproxy: {...}, gitlab: {...}, proxmox: {...}, traefik: {...}, certManager: {...}, grafana: {...} }
  proxies: [], // reverse-proxy entries gérées par la console
  domains: [], // domaines + certificats suivis
  deployments: [], // liaisons GitLab -> Argo CD -> Kubernetes -> Proxy par application
  hosts: [], // hôtes gérés via SSH pour l'installation d'agents (catalogue fermé)
  console: { name: 'Nexus Console', baseDomain: 'homelab.local' }
};

// Persistance JSON simple pour un outil mono-instance/mono-utilisateur.
// Suffisant ici: pas de concurrence d'écriture réelle (une seule console admin).
function loadFile(name) {
  const file = path.join(dataDir, `${name}.json`);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(DEFAULTS[name] ?? null, null, 2));
  }
  return file;
}

export function readStore(name) {
  const file = loadFile(name);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return DEFAULTS[name] ?? null;
  }
}

export function writeStore(name, data) {
  const file = loadFile(name);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return data;
}
