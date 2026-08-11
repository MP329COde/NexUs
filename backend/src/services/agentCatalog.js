import { getRawIntegration } from '../store/settingsStore.js';

// Catalogue FERMÉ de scripts d'installation : la console n'exécute jamais de
// commande arbitraire fournie par l'interface, uniquement l'un de ces scripts
// prédéfinis et versionnés avec le code. Ajouter un agent = ajouter une entrée
// ici, jamais un champ de saisie libre côté frontend.
const AGENT_CATALOG = {
  'node-exporter': {
    label: 'Prometheus Node Exporter',
    description: "Expose les métriques système de l'hôte (CPU, RAM, disque, réseau) pour Grafana/Prometheus.",
    requiresIntegration: null,
    buildScript: () => `
set -e
if systemctl is-active --quiet node_exporter 2>/dev/null; then echo "node_exporter déjà actif"; exit 0; fi
id node_exporter &>/dev/null || useradd --no-create-home --shell /usr/sbin/nologin node_exporter
cd /tmp
curl -fsSL https://github.com/prometheus/node_exporter/releases/download/v1.8.2/node_exporter-1.8.2.linux-amd64.tar.gz -o node_exporter.tar.gz
tar xzf node_exporter.tar.gz
install -m 0755 node_exporter-*/node_exporter /usr/local/bin/node_exporter
cat >/etc/systemd/system/node_exporter.service <<'UNIT'
[Unit]
Description=Prometheus Node Exporter
After=network.target
[Service]
User=node_exporter
ExecStart=/usr/local/bin/node_exporter
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now node_exporter
echo "node_exporter installé et démarré"
`.trim()
  },
  'wazuh-agent': {
    label: 'Agent Wazuh',
    description: "Installe l'agent Wazuh et l'enregistre auprès du gestionnaire configuré dans Paramètres → Wazuh.",
    requiresIntegration: 'wazuh',
    buildScript: () => {
      const cfg = getRawIntegration('wazuh');
      if (!cfg.baseUrl) {
        throw Object.assign(new Error("Configurez d'abord Wazuh depuis Paramètres → Wazuh (URL du gestionnaire)"), { status: 409 });
      }
      const managerHost = new URL(cfg.baseUrl).hostname;
      return `
set -e
if command -v /var/ossec/bin/wazuh-control &>/dev/null; then echo "Agent Wazuh déjà présent"; exit 0; fi
cd /tmp
curl -fsSL -o wazuh-agent.deb https://packages.wazuh.com/4.x/apt/pool/main/w/wazuh-agent/wazuh-agent_4.9.0-1_amd64.deb
WAZUH_MANAGER='${managerHost}' dpkg -i wazuh-agent.deb
systemctl daemon-reload
systemctl enable --now wazuh-agent
echo "Agent Wazuh installé, enregistré auprès de ${managerHost}"
`.trim();
    }
  }
};

export function listCatalog() {
  return Object.entries(AGENT_CATALOG).map(([id, a]) => ({ id, label: a.label, description: a.description, requiresIntegration: a.requiresIntegration }));
}

export function previewScript(agentId) {
  const agent = AGENT_CATALOG[agentId];
  if (!agent) throw Object.assign(new Error(`Agent inconnu: ${agentId}`), { status: 404 });
  return agent.buildScript();
}
