import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-tfstate-'));
process.env.NEXUS_DATA_DIR = dataRoot;

// Faux binaire `terraform` : 'init' est un no-op ; 'apply' écrit un state
// contenant un identifiant sensible (simule ce que le vrai binaire produirait
// à partir de terraform.tfvars) et sa sauvegarde .backup ; 'destroy' vérifie
// que le state est bien déchiffré en clair avant de s'exécuter, puis le vide.
const fakeBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-tfbin-'));
const fakeTerraformPath = path.join(fakeBinDir, 'terraform');
fs.writeFileSync(fakeTerraformPath, `#!/usr/bin/env node
const fs = require('fs');
const cmd = process.argv[2];
if (cmd === 'init') process.exit(0);
if (cmd === 'apply') {
  fs.writeFileSync('terraform.tfstate', JSON.stringify({ resources: [{ secret: 'proxmox-token-secret-value' }] }));
  fs.writeFileSync('terraform.tfstate.backup', JSON.stringify({ resources: [] }));
  process.exit(0);
}
if (cmd === 'destroy') {
  if (!fs.existsSync('terraform.tfstate')) { console.error('state manquant au moment de destroy'); process.exit(1); }
  const content = fs.readFileSync('terraform.tfstate', 'utf8');
  if (!content.includes('proxmox-token-secret-value')) { console.error('state illisible (toujours chiffré ?)'); process.exit(1); }
  fs.writeFileSync('terraform.tfstate', JSON.stringify({ resources: [] }));
  process.exit(0);
}
process.exit(0);
`, { mode: 0o755 });
process.env.PATH = `${fakeBinDir}:${process.env.PATH}`;

const terraformService = await import('../src/services/terraformService.js');
const { encryptSecret } = await import('../src/utils/crypto.js');

const WORKSPACE_ID = 'test-workspace';

function workspaceDir() {
  return path.join(dataRoot, 'terraform', WORKSPACE_ID);
}

function fakeParams() {
  return { node: 'pve1', vmId: 900, vmName: 'test-vm', templateVmId: 9000, cores: 2, memoryMb: 2048, diskGb: 20 };
}

test('apply : le state produit par terraform est chiffré sur disque, jamais laissé en clair', async () => {
  // getRawIntegration('proxmox') doit renvoyer une config complète pour que
  // buildTfvars ne rejette pas — on écrit directement le store settings
  // chiffré comme le ferait routes/settings.routes.js.
  const { writeStore } = await import('../src/store/jsonStore.js');
  const { encryptSecret: enc } = await import('../src/utils/crypto.js');
  writeStore('integrations', {
    proxmox: { baseUrl: 'https://pve.example.com:8006', tokenId: 'root@pam!nexus', tokenSecret: enc('proxmox-token-secret-value') }
  });

  terraformService.generateWorkspaceFiles(WORKSPACE_ID, fakeParams());
  await terraformService.apply(WORKSPACE_ID);

  const dir = workspaceDir();
  assert.equal(fs.existsSync(path.join(dir, 'terraform.tfstate')), false, 'le state en clair ne doit pas persister après apply');
  assert.equal(fs.existsSync(path.join(dir, 'terraform.tfstate.backup')), false, 'la sauvegarde en clair ne doit pas persister après apply');
  assert.equal(fs.existsSync(path.join(dir, 'terraform.tfstate.enc')), true, 'une version chiffrée doit exister');

  const encrypted = fs.readFileSync(path.join(dir, 'terraform.tfstate.enc'), 'utf8');
  assert.ok(!encrypted.includes('proxmox-token-secret-value'), 'le secret ne doit jamais apparaître en clair dans le fichier chiffré');
});

test('destroy : le state chiffré est déchiffré pour que terraform puisse le lire, puis rechiffré après coup', async () => {
  await terraformService.destroy(WORKSPACE_ID);
  const dir = workspaceDir();
  assert.equal(fs.existsSync(path.join(dir, 'terraform.tfstate')), false, 'pas de state en clair après destroy');
  assert.equal(fs.existsSync(path.join(dir, 'terraform.tfstate.enc')), true, 'le state (vidé) reste chiffré au repos');
});

test('encryptSecret produit bien un format différent du texte en clair (contrôle de base)', () => {
  const encrypted = encryptSecret('valeur-sensible');
  assert.ok(encrypted && !encrypted.includes('valeur-sensible'));
});
