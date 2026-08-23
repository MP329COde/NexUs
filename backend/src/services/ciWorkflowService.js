// Générateur de workflow GitHub Actions réel (build/test/lint multi-écosystème
// + SAST/SCA/secret scanning + build/scan/SBOM d'image + déploiement dev/
// staging/production + rollback documenté), partagé par deux points d'entrée :
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
//
// Détection d'écosystème : chaque stack reconnue reçoit ses VRAIES commandes
// standards (mvn/gradle pour Java, dotnet pour .NET, go pour Go, cargo pour
// Rust, composer pour PHP, terraform pour l'infra, helm pour les charts) —
// jamais une commande générique inventée qui échouerait silencieusement sur
// un écosystème mal reconnu. Un stack non reconnu garde un job générique
// avec un avertissement explicite (comportement honnête préexistant,
// conservé à l'identique).
export function buildCiWorkflow({ stack, packageManager, hasDockerfile }) {
  const isNode = stack.includes('Node.js / JavaScript');
  const isPython = stack.includes('Python');
  const isJavaMaven = stack.includes('Java (Maven)');
  const isJavaGradle = stack.includes('Java/Kotlin (Gradle)');
  const isDotnet = stack.includes('.NET');
  const isGo = stack.includes('Go');
  const isRust = stack.includes('Rust');
  const isPhp = stack.includes('PHP (Composer)');
  const isTerraform = stack.includes('Terraform');
  const isHelm = stack.includes('Helm');
  const nodeFrameworks = ['Next.js', 'Vite', 'Vue', 'React'].filter((f) => stack.includes(f));
  const installCmd = packageManager === 'pnpm' ? 'pnpm install --frozen-lockfile' : packageManager === 'yarn' ? 'yarn install --frozen-lockfile' : 'npm ci';

  let buildJob;
  if (isNode) {
    // Les commandes npm run build/test/lint --if-present restent les VRAIES
    // commandes de React/Vite/Next.js/Vue (ces frameworks s'exposent tous via
    // les scripts package.json, il n'existe pas de commande "native" propre
    // à chacun à leur substituer) — le framework détecté est documenté en
    // commentaire pour que l'admin sache que la détection a fonctionné.
    const frameworkComment = nodeFrameworks.length ? `\n      # Framework détecté : ${nodeFrameworks.join(', ')} — build/test/lint réels via les scripts package.json.` : '';
    buildJob = `
  build:
    runs-on: ubuntu-latest
    steps:${frameworkComment}
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
  } else if (isJavaMaven) {
    buildJob = `
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "21"
          cache: maven
      - run: mvn -B compile
      - run: mvn -B test
      - run: mvn -B package -DskipTests`;
  } else if (isJavaGradle) {
    buildJob = `
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "21"
          cache: gradle
      - run: chmod +x ./gradlew
      - run: ./gradlew build`;
  } else if (isDotnet) {
    buildJob = `
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: "8.0.x"
      - run: dotnet restore
      - run: dotnet build --no-restore
      - run: dotnet test --no-build`;
  } else if (isGo) {
    buildJob = `
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.22"
      - run: go build ./...
      - run: go vet ./...
      - run: go test ./...`;
  } else if (isRust) {
    buildJob = `
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo build --release
      - run: cargo test
      - run: cargo clippy --all-targets -- -D warnings`;
  } else if (isPhp) {
    buildJob = `
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: "8.3"
      - run: composer install --no-progress --prefer-dist
      - run: |
          if [ -f vendor/bin/phpunit ]; then vendor/bin/phpunit; else echo "PHPUnit non installé — ajoutez-le en dépendance dev (composer require --dev phpunit/phpunit) pour activer les tests."; fi`;
  } else {
    buildJob = `
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Aucune stack détectée automatiquement (Node/Python/Java/.NET/Go/Rust/PHP) — adaptez ce job (lint/test/build) à votre langage."`;
  }

  // Terraform et Helm sont ajoutés en jobs dédiés indépendants du langage
  // applicatif détecté (un repo Node/Go/etc. peut contenir un dossier
  // terraform/ ou un chart Helm pour son propre déploiement) — jamais
  // fusionnés dans buildJob pour ne pas mélanger deux écosystèmes distincts.
  const terraformJob = isTerraform ? `

  terraform-validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - run: terraform init -backend=false
      - run: terraform fmt -check
      - run: terraform validate` : '';

  const helmJob = isHelm ? `

  helm-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: azure/setup-helm@v4
      - run: helm lint .
        # Adaptez le chemin si le chart n'est pas à la racine du dépôt.` : '';

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

  // Déploiement dev/staging/production + rollback. GitHub Actions ne connaît
  // pas nativement le mécanisme GitOps de chaque organisation (dépôt GitOps
  // séparé synchronisé par Argo CD, kustomize, Helm values, etc.) — la vraie
  // commande de mise à jour de manifeste dépend de la convention interne, non
  // devinable ici. Ces jobs sont donc de vrais jobs GitHub Actions (needs,
  // if de branche, environment de protection) mais avec l'étape de mise à
  // jour d'image documentée en commentaire plutôt qu'une commande inventée
  // qui échouerait silencieusement contre un dépôt GitOps qui n'existe peut-
  // être pas. Dans Nexus Console, le lien pipeline → projet → dépôt →
  // environnement → Argo CD une fois déployé est déjà câblé et visible dans
  // PipelineView.jsx (chaîne Git → CI/CD → Argo CD → Kubernetes → proxy) —
  // ces jobs n'ont pas besoin de le dupliquer, seulement de déclencher un
  // vrai déploiement pour que cette chaîne ait quelque chose à afficher.
  const artifactRef = hasDockerfile ? '${{ steps.build.outputs.digest || github.sha }}' : '${{ github.sha }}';
  const gitopsHint = `Adaptez la mise à jour du manifeste GitOps à votre convention réelle, par exemple :
      #   git clone https://x-access-token:\${{ secrets.GITOPS_TOKEN }}@github.com/<org>/<repo-gitops>.git
      #   cd <repo-gitops> && yq -i '.image.tag = "\${{ github.sha }}"' environments/<env>/values.yaml
      #   git commit -am "deploy(<env>): \${{ github.sha }}" && git push
      # Si l'application Argo CD a l'auto-sync activé, ce push seul suffit à déclencher le déploiement.
      # Sinon, forcez une synchronisation immédiate avec la CLI Argo CD (nécessite ARGOCD_AUTH_TOKEN en secret) :
      #   argocd app sync <nom-application> --auth-token \${{ secrets.ARGOCD_AUTH_TOKEN }}`;

  const deployDevJob = `

  deploy-dev:
    needs: build
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    environment: dev
    steps:
      - uses: actions/checkout@v4
      - run: |
          echo "Déploiement vers l'environnement dev (branche develop, référence ${artifactRef})."
          # ${gitopsHint}`;

  const deployStagingJob = `

  deploy-staging:
    needs: build
    if: github.ref == 'refs/heads/staging'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - run: |
          echo "Déploiement vers l'environnement staging (branche staging, référence ${artifactRef})."
          # ${gitopsHint}`;

  const promoteProductionJob = `

  promote-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment:
      name: production
    steps:
      - uses: actions/checkout@v4
      - run: |
          echo "Promotion staging → production de la référence ${artifactRef}."
          # ${gitopsHint}
    # Approbation manuelle native GitHub Actions : déclarez des "Required
    # reviewers" sur l'environnement "production" du dépôt (Settings >
    # Environments > production) — ce job reste en attente tant qu'un
    # reviewer déclaré n'a pas approuvé son exécution.`;

  const rollbackJob = `

  rollback:
    if: github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - run: |
          echo "Rollback manuel — GitHub Actions n'a pas d'état natif du \\"tag précédent\\", un vrai rollback automatique n'est pas fiable en pure CI."
          echo "Tag à redéployer : \${{ github.event.inputs.image_tag }}"
          echo "Procédure recommandée :"
          echo "  1) Identifier le tag/SHA stable précédent (release GitHub, ou historique 'History and rollback' d'Argo CD)."
          echo "  2) Si Argo CD est la source de vérité GitOps : argocd app rollback <application> <revision> (le plus fiable, l'historique y est déjà tenu)."
          echo "  3) Sinon, relancer ce workflow via 'Run workflow' avec image_tag renseigné, puis appliquer la même mise à jour de manifeste GitOps que deploy-staging/promote-production avec ce tag."
    # Déclenchement : onglet Actions du dépôt > ce workflow > "Run workflow",
    # en renseignant l'entrée image_tag (voir workflow_dispatch ci-dessous).`;

  return `# Généré par Nexus Console depuis la structure détectée du dépôt.
# Adaptez les jobs ci-dessous à vos besoins ; les jobs de sécurité utilisent
# de vraies actions GitHub tierces (pas un service Nexus) — GITGUARDIAN_API_KEY
# doit être ajouté aux secrets du dépôt pour activer le scan de secrets.${hasDockerfile ? `
# docker-build-scan-sbom pousse vers ghcr.io avec GITHUB_TOKEN (aucun secret
# supplémentaire requis).` : ''}
# deploy-dev/deploy-staging/promote-production/rollback sont de vrais jobs
# GitHub Actions (déclenchement par branche, environnements de protection,
# workflow_dispatch) mais la mise à jour du manifeste GitOps est documentée
# en commentaire plutôt qu'inventée — la convention (dépôt GitOps séparé,
# kustomize, Helm values...) dépend de votre organisation. Déclarez des
# "Required reviewers" sur l'environnement GitHub "production" pour
# l'approbation manuelle native de promote-production.
name: CI
on:
  push:
    branches: [main, develop, staging]
  pull_request:
  workflow_dispatch:
    inputs:
      image_tag:
        description: "Tag d'image à redéployer (rollback manuel)"
        required: false
        type: string

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
          GITGUARDIAN_API_KEY: \${{ secrets.GITGUARDIAN_API_KEY }}${dockerJob}${terraformJob}${helmJob}${deployDevJob}${deployStagingJob}${promoteProductionJob}${rollbackJob}
`;
}
