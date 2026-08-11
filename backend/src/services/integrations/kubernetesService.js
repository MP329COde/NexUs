import * as k8s from '@kubernetes/client-node';
import { getRawIntegration } from '../../store/settingsStore.js';
import { IntegrationError, notConfigured } from './httpClient.js';

function buildKubeConfig() {
  const cfg = getRawIntegration('kubernetes');
  if (!cfg.apiServer) return null;
  const kc = new k8s.KubeConfig();
  kc.loadFromOptions({
    clusters: [{ name: 'nexus', server: cfg.apiServer, skipTLSVerify: Boolean(cfg.insecureSkipTlsVerify) }],
    users: [{ name: 'nexus-user', token: cfg.token || undefined }],
    contexts: [{ name: 'nexus', cluster: 'nexus', user: 'nexus-user', namespace: cfg.namespace || 'default' }],
    currentContext: 'nexus'
  });
  return kc;
}

function clients() {
  const kc = buildKubeConfig();
  if (!kc) return null;
  return {
    core: kc.makeApiClient(k8s.CoreV1Api),
    apps: kc.makeApiClient(k8s.AppsV1Api),
    custom: kc.makeApiClient(k8s.CustomObjectsApi)
  };
}

// Depuis @kubernetes/client-node v1 (client basé sur fetch, cf. migration de
// sécurité qui a retiré la dépendance `request` obsolète/vulnérable) : les
// méthodes prennent un objet de paramètres unique et renvoient directement la
// ressource désérialisée (fini le `{ body }` des versions < 1.0).
async function wrap(label, fn) {
  try {
    return await fn();
  } catch (err) {
    const status = err.code;
    throw new IntegrationError(`Kubernetes · ${label}: ${err.body?.message || err.message}`, { status: status === 401 || status === 403 ? 401 : 502, cause: err });
  }
}

export async function getStatus() {
  const c = clients();
  if (!c) return notConfigured('Kubernetes');
  return wrap('version', async () => {
    const res = await c.core.listNamespace();
    return { configured: true, ok: true, message: `Cluster joignable · ${res.items.length} namespaces` };
  });
}

export async function listNamespaces() {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('namespaces', async () => (await c.core.listNamespace()).items.map((n) => ({
    name: n.metadata.name,
    status: n.status.phase,
    createdAt: n.metadata.creationTimestamp
  })));
}

export async function listPods(namespace) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('pods', async () => {
    const res = namespace ? await c.core.listNamespacedPod({ namespace }) : await c.core.listPodForAllNamespaces();
    return res.items.map((p) => ({
      name: p.metadata.name,
      namespace: p.metadata.namespace,
      phase: p.status.phase,
      restarts: (p.status.containerStatuses || []).reduce((s, cs) => s + (cs.restartCount || 0), 0),
      node: p.spec.nodeName,
      startedAt: p.status.startTime
    }));
  });
}

export async function listDeployments(namespace) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('deployments', async () => {
    const res = namespace ? await c.apps.listNamespacedDeployment({ namespace }) : await c.apps.listDeploymentForAllNamespaces();
    return res.items.map((d) => ({
      name: d.metadata.name,
      namespace: d.metadata.namespace,
      replicas: d.status.replicas || 0,
      ready: d.status.readyReplicas ?? 0,
      updated: d.status.updatedReplicas || 0,
      image: d.spec.template.spec.containers[0]?.image
    }));
  });
}

export async function listServices(namespace) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('services', async () => {
    const res = namespace ? await c.core.listNamespacedService({ namespace }) : await c.core.listServiceForAllNamespaces();
    return res.items.map((s) => ({
      name: s.metadata.name,
      namespace: s.metadata.namespace,
      type: s.spec.type,
      clusterIP: s.spec.clusterIP,
      ports: (s.spec.ports || []).map((p) => `${p.port}${p.protocol === 'UDP' ? '/udp' : ''}`)
    }));
  });
}

export async function restartDeployment(namespace, name) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('restart deployment', async () => {
    // JSON Patch (RFC 6902) plutôt qu'un merge-patch : le client v1 négocie
    // "application/json-patch+json" par défaut et n'expose pas de moyen
    // simple de forcer un autre Content-Type sur un appel isolé. On relit
    // les annotations existantes pour ne pas les écraser.
    const current = await c.apps.readNamespacedDeployment({ name, namespace });
    const annotations = { ...(current.spec.template.metadata.annotations || {}), 'nexus.console/restartedAt': new Date().toISOString() };
    await c.apps.patchNamespacedDeployment({
      name,
      namespace,
      body: [{ op: 'add', path: '/spec/template/metadata/annotations', value: annotations }]
    });
    return { ok: true, message: `Redémarrage déclenché pour ${namespace}/${name}` };
  });
}

export async function getPodLogs(namespace, pod, container, tailLines = 200) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('logs', async () => c.core.readNamespacedPodLog({ name: pod, namespace, container, tailLines }));
}

export async function listCertManagerCertificates(namespace) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('cert-manager', async () => {
    const res = namespace
      ? await c.custom.listNamespacedCustomObject({ group: 'cert-manager.io', version: 'v1', namespace, plural: 'certificates' })
      : await c.custom.listClusterCustomObject({ group: 'cert-manager.io', version: 'v1', plural: 'certificates' });
    return (res.items || []).map((item) => ({
      name: item.metadata.name,
      namespace: item.metadata.namespace,
      secretName: item.spec?.secretName,
      dnsNames: item.spec?.dnsNames || [],
      ready: (item.status?.conditions || []).find((c2) => c2.type === 'Ready')?.status === 'True',
      renewalTime: item.status?.renewalTime
    }));
  });
}
