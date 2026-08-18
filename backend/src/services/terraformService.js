import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '../config/paths.js';
import { getRawIntegration } from '../store/settingsStore.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';

// Infrastructure as Code réelle : génère un espace de travail Terraform
// (provider bpg/proxmox, open source) par ressource déclarée depuis Nexus,
// et exécute le binaire `terraform` réel sur la machine backend — jamais de
// plan/apply simulé. Fichiers écrits dans data/terraform/<id>/, jamais
// commités (voir config/paths.js), y compris terraform.tfvars qui contient
// le jeton API Proxmox déjà stocké chiffré côté Nexus.
const WORKSPACE_ROOT = path.join(dataDir, 'terraform');
const RUN_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 10 * 1024 * 1024;

function workspaceDir(id) {
  return path.join(WORKSPACE_ROOT, id);
}

const MAIN_TF = `terraform {
  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = "~> 0.66"
    }
  }
}

provider "proxmox" {
  endpoint  = var.proxmox_endpoint
  api_token = var.proxmox_api_token
  insecure  = true
}

# Généré par Nexus Console — cloné depuis un template Proxmox existant plutôt
# qu'installé depuis une ISO, pour rester rapide et reproductible.
resource "proxmox_virtual_environment_vm" "this" {
  name      = var.vm_name
  node_name = var.proxmox_node
  vm_id     = var.vm_id

  clone {
    vm_id = var.template_vm_id
  }

  cpu {
    cores = var.cores
  }

  memory {
    dedicated = var.memory_mb
  }

  disk {
    datastore_id = "local-lvm"
    interface    = "scsi0"
    size         = var.disk_gb
  }
}

output "vm_id" {
  value = proxmox_virtual_environment_vm.this.vm_id
}
`;

const VARIABLES_TF = `variable "proxmox_endpoint" { type = string }
variable "proxmox_api_token" {
  type      = string
  sensitive = true
}
variable "proxmox_node" { type = string }
variable "vm_id" { type = number }
variable "vm_name" { type = string }
variable "template_vm_id" { type = number }
variable "cores" {
  type    = number
  default = 2
}
variable "memory_mb" {
  type    = number
  default = 2048
}
variable "disk_gb" {
  type    = number
  default = 20
}
`;

function buildTfvars({ node, vmId, vmName, templateVmId, cores, memoryMb, diskGb }) {
  const cfg = getRawIntegration('proxmox');
  if (!cfg.baseUrl || !cfg.tokenId || !cfg.tokenSecret) {
    throw Object.assign(new Error('Proxmox non configuré (Paramètres → Intégrations) — impossible de générer les identifiants Terraform'), { status: 409 });
  }
  const lines = [
    `proxmox_endpoint  = ${JSON.stringify(cfg.baseUrl)}`,
    `proxmox_api_token = ${JSON.stringify(`${cfg.tokenId}=${cfg.tokenSecret}`)}`,
    `proxmox_node      = ${JSON.stringify(node)}`,
    `vm_id             = ${Number(vmId)}`,
    `vm_name           = ${JSON.stringify(vmName)}`,
    `template_vm_id    = ${Number(templateVmId)}`,
    `cores             = ${Number(cores) || 2}`,
    `memory_mb         = ${Number(memoryMb) || 2048}`,
    `disk_gb           = ${Number(diskGb) || 20}`
  ];
  return `${lines.join('\n')}\n`;
}

export function generateWorkspaceFiles(id, params) {
  const dir = workspaceDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'main.tf'), MAIN_TF);
  fs.writeFileSync(path.join(dir, 'variables.tf'), VARIABLES_TF);
  fs.writeFileSync(path.join(dir, 'terraform.tfvars'), buildTfvars(params), { mode: 0o600 });
  return dir;
}

export function readMainTf(id) {
  return fs.readFileSync(path.join(workspaceDir(id), 'main.tf'), 'utf8');
}

export function removeWorkspaceFiles(id) {
  fs.rmSync(workspaceDir(id), { recursive: true, force: true });
}

