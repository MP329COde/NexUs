import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_FILE } from '../store/jsonStore.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupDir = path.resolve(__dirname, '../../data/backups');
fs.mkdirSync(backupDir, { recursive: true });

const RETENTION = 14; // conserve les 14 dernières sauvegardes (~2 semaines en cadence quotidienne)

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// Copie fichier simple du .db : suffisant pour un outil mono-instance à
// cadence de sauvegarde quotidienne/manuelle (pas de sauvegarde à chaud
// garantie pendant une écriture concurrente, acceptable ici).
export function createBackup() {
  if (!fs.existsSync(DB_FILE)) {
    throw Object.assign(new Error('Aucune base à sauvegarder pour le moment'), { status: 409 });
  }
  const file = `nexus-${timestampSlug()}.db`;
  fs.copyFileSync(DB_FILE, path.join(backupDir, file));
  pruneBackups();
  logger.info(`Sauvegarde créée: ${file}`);
  return describeBackup(file);
}

export function listBackups() {
  return fs.readdirSync(backupDir)
    .filter((f) => f.endsWith('.db'))
    .map(describeBackup)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getBackupPath(file) {
  const safe = path.basename(file);
  const full = path.join(backupDir, safe);
  if (!fs.existsSync(full)) return null;
  return full;
}

export function deleteBackup(file) {
  const full = getBackupPath(file);
  if (!full) return false;
  fs.unlinkSync(full);
  return true;
}

function pruneBackups() {
  const backups = listBackups();
  for (const b of backups.slice(RETENTION)) {
    fs.unlinkSync(path.join(backupDir, b.file));
  }
}

function describeBackup(file) {
  const stat = fs.statSync(path.join(backupDir, file));
  return { file, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
}

// Planifie une sauvegarde quotidienne (03h00 locale), sans dépendance externe.
export function scheduleDailyBackups() {
  const msUntilNext3am = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 3, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  };
  const run = () => {
    try { createBackup(); } catch (err) { logger.error({ err }, 'Échec de la sauvegarde planifiée'); }
    setTimeout(run, 24 * 60 * 60 * 1000);
  };
  setTimeout(run, msUntilNext3am());
}
