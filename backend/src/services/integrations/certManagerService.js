import { getRawIntegration } from '../../store/settingsStore.js';
import { notConfigured } from './httpClient.js';
import { listCertManagerCertificates } from './kubernetesService.js';

// cert-manager expose ses ressources via l'API Kubernetes (CRD certificates.cert-manager.io) :
// aucune configuration dédiée n'est nécessaire au-delà de l'accès au cluster.
export async function getStatus() {
  const k8sCfg = getRawIntegration('kubernetes');
  if (!k8sCfg.apiServer) return notConfigured('Cert-Manager (dépend de Kubernetes)');
  try {
    const certs = await listCertManagerCertificates();
    const notReady = certs.filter((c) => !c.ready).length;
    return { configured: true, ok: notReady === 0, message: `${certs.length} certificat(s), ${notReady} en attente` };
  } catch (err) {
    return { configured: true, ok: false, message: err.message };
  }
}

export async function listCertificates(namespace) {
  return listCertManagerCertificates(namespace);
}
