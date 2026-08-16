import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Signature cryptographique réelle via le binaire cosign (Sigstore, open
// source) — aucune capacité de pousser vers un registre distant ici, donc on
// signe/vérifie des blobs locaux (le JSON du SBOM Syft) plutôt que de tenter
// une signature OCI qui nécessiterait des identifiants de registre. C'est le
// même mécanisme cryptographique (cosign sign-blob / verify-blob), appliqué
// à une attestation locale plutôt qu'à une image poussée.
const RUN_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 5 * 1024 * 1024;

// Paire de clés dédiée à cette instance, générée à la demande et jamais
// committée (backend/data est déjà hors du contrôle de version).
const KEY_DIR = path.resolve(import.meta.dirname, '..', '..', 'data', 'cosign');
const PRIVATE_KEY_PATH = path.join(KEY_DIR, 'cosign.key');
const PUBLIC_KEY_PATH = path.join(KEY_DIR, 'cosign.pub');

// Mot de passe vide pour la clé privée : cette instance n'expose jamais la
// clé privée elle-même (elle ne quitte pas le disque du serveur), seule la
// signature produite est renvoyée au client — un mot de passe supplémentaire
// n'ajouterait pas de protection réelle tout en compliquant l'automatisation.
const COSIGN_ENV = { ...process.env, COSIGN_PASSWORD: '', COSIGN_YES: 'true' };

function run(args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile('cosign', args, { timeout: RUN_TIMEOUT_MS, maxBuffer: MAX_BUFFER, env: COSIGN_ENV, ...opts }, (err, stdout, stderr) => {
      if (err) {
        reject(Object.assign(new Error(`Échec cosign : ${(stderr || err.message || '').split('\n').filter(Boolean).slice(-1)[0] || err.message}`), { status: err.code === 'ENOENT' ? 503 : 502 }));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureKeyPair() {
  if (await fileExists(PRIVATE_KEY_PATH)) return;
  const { mkdir } = await import('node:fs/promises');
  await mkdir(KEY_DIR, { recursive: true });
  await run(['generate-key-pair', '--output-key-prefix', 'cosign'], { cwd: KEY_DIR });
}

export async function getPublicKey() {
  await ensureKeyPair();
  return readFile(PUBLIC_KEY_PATH, 'utf8');
}

// Cosign 3.x n'émet plus de simple signature détachée : --bundle produit un
// bundle Sigstore complet (signature + preuve d'inclusion dans le journal de
// transparence public Rekor), format attendu par verify-blob ci-dessous.
export async function signBlob(content) {
  await ensureKeyPair();
  const dir = await mkdtemp(path.join(tmpdir(), 'cosign-blob-'));
  const blobPath = path.join(dir, 'blob.json');
  const bundlePath = path.join(dir, 'blob.bundle.json');
  try {
    await writeFile(blobPath, content, 'utf8');
    await run(['sign-blob', '--key', PRIVATE_KEY_PATH, '--bundle', bundlePath, blobPath]);
    const bundle = await readFile(bundlePath, 'utf8');
    const publicKey = await getPublicKey();
    return { signature: bundle, publicKey, algorithm: 'ecdsa-sha2-256-nistp256 (bundle Sigstore + Rekor)' };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function verifyBlob(content, bundle) {
  const dir = await mkdtemp(path.join(tmpdir(), 'cosign-verify-'));
  const blobPath = path.join(dir, 'blob.json');
  const bundlePath = path.join(dir, 'blob.bundle.json');
  try {
    await writeFile(blobPath, content, 'utf8');
    await writeFile(bundlePath, bundle, 'utf8');
    await run(['verify-blob', '--bundle', bundlePath, '--key', PUBLIC_KEY_PATH, blobPath]);
    return true;
  } catch {
    return false;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
