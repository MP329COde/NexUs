// Générateur de workflow GitHub Actions réel (SAST/SCA/secret scanning +
// build/scan/SBOM d'image), partagé par deux points d'entrée :
//   - routes/repos.routes.js (POST /:key/workflows/generate-ci, sur un dépôt
//     GitHub existant, structure détectée en lisant l'arborescence réelle) ;
//   - services/scaffolderTemplates.js (golden paths du Scaffolder, ÉTAPE 3
//     IDP — un service scaffoldé obtient la même chaîne CI complète dès sa
//     création, pas une version au rabais).
// Toutes les actions utilisées sont de vraies actions GitHub tierces
// publiées (jamais un appel fictif à un service Nexus). Le job
// docker-build-scan-sbom pousse réellement vers ghcr.io en utilisant
// GITHUB_TOKEN (fourni automatiquement par GitHub Actions, permission
// packages:write déclarée ci-dessous) : aucun secret externe à configurer
// pour qu'un dépôt scaffoldé produise une vraie image scannée dès son
// premier commit sur main.
export function buildCiWorkflow({ stack, packageManager, hasDockerfile }) {
  const isNode = stack.includes('Node.js / JavaScript');
  const isPython = stack.includes('Python');
  const installCmd = packageManager === 'pnpm' ? 'pnpm install --frozen-lockfile' : packageManager === 'yarn' ? 'yarn install --frozen-lockfile' : 'npm ci';

  let buildJob;
  if (isNode) {
    buildJob = `
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: ${installCmd}
      - run: npm run lint --if-present
      - run: npm test --if-present
      - run: npm run build --if-present`;
  } else if (isPython) {
    buildJob = `
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r requirements.txt
      - run: pytest`;
  } else {
    buildJob = `
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Aucune stack détectée automatiquement — adaptez ce job (lint/test/build) à votre langage."`;
  }

  const dockerJob = hasDockerfile ? `

  docker-build-scan-sbom:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        id: build
        with:
          context: .
          push: true
          tags: ghcr.io/\${{ github.repository }}:\${{ github.sha }}
      - uses: aquasecurity/trivy-action@master
        with:
          scan-type: image
          image-ref: ghcr.io/\${{ github.repository }}:\${{ github.sha }}
          severity: CRITICAL,HIGH
      - uses: anchore/sbom-action@v0
        with:
          image: ghcr.io/\${{ github.repository }}:\${{ github.sha }}
          artifact-name: sbom.spdx.json` : '';

  return `# Généré par Nexus Console depuis la structure détectée du dépôt.
# Adaptez les jobs ci-dessous à vos besoins ; les jobs de sécurité utilisent
# de vraies actions GitHub tierces (pas un service Nexus) — GITGUARDIAN_API_KEY
# doit être ajouté aux secrets du dépôt pour activer le scan de secrets.${hasDockerfile ? `
# docker-build-scan-sbom pousse vers ghcr.io avec GITHUB_TOKEN (aucun secret
# supplémentaire requis).` : ''}
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:${buildJob}

  sast-semgrep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: semgrep/semgrep-action@v1
        with:
          config: auto

  sca-trivy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aquasecurity/trivy-action@master
        with:
          scan-type: fs
          severity: CRITICAL,HIGH

  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: GitGuardian/ggshield-action@v1
        env:
          GITGUARDIAN_API_KEY: \${{ secrets.GITGUARDIAN_API_KEY }}${dockerJob}
`;
}
