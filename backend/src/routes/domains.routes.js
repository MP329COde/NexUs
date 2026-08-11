import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { listProxies } from '../store/proxyStore.js';
import { listCertificates } from '../services/integrations/certManagerService.js';

const router = Router();
router.use(requireAuth);

// Vue "domaines": dérivée des proxies gérés par la console, enrichie avec l'état
// des certificats cert-manager quand Kubernetes est configuré.
router.get('/', asyncHandler(async (req, res) => {
  const proxies = listProxies();
  let certs = [];
  try {
    certs = await listCertificates();
  } catch {
    certs = [];
  }
  const items = proxies.map((p) => {
    const cert = certs.find((c) => c.dnsNames?.includes(p.domain));
    return {
      domain: p.domain,
      proxyId: p.id,
      proxyName: p.name,
      tls: p.tls,
      engine: p.engine,
      status: p.status,
      certificate: cert ? { name: cert.name, ready: cert.ready, renewalTime: cert.renewalTime } : null
    };
  });
  res.json({ ok: true, items });
}));

export default router;
