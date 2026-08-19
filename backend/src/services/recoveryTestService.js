import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getBackupPath } from './backupService.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ENTRY = path.resolve(__dirname, '../index.js');
const PORT_RANGE = [21000, 25999];
const BOOT_TIMEOUT_MS = 15000;
const AUTO_EXPIRE_MS = 15 * 60 * 1000; // 15 min : évite d'accumuler des process orphelins si l'admin oublie de détruire le test

// Restauration "à blanc" (todo.md, chantier Recovery Test) : contrairement à
// backupService.restoreBackup() qui remplace la base active en place, ceci
// démarre une **second process backend complet**, isolé via NEXUS_DATA_DIR
// (déjà prévu par config/paths.js pour l'isolation des tests automatisés) et
// un port éphémère — jamais aucun fichier de l'instance de production n'est
// touché. Validation automatique : dès que le process répond sur
// /api/status/health puis /api/setup/status, on sait que la base restaurée
// démarre réellement et contient des utilisateurs (needsSetup=false), sans
// avoir à ouvrir de session ni inventer de résultat.
const tests = new Map(); // id -> { child, port, tmpDir, backupFile, startedAt, expiresAt, status, error, timer }

function randomPort() {
  const [min, max] = PORT_RANGE;
  return min + Math.floor(Math.random() * (max - min));
}

async function pollUntilReady(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/status/health`);
      if (res.ok) return true;
    } catch {
      // le process n'écoute pas encore — on réessaie jusqu'au timeout
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

export async function startRecoveryTest(backupFile) {
  const sourcePath = getBackupPath(backupFile);
  if (!sourcePath) throw Object.assign(new Error('Sauvegarde introuvable'), { status: 404 });

  const id = crypto.randomUUID();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-recovery-'));
  fs.copyFileSync(sourcePath, path.join(tmpDir, 'nexus.db'));

  const port = randomPort();
  const child = spawn(process.execPath, [BACKEND_ENTRY], {
    env: {
      ...process.env,
      PORT: String(port),
      NEXUS_DATA_DIR: tmpDir,
      // Le socle relationnel (Postgres) est partagé par toute la plateforme —
      // jamais touché par un test de restauration, qui ne porte que sur la
      // copie SQLite isolée ci-dessus. Le process de test tourne donc
      // volontairement en mode "legacy" (sans organisations/projets/RBAC),
      // limite documentée dans l'UI plutôt que masquée.
      DATABASE_URL: ''
    },
    cwd: path.resolve(__dirname, '../..'),
    stdio: 'ignore'
  });

  const entry = { child, port, tmpDir, backupFile, startedAt: new Date().toISOString(), expiresAt: null, status: 'starting', error: null, timer: null };
  tests.set(id, entry);

  child.on('exit', (code) => {
    if (entry.status !== 'destroyed') {
      entry.status = 'crashed';
      entry.error = `Le process de test s'est arrêté (code ${code})`;
      logger.warn(`Recovery test ${id} : process arrêté prématurément (code ${code})`);
    }
  });

  const ready = await pollUntilReady(port, BOOT_TIMEOUT_MS);
  if (!ready) {
    entry.status = 'failed';
    entry.error = "La sauvegarde n'a pas pu démarrer (timeout au boot) — probablement un fichier corrompu.";
    stopRecoveryTest(id).catch(() => {});
    return describeTest(id);
  }

  let needsSetup = null;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/setup/status`);
    const body = await res.json();
    needsSetup = body.needsSetup;
  } catch {
    // best-effort : le boot a réussi (health OK) même si ce second appel échoue
  }

  entry.status = 'running';
  entry.needsSetup = needsSetup;
  entry.expiresAt = new Date(Date.now() + AUTO_EXPIRE_MS).toISOString();
  entry.timer = setTimeout(() => stopRecoveryTest(id).catch(() => {}), AUTO_EXPIRE_MS);
  logger.info(`Recovery test ${id} : sauvegarde ${backupFile} démarrée sur le port ${port} (needsSetup=${needsSetup})`);
  return describeTest(id);
}

export function listRecoveryTests() {
  return [...tests.keys()].map(describeTest);
}

export function getRecoveryTest(id) {
  if (!tests.has(id)) return null;
  return describeTest(id);
}

export async function stopRecoveryTest(id) {
  const entry = tests.get(id);
  if (!entry) return false;
  if (entry.timer) clearTimeout(entry.timer);
  entry.status = 'destroyed';
  try { entry.child.kill(); } catch { /* déjà arrêté */ }
  try { fs.rmSync(entry.tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  tests.delete(id);
  return true;
}

function describeTest(id) {
  const e = tests.get(id);
  if (!e) return null;
  return {
    id,
    backupFile: e.backupFile,
    port: e.port,
    status: e.status,
    error: e.error,
    needsSetup: e.needsSetup ?? null,
    startedAt: e.startedAt,
    expiresAt: e.expiresAt
  };
}

// Filet de sécurité : si le process principal s'arrête (redéploiement,
// crash), aucun process de test ne doit rester orphelin en arrière-plan.
process.on('exit', () => {
  for (const [, entry] of tests) {
    try { entry.child.kill(); } catch { /* ignoré */ }
  }
});
