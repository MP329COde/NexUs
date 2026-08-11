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
    custom: kc.makeApiClient(k8s.CustomObjectsApi),
    log: new k8s.Log(kc)
  };
}

async function wrap(label, fn) {
  try {
    return await fn();
  } catch (err) {
    throw new IntegrationError(`Kubernetes · ${label}: ${err.body?.message || err.message}`, { status: err.statusCode === 401 || err.statusCode === 403 ? 401 : 502, cause: err });
  }
}

export async function getStatus() {
  const c = clients();
  if (!c) return notConfigured('Kubernetes');
  return wrap('version', async () => {
    const res = await c.core.listNamespace();
    return { configured: true, ok: true, message: `Cluster joignable · ${res.body.items.length} namespaces` };
  });
}

export async function listNamespaces() {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('namespaces', async () => (await c.core.listNamespace()).body.items.map((n) => ({
    name: n.metadata.name,
    status: n.status.phase,
    createdAt: n.metadata.creationTimestamp
  })));
}

export async function listPods(namespace) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('pods', async () => {
    const res = namespace ? await c.core.listNamespacedPod(namespace) : await c.core.listPodForAllNamespaces();
    return res.body.items.map((p) => ({
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
    const res = namespace ? await c.apps.listNamespacedDeployment(namespace) : await c.apps.listDeploymentForAllNamespaces();
    return res.body.items.map((d) => ({
      name: d.metadata.name,
      namespace: d.metadata.namespace,
      replicas: d.status.replicas || 0,
      ready: d.status.readyAvailable ?? d.status.readyReplicas ?? 0,
      updated: d.status.updatedReplicas || 0,
      image: d.spec.template.spec.containers[0]?.image
    }));
  });
}

export async function listServices(namespace) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('services', async () => {
    const res = namespace ? await c.core.listNamespacedService(namespace) : await c.core.listServiceForAllNamespaces();
    return res.body.items.map((s) => ({
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
    const patch = { spec: { template: { metadata: { annotations: { 'nexus.console/restartedAt': new Date().toISOString() } } } } };
    await c.apps.patchNamespacedDeployment(
      name, namespace, patch, undefined, undefined, undefined, undefined, undefined,
      { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } }
    );
    return { ok: true, message: `Redémarrage déclenché pour ${namespace}/${name}` };
  });
}

export async function getPodLogs(namespace, pod, container, tailLines = 200) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('logs', async () => {
    const res = await c.core.readNamespacedPodLog(pod, namespace, container, undefined, undefined, undefined, undefined, undefined, undefined, tailLines);
    return res.body;
  });
}

export async function listCertManagerCertificates(namespace) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('cert-manager', async () => {
    const res = namespace
      ? await c.custom.listNamespacedCustomObject('cert-manager.io', 'v1', namespace, 'certificates')
      : await c.custom.listClusterCustomObject('cert-manager.io', 'v1', 'certificates');
    return (res.body.items || []).map((item) => ({
      name: item.metadata.name,
      namespace: item.metadata.namespace,
      secretName: item.spec?.secretName,
      dnsNames: item.spec?.dnsNames || [],
      ready: (item.status?.conditions || []).find((c2) => c2.type === 'Ready')?.status === 'True',
      renewalTime: item.status?.renewalTime
    }));
  });
}
