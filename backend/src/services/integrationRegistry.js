import * as kubernetesService from './integrations/kubernetesService.js';
import * as argocdService from './integrations/argocdService.js';
import * as haproxyService from './integrations/haproxyService.js';
import * as gitlabService from './integrations/gitlabService.js';
import * as githubService from './integrations/githubService.js';
import * as githubPlatformService from './integrations/githubPlatformService.js';
import * as giteaService from './integrations/giteaService.js';
import * as proxmoxService from './integrations/proxmoxService.js';
import * as traefikService from './integrations/traefikService.js';
import * as certManagerService from './integrations/certManagerService.js';
import * as grafanaService from './integrations/grafanaService.js';
import * as wazuhService from './integrations/wazuhService.js';
import * as privateRegistryService from './integrations/privateRegistryService.js';
import * as notificationWebhookService from './integrations/notificationWebhookService.js';
import * as ovhService from './integrations/ovhService.js';
import * as duckdnsService from './integrations/duckdnsService.js';
import * as gitBackupService from './gitBackupService.js';

// Point d'entrée unique listant les intégrations disponibles: utilisé par
// l'agrégateur de statut (dashboard) et pouvant accueillir de futures intégrations
// sans modifier le reste du backend.
export const integrations = {
  kubernetes: { label: 'Kubernetes', service: kubernetesService, domain: 'k8s' },
  argocd: { label: 'Argo CD', service: argocdService, domain: 'dev' },
  haproxy: { label: 'HAProxy', service: haproxyService, domain: 'net' },
  gitlab: { label: 'GitLab', service: gitlabService, domain: 'dev' },
  github: { label: 'GitHub', service: githubService, domain: 'dev' },
  githubPlatform: { label: 'GitHub (compte plateforme)', service: githubPlatformService, domain: 'dev' },
  gitea: { label: 'Gitea', service: giteaService, domain: 'dev' },
  proxmox: { label: 'Proxmox', service: proxmoxService, domain: 'inf' },
  traefik: { label: 'Traefik', service: traefikService, domain: 'net' },
  certManager: { label: 'Cert-Manager', service: certManagerService, domain: 'net' },
  grafana: { label: 'Grafana', service: grafanaService, domain: 'mon' },
  wazuh: { label: 'Wazuh', service: wazuhService, domain: 'sec' },
  registry: { label: 'Registre privé', service: privateRegistryService, domain: 'dev' },
  notificationsWebhook: { label: 'Notifications sortantes', service: notificationWebhookService, domain: 'mon' },
  ovh: { label: 'OVH (DNS)', service: ovhService, domain: 'net' },
  duckdns: { label: 'DuckDNS', service: duckdnsService, domain: 'net' },
  gitBackup: { label: 'Sauvegarde Git', service: gitBackupService, domain: 'settings' }
};

export {
  kubernetesService, argocdService, haproxyService, gitlabService, githubService, githubPlatformService, giteaService,
  proxmoxService, traefikService, certManagerService, grafanaService, wazuhService,
  privateRegistryService, notificationWebhookService, ovhService, duckdnsService, gitBackupService
};
