import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCiWorkflow } from '../src/services/ciWorkflowService.js';

// Générateur partagé entre POST /repos/:key/workflows/generate-ci et le
// Scaffolder (voir scaffolderTemplates.js, ÉTAPE 3/5 IDP) : un seul jeu de
// tests couvre les deux usages plutôt que de dupliquer la vérification.

test('buildCiWorkflow : job build adapté à la stack Node.js détectée (installCmd selon le gestionnaire de paquets)', () => {
  const yaml = buildCiWorkflow({ stack: ['Node.js / JavaScript'], packageManager: 'pnpm', hasDockerfile: false });
  assert.match(yaml, /pnpm install --frozen-lockfile/);
  assert.match(yaml, /npm run lint --if-present/);
});

test('buildCiWorkflow : job build adapté à la stack Python détectée', () => {
  const yaml = buildCiWorkflow({ stack: ['Python'], packageManager: null, hasDockerfile: false });
  assert.match(yaml, /pip install -r requirements\.txt/);
  assert.match(yaml, /pytest/);
});

test('buildCiWorkflow : stack inconnue produit un job générique explicite, pas une supposition Node par défaut', () => {
  const yaml = buildCiWorkflow({ stack: [], packageManager: null, hasDockerfile: false });
  assert.match(yaml, /Aucune stack détectée automatiquement/);
});

test('buildCiWorkflow : SAST/SCA/secret scanning toujours présents, quelle que soit la stack', () => {
  const yaml = buildCiWorkflow({ stack: [], packageManager: null, hasDockerfile: false });
  assert.match(yaml, /semgrep\/semgrep-action@v1/);
  assert.match(yaml, /aquasecurity\/trivy-action@master/);
  assert.match(yaml, /scan-type: fs/);
  assert.match(yaml, /GitGuardian\/ggshield-action@v1/);
});

test('buildCiWorkflow : sans Dockerfile détecté, aucun job de build/scan/SBOM d\'image (rien à construire)', () => {
  const yaml = buildCiWorkflow({ stack: ['Node.js / JavaScript'], packageManager: 'npm', hasDockerfile: false });
  assert.doesNotMatch(yaml, /docker-build-scan-sbom/);
  assert.doesNotMatch(yaml, /ghcr\.io/);
});

test('buildCiWorkflow : avec Dockerfile détecté, build+push GHCR (GITHUB_TOKEN, aucun secret externe) + scan Trivy image + SBOM Syft', () => {
  const yaml = buildCiWorkflow({ stack: ['Node.js / JavaScript'], packageManager: 'npm', hasDockerfile: true });
  assert.match(yaml, /docker-build-scan-sbom:/);
  assert.match(yaml, /needs: build/);
  assert.match(yaml, /registry: ghcr\.io/);
  assert.match(yaml, /password: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.match(yaml, /push: true/);
  assert.match(yaml, /scan-type: image/);
  assert.match(yaml, /anchore\/sbom-action@v0/);
});
