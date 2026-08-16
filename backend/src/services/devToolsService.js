import { execFile } from 'node:child_process';

// Détecte la présence d'outils de développement courants sur la machine qui
// héberge le backend (celle qui exécute réellement les actions de la
// console), via `which` — jamais de commande arbitraire, une liste fixe de
// binaires connus. Utile pour repérer rapidement ce qu'il manque avant de
// développer/déployer depuis ce poste.
const TOOLS = [
  { id: 'git', label: 'Git', bin: 'git', versionArgs: ['--version'] },
  { id: 'docker', label: 'Docker', bin: 'docker', versionArgs: ['--version'] },
  { id: 'kubectl', label: 'kubectl', bin: 'kubectl', versionArgs: ['version', '--client', '--short'] },
  { id: 'node', label: 'Node.js', bin: 'node', versionArgs: ['--version'] },
  { id: 'npm', label: 'npm', bin: 'npm', versionArgs: ['--version'] },
  { id: 'ssh', label: 'SSH', bin: 'ssh', versionArgs: ['-V'] },
  { id: 'nmap', label: 'nmap', bin: 'nmap', versionArgs: ['--version'] },
  { id: 'curl', label: 'curl', bin: 'curl', versionArgs: ['--version'] },
  { id: 'helm', label: 'Helm', bin: 'helm', versionArgs: ['version', '--short'] },
  { id: 'terraform', label: 'Terraform', bin: 'terraform', versionArgs: ['--version'] },
  { id: 'trivy', label: 'Trivy', bin: 'trivy', versionArgs: ['--version'] },
  { id: 'semgrep', label: 'Semgrep', bin: 'semgrep', versionArgs: ['--version'] },
  { id: 'checkov', label: 'Checkov', bin: 'checkov', versionArgs: ['--version'] },
  { id: 'syft', label: 'Syft', bin: 'syft', versionArgs: ['version'] },
  { id: 'cosign', label: 'cosign', bin: 'cosign', versionArgs: ['version'] }
];

function which(bin) {
  return new Promise((resolve) => {
    execFile('which', [bin], { timeout: 3000 }, (err, stdout) => {
      resolve(err ? null : stdout.trim());
    });
  });
}

function version(bin, args) {
  return new Promise((resolve) => {
    // Certains outils (ssh -V) écrivent leur version sur stderr plutôt que
    // stdout, et certains renvoient un code de sortie non-nul pour --version :
    // on prend ce qu'on a plutôt que d'afficher "inconnue" à tort.
    execFile(bin, args, { timeout: 3000 }, (err, stdout, stderr) => {
      const out = (stdout || stderr || '').trim().split('\n')[0];
      resolve(out || null);
    });
  });
}

export async function checkTools() {
  const results = await Promise.all(TOOLS.map(async (t) => {
    const path = await which(t.bin);
    if (!path) return { id: t.id, label: t.label, installed: false, path: null, version: null };
    const ver = await version(t.bin, t.versionArgs);
    return { id: t.id, label: t.label, installed: true, path, version: ver };
  }));
  return results;
}
