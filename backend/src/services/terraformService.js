import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '../config/paths.js';
import { getRawIntegration } from '../store/settingsStore.js';

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
  await init(id);
  const { err, stdout, stderr } = await execTerraform(id, ['plan', '-input=false', '-no-color']);
  if (err && err.code !== 2) {
    throw Object.assign(new Error(`Échec du plan Terraform : ${(stderr || '').trim().split('\n').filter(Boolean).slice(-1)[0] || err.message}`), { status: 502 });
  }
  return { output: stdout, hasChanges: err?.code === 2 };
}

export async function apply(id) {
  await init(id);
  const { err, stdout, stderr } = await execTerraform(id, ['apply', '-input=false', '-auto-approve', '-no-color']);
  if (err) throw Object.assign(new Error(`Échec de l'application Terraform : ${(stderr || '').trim().split('\n').filter(Boolean).slice(-1)[0] || err.message}`), { status: 502 });
  return { output: stdout };
}

export async function destroy(id) {
  const { err, stdout, stderr } = await execTerraform(id, ['destroy', '-input=false', '-auto-approve', '-no-color']);
  if (err) throw Object.assign(new Error(`Échec de la destruction Terraform : ${(stderr || '').trim().split('\n').filter(Boolean).slice(-1)[0] || err.message}`), { status: 502 });
  return { output: stdout };
}
