import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NEXUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-backup-'));

// jsonStore doit être importé (et donc créer nexus.db) avant createBackup().
await import('../src/store/jsonStore.js');
const { createBackup, listBackups, importBackup, restoreBackup } = await import('../src/services/backupService.js');

test('createBackup crée un fichier listé ensuite', () => {
  const backup = createBackup();
  assert.ok(backup.file.endsWith('.db'));
  assert.ok(listBackups().some((b) => b.file === backup.file));
});

test('importBackup rejette un fichier qui n\'est pas une base SQLite', () => {
  assert.throws(() => importBackup(Buffer.from('pas une base sqlite'), 'malicious.db'), /SQLite valide/);
});

test('importBackup accepte un fichier avec le bon en-tête SQLite', () => {
  const fakeSqlite = Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.alloc(100)]);
  const imported = importBackup(fakeSqlite, '../../../etc/passwd');
  // le nom de fichier est neutralisé : pas de traversée de chemin possible
  assert.equal(imported.file.includes('..'), false);
  assert.equal(imported.file.includes('/'), false);
});

test('restoreBackup refuse un fichier de sauvegarde introuvable', () => {
  assert.throws(() => restoreBackup('fichier-qui-n-existe-pas.db'), /introuvable/);
});

test('restoreBackup crée une sauvegarde de sécurité avant de restaurer', () => {
  const backup = createBackup();
  const countBefore = listBackups().length;
  const result = restoreBackup(backup.file);
  assert.ok(result.safetyBackup);
  assert.ok(listBackups().length >= countBefore); // au moins la sauvegarde de sécurité en plus
});
