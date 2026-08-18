import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, saveConfig, clearConfig, configPath } from '../src/config.js';

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cli-test-'));
}

test('loadConfig : aucun fichier → null, jamais une exception qui casserait toute commande', () => {
  assert.equal(loadConfig(tmpHome()), null);
});

test('saveConfig/loadConfig : aller-retour fidèle, fichier créé en 0600 (jamais lisible par d\'autres utilisateurs)', () => {
  const home = tmpHome();
  saveConfig({ baseUrl: 'http://localhost:4000', token: 'abc.def.ghi', email: 'admin@homelab.local' }, home);
  const loaded = loadConfig(home);
  assert.deepEqual(loaded, { baseUrl: 'http://localhost:4000', token: 'abc.def.ghi', email: 'admin@homelab.local' });
  const mode = fs.statSync(configPath(home)).mode & 0o777;
  assert.equal(mode, 0o600);
});

test('clearConfig : supprime le fichier, renvoie false s\'il n\'existait pas déjà', () => {
  const home = tmpHome();
  assert.equal(clearConfig(home), false);
  saveConfig({ baseUrl: 'x', token: 'y' }, home);
  assert.equal(clearConfig(home), true);
  assert.equal(loadConfig(home), null);
});
