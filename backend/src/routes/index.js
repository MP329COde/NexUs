import { Router } from 'express';
import authRoutes from './auth.routes.js';
import settingsRoutes from './settings.routes.js';
import statusRoutes from './status.routes.js';
import kubernetesRoutes from './kubernetes.routes.js';
import argocdRoutes from './argocd.routes.js';
import haproxyRoutes from './haproxy.routes.js';
import gitlabRoutes from './gitlab.routes.js';
import proxmoxRoutes from './proxmox.routes.js';
import traefikRoutes from './traefik.routes.js';
import certmanagerRoutes from './certmanager.routes.js';
import grafanaRoutes from './grafana.routes.js';
import proxiesRoutes from './proxies.routes.js';
import domainsRoutes from './domains.routes.js';
import deploymentsRoutes from './deployments.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/settings', settingsRoutes);
router.use('/status', statusRoutes);
router.use('/kubernetes', kubernetesRoutes);
router.use('/argocd', argocdRoutes);
router.use('/haproxy', haproxyRoutes);
router.use('/gitlab', gitlabRoutes);
router.use('/proxmox', proxmoxRoutes);
router.use('/traefik', traefikRoutes);
router.use('/certmanager', certmanagerRoutes);
router.use('/grafana', grafanaRoutes);
router.use('/proxies', proxiesRoutes);
router.use('/domains', domainsRoutes);
router.use('/deployments', deploymentsRoutes);

export default router;
