import * as kubernetesService from './integrations/kubernetesService.js';
import * as argocdService from './integrations/argocdService.js';
import * as haproxyService from './integrations/haproxyService.js';
import * as gitlabService from './integrations/gitlabService.js';
import * as proxmoxService from './integrations/proxmoxService.js';
import * as traefikService from './integrations/traefikService.js';
import * as certManagerService from './integrations/certManagerService.js';
import * as grafanaService from './integrations/grafanaService.js';
import * as wazuhService from './integrations/wazuhService.js';

// Point d'entrée unique listant les intégrations disponibles: utilisé par
// l'agrégateur de statut (dashboard) et pouvant accueillir de futures intégrations
// sans modifier le reste du backend.
export const integrations = {
  kubernetes: { label: 'Kubernetes', service: kubernetesService, domain: 'k8s' },
  argocd: { label: 'Argo CD', service: argocdService, domain: 'dev' },
  haproxy: { label: 'HAProxy', service: haproxyService, domain: 'net' },
  gitlab: { label: 'GitLab', service: gitlabService, domain: 'dev' },
  proxmox: { label: 'Proxmox', service: proxmoxService, domain: 'inf' },
  traefik: { label: 'Traefik', service: traefikService, domain: 'net' },
  certManager: { label: 'Cert-Manager', service: certManagerService, domain: 'net' },
  grafana: { label: 'Grafana', service: grafanaService, domain: 'mon' },
  wazuh: { label: 'Wazuh', service: wazuhService, domain: 'sec' }
};

export {
  kubernetesService, argocdService, haproxyService, gitlabService,
  proxmoxService, traefikService, certManagerService, grafanaService, wazuhService
};
