import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateManifest } from '../src/pluginManifest.js';
import { cmdPluginCreate, cmdPluginValidate, cmdPluginBuild } from '../src/commands.js';

function tmpCwd() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-plugin-test-'));
  const original = process.cwd();
  process.chdir(dir);
  return { dir, restore: () => process.chdir(original) };
}

test('validateManifest : rejette un manifest sans id/name/version/apiVersion', () => {
  const { valid, errors } = validateManifest({});
  assert.equal(valid, false);
  assert.ok(errors.length >= 4);
});

test('validateManifest : rejette une permission mal formée', () => {
  const { valid, errors } = validateManifest({
    id: 'x', name: 'X', version: '1.0.0', apiVersion: '1.0', permissions: ['not-a-permission']
  });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('permission')));
});

test('validateManifest : accepte un manifest minimal correct', () => {
  const { valid } = validateManifest({ id: 'my-plugin', name: 'My Plugin', version: '1.0.0', apiVersion: '1.0' });
  assert.equal(valid, true);
});

test('plugin create : génère un manifest valide et la structure attendue', () => {
  const { dir, restore } = tmpCwd();
  try {
    const result = cmdPluginCreate(['sample-plugin']);
    assert.match(result, /Plugin créé dans/);
    const pluginDir = path.join(dir, 'sample-plugin');
    assert.ok(fs.existsSync(path.join(pluginDir, 'manifest.json')));
    assert.ok(fs.existsSync(path.join(pluginDir, 'backend', 'index.js')));
    assert.ok(fs.existsSync(path.join(pluginDir, 'frontend', 'index.js')));

    const validated = cmdPluginValidate([pluginDir]);
    assert.match(validated, /Manifest valide : sample-plugin@0\.1\.0/);

    const built = cmdPluginBuild([pluginDir]);
    assert.match(built, /prêt/);
  } finally {
    restore();
  }
});

test('plugin create : refuse un nom déjà existant', () => {
  const { restore } = tmpCwd();
  try {
    cmdPluginCreate(['dup-plugin']);
    assert.throws(() => cmdPluginCreate(['dup-plugin']), /existe déjà/);
  } finally {
    restore();
  }
});

test('plugin validate : erreur explicite si manifest.json absent', () => {
  const { dir, restore } = tmpCwd();
  try {
    assert.throws(() => cmdPluginValidate([dir]), /Aucun manifest\.json/);
  } finally {
    restore();
  }
});

test('plugin build : échoue si un point d\'entrée déclaré est manquant', () => {
  const { dir, restore } = tmpCwd();
  try {
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
      id: 'x', name: 'X', version: '1.0.0', apiVersion: '1.0', backend: 'backend/index.js'
    }));
    assert.throws(() => cmdPluginBuild([dir]), /manquant/);
  } finally {
    restore();
  }
});