// Le state Terraform embarque en clair, par conception du format, les mêmes
// identifiants sensibles que terraform.tfvars (voir buildTfvars) — il n'était
// jusqu'ici protégé que par les permissions Unix (0600), jamais par
// encryptSecret/decryptSecret comme le reste des secrets applicatifs (voir
// utils/crypto.js). Le binaire `terraform` ne sait lire/écrire que du JSON en
// clair : on le déchiffre juste avant chaque commande qui peut le lire
// (plan/apply/destroy) et on le rechiffre juste après, pour ne jamais le
// laisser en clair au repos entre deux exécutions.
const STATE_FILE = 'terraform.tfstate';
const ENCRYPTED_STATE_FILE = 'terraform.tfstate.enc';

function statePath(id) {
  return path.join(workspaceDir(id), STATE_FILE);
}

function encryptedStatePath(id) {
  return path.join(workspaceDir(id), ENCRYPTED_STATE_FILE);
}

function decryptStateForRun(id) {
  const encPath = encryptedStatePath(id);
  if (!fs.existsSync(encPath)) return;
  const plain = decryptSecret(fs.readFileSync(encPath, 'utf8'));
  if (plain != null) fs.writeFileSync(statePath(id), plain, { mode: 0o600 });
}

function encryptStateAfterRun(id) {
  const plainPath = statePath(id);
  if (fs.existsSync(plainPath)) {
    const plain = fs.readFileSync(plainPath, 'utf8');
    fs.writeFileSync(encryptedStatePath(id), encryptSecret(plain), { mode: 0o600 });
    fs.rmSync(plainPath, { force: true });
  }
  // Sauvegarde générée par terraform avant chaque écriture d'état (contient
  // le même contenu sensible) : jamais utilisée en lecture par Nexus, pas
  // besoin de la rechiffrer — supprimée pour ne pas la laisser en clair.
  const backupPath = `${plainPath}.backup`;
  fs.rmSync(backupPath, { force: true });
}

function execTerraform(id, args) {
  return new Promise((resolve, reject) => {
    execFile('terraform', args, { cwd: workspaceDir(id), timeout: RUN_TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (err, stdout, stderr) => {
      if (err?.code === 'ENOENT') {
        reject(Object.assign(new Error('Terraform non installé sur la machine backend'), { status: 503 }));
        return;
      }
      resolve({ err, stdout, stderr });
    });
  });
}

async function init(id) {
  const { err, stderr } = await execTerraform(id, ['init', '-input=false']);
  if (err) throw Object.assign(new Error(`Échec de "terraform init" : ${(stderr || err.message || '').trim().split('\n').filter(Boolean).slice(-1)[0] || err.message}`), { status: 502 });
}

// `terraform plan` sort avec le code 2 (pas une erreur) quand des
// changements sont détectés, 0 quand rien ne change, tout le reste est un
// véritable échec (config invalide, identifiants Proxmox refusés...).
export async function plan(id) {
  decryptStateForRun(id);
  try {
    await init(id);
    const { err, stdout, stderr } = await execTerraform(id, ['plan', '-input=false', '-no-color']);
    if (err && err.code !== 2) {
      throw Object.assign(new Error(`Échec du plan Terraform : ${(stderr || '').trim().split('\n').filter(Boolean).slice(-1)[0] || err.message}`), { status: 502 });
    }
    return { output: stdout, hasChanges: err?.code === 2 };
  } finally {
    encryptStateAfterRun(id);
  }
}

export async function apply(id) {
  decryptStateForRun(id);
  try {
    await init(id);
    const { err, stdout, stderr } = await execTerraform(id, ['apply', '-input=false', '-auto-approve', '-no-color']);
    if (err) throw Object.assign(new Error(`Échec de l'application Terraform : ${(stderr || '').trim().split('\n').filter(Boolean).slice(-1)[0] || err.message}`), { status: 502 });
    return { output: stdout };
  } finally {
    encryptStateAfterRun(id);
  }
}

export async function destroy(id) {
  decryptStateForRun(id);
  try {
    const { err, stdout, stderr } = await execTerraform(id, ['destroy', '-input=false', '-auto-approve', '-no-color']);
    if (err) throw Object.assign(new Error(`Échec de la destruction Terraform : ${(stderr || '').trim().split('\n').filter(Boolean).slice(-1)[0] || err.message}`), { status: 502 });
    return { output: stdout };
  } finally {
    encryptStateAfterRun(id);
  }
}
