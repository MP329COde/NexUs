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

function dockerRun({ name, image, ports = [], envVars = [], volumes = [], extraArgs = '', command = '' }) {
  const portArgs = ports.map((p) => `-p ${p}`).join(' ');
  const envArgs = envVars.map((e) => `-e '${e}'`).join(' ');
  const volumeArgs = volumes.map((v) => `-v ${v}`).join(' ');
  return `
set -e
${ensureDocker()}
if docker inspect ${name} &>/dev/null; then echo "${name} déjà installé"; exit 0; fi
docker run -d --name ${name} --restart unless-stopped ${portArgs} ${envArgs} ${volumeArgs} ${extraArgs} ${image} ${command}
echo "${name} installé et démarré"
`.trim();
}

const SERVICE_CATALOG = {
  prometheus: {
    label: 'Prometheus',
    port: 9090,
    buildScript: () => dockerRun({ name: 'prometheus', image: 'prom/prometheus:latest', ports: ['9090:9090'] })
  },
  grafana: {
    label: 'Grafana',
    port: 3000,
    buildScript: () => dockerRun({ name: 'grafana', image: 'grafana/grafana:latest', ports: ['3000:3000'], volumes: ['grafana-data:/var/lib/grafana'] })
  },
  loki: {
    label: 'Loki',
    port: 3100,
    buildScript: () => dockerRun({ name: 'loki', image: 'grafana/loki:latest', ports: ['3100:3100'] })
  },
  alertmanager: {
    label: 'Alertmanager',
    port: 9093,
    buildScript: () => dockerRun({ name: 'alertmanager', image: 'prom/alertmanager:latest', ports: ['9093:9093'] })
  },
  'uptime-kuma': {
    label: 'Uptime Kuma',
    port: 3001,
    buildScript: () => dockerRun({ name: 'uptime-kuma', image: 'louislam/uptime-kuma:1', ports: ['3001:3001'], volumes: ['uptime-kuma:/app/data'] })
  },
  netdata: {
    label: 'Netdata',
    port: 19999,
    buildScript: () => dockerRun({ name: 'netdata', image: 'netdata/netdata:latest', ports: ['19999:19999'] })
  },
  influxdb: {
    label: 'InfluxDB',
    port: 8086,
    buildScript: () => dockerRun({ name: 'influxdb', image: 'influxdb:2', ports: ['8086:8086'], volumes: ['influxdb-data:/var/lib/influxdb2'] })
  },
  vault: {
    label: 'HashiCorp Vault',
    port: 8200,
    buildScript: () => dockerRun({
      name: 'vault', image: 'hashicorp/vault:latest', ports: ['8200:8200'],
      envVars: ["VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200"], extraArgs: '--cap-add=IPC_LOCK'
    })
  },
  crowdsec: {
    label: 'CrowdSec',
    port: 8080,
    buildScript: () => dockerRun({ name: 'crowdsec', image: 'crowdsecurity/crowdsec:latest', ports: ['8080:8080'], volumes: ['crowdsec-data:/var/lib/crowdsec/data'] })
  },
  gitea: {
    label: 'Gitea',
    port: 3000,
    buildScript: () => dockerRun({ name: 'gitea', image: 'gitea/gitea:latest', ports: ['3000:3000', '2222:22'], volumes: ['gitea-data:/data'] })
  },
  sonarqube: {
    label: 'SonarQube',
    port: 9000,
    buildScript: () => dockerRun({ name: 'sonarqube', image: 'sonarqube:community', ports: ['9000:9000'], volumes: ['sonarqube-data:/opt/sonarqube/data'] })
  },
  jenkins: {
    label: 'Jenkins',
    port: 8080,
    buildScript: () => dockerRun({ name: 'jenkins', image: 'jenkins/jenkins:lts', ports: ['8080:8080', '50000:50000'], volumes: ['jenkins-data:/var/jenkins_home'] })
  },
  keycloak: {
    label: 'Keycloak',
    port: 8080,
    buildScript: () => dockerRun({
      name: 'keycloak', image: 'quay.io/keycloak/keycloak:latest', ports: ['8080:8080'],
      envVars: ['KEYCLOAK_ADMIN=admin', 'KEYCLOAK_ADMIN_PASSWORD=changeme'], command: 'start-dev'
    })
  },
  gitlab: {
    label: 'GitLab',
    port: 8929,
    buildScript: () => dockerRun({ name: 'gitlab', image: 'gitlab/gitlab-ce:latest', ports: ['8929:80', '2224:22'], volumes: ['gitlab-config:/etc/gitlab', 'gitlab-data:/var/opt/gitlab', 'gitlab-logs:/var/log/gitlab'] })
  },
  woodpecker: {
    label: 'Woodpecker CI',
    port: 8000,
    buildScript: (ctx) => dockerRun({
      name: 'woodpecker-server', image: 'woodpeckerci/woodpecker-server:latest', ports: ['8000:8000'],
      envVars: [`WOODPECKER_HOST=http://${ctx?.address || 'localhost'}:8000`, 'WOODPECKER_OPEN=true']
    })
  },
  'step-ca': {
    label: 'step-ca',
    port: 9000,
    buildScript: (ctx) => dockerRun({
      name: 'step-ca', image: 'smallstep/step-ca:latest', ports: ['9000:9000'], volumes: ['step-ca-data:/home/step'],
      envVars: ['DOCKER_STEPCA_INIT_NAME=Nexus Homelab CA', `DOCKER_STEPCA_INIT_DNS_NAMES=${ctx?.address || 'localhost'}`]
    })
  },
  trivy: {
    label: 'Trivy',
    port: 4954,
    buildScript: () => dockerRun({ name: 'trivy', image: 'aquasec/trivy:latest', ports: ['4954:4954'], command: 'server --listen 0.0.0.0:4954' })
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

export function buildServiceScript(toolId, ctx = {}) {
  const entry = SERVICE_CATALOG[toolId];
  if (!entry) throw Object.assign(new Error(`Installation automatique indisponible pour "${toolId}"`), { status: 409 });
  return entry.buildScript(ctx);
}
