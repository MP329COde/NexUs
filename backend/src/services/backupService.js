import fs from 'node:fs';
import path from 'node:path';
import { DB_FILE } from '../store/jsonStore.js';
import { logger } from '../utils/logger.js';
import { dataDir } from '../config/paths.js';

const backupDir = path.join(dataDir, 'backups');
fs.mkdirSync(backupDir, { recursive: true });

const RETENTION = 14; // conserve les 14 dernières sauvegardes (~2 semaines en cadence quotidienne)
const SQLITE_MAGIC = 'SQLite format 3\0';
const MAX_IMPORT_BYTES = 200 * 1024 * 1024; // 200 Mo, largement suffisant pour ce cas d'usage

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// Copie fichier simple du .db : suffisant pour un outil mono-instance à
// cadence de sauvegarde quotidienne/manuelle (pas de sauvegarde à chaud
// garantie pendant une écriture concurrente, acceptable ici).
export function createBackup(prefix = 'nexus') {
  if (!fs.existsSync(DB_FILE)) {
    throw Object.assign(new Error('Aucune base à sauvegarder pour le moment'), { status: 409 });
  }
  const file = `${prefix}-${timestampSlug()}.db`;
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

function assertSqliteFile(buffer) {
  const header = buffer.subarray(0, SQLITE_MAGIC.length).toString('latin1');
  if (header !== SQLITE_MAGIC) {
    throw Object.assign(new Error("Le fichier fourni n'est pas une base SQLite valide"), { status: 400 });
  }
}

// Enregistre un fichier .db envoyé depuis l'interface (ex: une sauvegarde
// téléchargée précédemment) dans le dossier des sauvegardes, pour qu'il
// puisse ensuite être restauré comme n'importe quelle sauvegarde automatique.
export function importBackup(buffer, originalName) {
  if (buffer.length === 0) throw Object.assign(new Error('Fichier vide'), { status: 400 });
  if (buffer.length > MAX_IMPORT_BYTES) throw Object.assign(new Error('Fichier trop volumineux (200 Mo max)'), { status: 400 });
  assertSqliteFile(buffer);
  const safeName = path.basename(originalName || 'import.db').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const file = `imported-${timestampSlug()}-${safeName}`;
  fs.writeFileSync(path.join(backupDir, file), buffer);
  pruneBackups();
  logger.info(`Sauvegarde importée: ${file}`);
  return describeBackup(file);
}

// Remplace la base active par le contenu d'une sauvegarde. Une sauvegarde de
// sécurité de l'état actuel est créée juste avant, au cas où la restauration
// serait déclenchée par erreur. L'appelant (route) exige la ré-authentification
// par mot de passe avant d'invoquer cette fonction.
export function restoreBackup(file) {
  const source = getBackupPath(file);
  if (!source) throw Object.assign(new Error('Sauvegarde introuvable'), { status: 404 });
  const buffer = fs.readFileSync(source);
  assertSqliteFile(buffer);
  let safetyBackup = null;
  try {
    safetyBackup = createBackup('pre-restore');
  } catch {
    // pas de base existante à sauvegarder avant restauration (premier import) : ignoré
  }
  fs.copyFileSync(source, DB_FILE);
  logger.warn(`Base restaurée depuis ${file}`);
  return { restoredFrom: file, safetyBackup };
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
