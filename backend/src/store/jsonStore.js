import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { logger } from '../utils/logger.js';
import { dataDir } from '../config/paths.js';

fs.mkdirSync(dataDir, { recursive: true });

export const DB_FILE = path.join(dataDir, 'nexus.db');

const DEFAULTS = {
  users: [],
  integrations: {}, // { kubernetes: {...}, argocd: {...}, haproxy: {...}, gitlab: {...}, proxmox: {...}, traefik: {...}, certManager: {...}, grafana: {...} }
  proxies: [], // reverse-proxy entries gérées par la console
  domains: [], // domaines + certificats suivis
  deployments: [], // liaisons GitLab -> Argo CD -> Kubernetes -> Proxy par application
  hosts: [], // hôtes gérés via SSH pour l'installation d'agents (catalogue fermé)
  audit: [], // journal des actions administratives sensibles (voir services/auditService.js)
  console: { name: 'Nexus Console', baseDomain: 'homelab.local' },
  groups: [], // groupes fonctionnels + matrice de permissions (voir store/groupsStore.js)
  inventory: [], // actifs matériels suivis (voir store/inventoryStore.js)
  identity: {}, // politique de connexion + config SSO (voir store/identityStore.js)
  banlist: [], // adresses IP bloquées à l'entrée de la console (voir store/banlistStore.js)
  networkScans: [], // historique des scans réseau nmap (voir services/networkScanService.js)
  volumes: [], // suivi déclaratif des volumes de stockage (voir store/volumeStore.js)
  firewall: {}, // réglages du pare-feu applicatif : blocage automatique (voir store/firewallStore.js)
  vault: [] // secrets dev/prod chiffrés au repos (voir store/vaultStore.js)
};

// SQLite (module natif node:sqlite, aucune dépendance de compilation) utilisée
// comme table clé/valeur : chaque "collection" (users, proxies, ...) reste un
// blob JSON, mais les écritures sont désormais atomiques et le fichier unique
// nexus.db se sauvegarde par simple copie (voir services/backupService.js).
// Signature de module inchangée (readStore/writeStore) pour ne pas impacter
// le reste du code, qui ignore tout de ce détail de stockage.
const db = new DatabaseSync(DB_FILE);
db.exec('CREATE TABLE IF NOT EXISTS kv_store (name TEXT PRIMARY KEY, data TEXT NOT NULL)');

migrateLegacyJsonFiles();

function migrateLegacyJsonFiles() {
  for (const name of Object.keys(DEFAULTS)) {
    const legacyFile = path.join(dataDir, `${name}.json`);
    if (!fs.existsSync(legacyFile)) continue;
    const hasRow = db.prepare('SELECT 1 FROM kv_store WHERE name = ?').get(name);
    if (hasRow) continue;
    try {
      const data = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
      db.prepare('INSERT INTO kv_store (name, data) VALUES (?, ?)').run(name, JSON.stringify(data));
      fs.renameSync(legacyFile, `${legacyFile}.migrated`);
      logger.warn(`Migration de ${name}.json vers SQLite (nexus.db) effectuée.`);
    } catch (err) {
      logger.error({ err }, `Échec de la migration de ${name}.json vers SQLite`);
    }
  }
}

export function readStore(name) {
  const row = db.prepare('SELECT data FROM kv_store WHERE name = ?').get(name);
  if (!row) return DEFAULTS[name] ?? null;
  try {
    return JSON.parse(row.data);
  } catch {
    return DEFAULTS[name] ?? null;
  }
}

export function writeStore(name, data) {
  db.prepare('INSERT INTO kv_store (name, data) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET data = excluded.data')
    .run(name, JSON.stringify(data));
  return data;
}
