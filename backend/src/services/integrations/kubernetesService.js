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

// "Décrire" : équivalent réduit de `kubectl describe pod`, reconstruit à
// partir de l'objet Pod complet (pas seulement les champs déjà retenus par
// listPods) — conteneurs, conditions, événements liés au pod.
export async function describePod(namespace, name) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('describe pod', async () => {
    const pod = await c.core.readNamespacedPod({ name, namespace });
    return {
      name: pod.metadata.name,
      namespace: pod.metadata.namespace,
      labels: pod.metadata.labels || {},
      annotations: pod.metadata.annotations || {},
      node: pod.spec.nodeName,
      phase: pod.status.phase,
      podIP: pod.status.podIP,
      startedAt: pod.status.startTime,
      conditions: (pod.status.conditions || []).map((c2) => ({ type: c2.type, status: c2.status, reason: c2.reason, message: c2.message })),
      containers: (pod.spec.containers || []).map((c2) => {
        const cs = (pod.status.containerStatuses || []).find((s) => s.name === c2.name);
        return {
          name: c2.name, image: c2.image,
          resources: c2.resources,
          ready: cs?.ready ?? null, restartCount: cs?.restartCount ?? 0,
          state: cs?.state ? Object.keys(cs.state)[0] : null
        };
      })
    };
  });
}

// Résout le Deployment propriétaire d'un pod (via la chaîne d'ownerReferences
// Pod → ReplicaSet → Deployment) et les Services qui le ciblent (dont le
// selector est un sous-ensemble des labels du pod) — c'est ce qui permet aux
// actions contextuelles "Voir Deployment"/"Voir Service" du Command Center
// de pointer vers la bonne ressource plutôt que de deviner à partir du nom.
export async function getPodOwners(namespace, name) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('pod owners', async () => {
    const pod = await c.core.readNamespacedPod({ name, namespace });
    let deploymentName = null;
    const rsRef = (pod.metadata.ownerReferences || []).find((o) => o.kind === 'ReplicaSet');
    if (rsRef) {
      try {
        const rs = await c.apps.readNamespacedReplicaSet({ name: rsRef.name, namespace });
        deploymentName = (rs.metadata.ownerReferences || []).find((o) => o.kind === 'Deployment')?.name || null;
      } catch { /* ReplicaSet déjà supprimé */ }
    }
    const podLabels = pod.metadata.labels || {};
    const services = await c.core.listNamespacedService({ namespace });
    const serviceNames = services.items
      .filter((s) => {
        const sel = s.spec.selector || {};
        const keys = Object.keys(sel);
        return keys.length > 0 && keys.every((k) => podLabels[k] === sel[k]);
      })
      .map((s) => s.metadata.name);
    return { deploymentName, serviceNames };
  });
}

// Événements Kubernetes liés à un objet précis (pod, deployment...) — utiles
// pour diagnostiquer un CrashLoopBackOff, un échec de scheduling, une image
// introuvable, etc. sans avoir besoin des logs applicatifs.
export async function listEvents(namespace, involvedObjectName) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('events', async () => {
    const fieldSelector = involvedObjectName ? `involvedObject.name=${involvedObjectName}` : undefined;
    const res = await c.core.listNamespacedEvent({ namespace, fieldSelector });
    return res.items
      .map((e) => ({
        type: e.type, reason: e.reason, message: e.message, count: e.count || 1,
        lastTimestamp: e.lastTimestamp || e.eventTime, object: e.involvedObject?.name
      }))
      .sort((a, b) => new Date(b.lastTimestamp || 0) - new Date(a.lastTimestamp || 0));
  });
}

// Métriques instantanées (metrics-server, API metrics.k8s.io) — absentes si
// metrics-server n'est pas installé sur le cluster : erreur propre remontée
// telle quelle plutôt qu'une valeur inventée.
export async function getPodMetrics(namespace, name) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('pod metrics', async () => {
    const res = await c.custom.getNamespacedCustomObject({ group: 'metrics.k8s.io', version: 'v1beta1', namespace, plural: 'pods', name });
    return {
      timestamp: res.timestamp,
      containers: (res.containers || []).map((ct) => ({ name: ct.name, cpu: ct.usage?.cpu, memory: ct.usage?.memory }))
    };
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

// "Rollback" au sens kubectl rollout undo : le ReplicaSet précédent (celui
// juste avant l'actuel par numéro de révision) porte encore le pod template
// d'avant le dernier déploiement — on le recopie dans le Deployment. Kubernetes
// ne conserve que les ReplicaSets gardés par `revisionHistoryLimit` (10 par
// défaut) : au-delà, il n'y a plus rien à restaurer.
export async function rollbackDeployment(namespace, name) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('rollback deployment', async () => {
    const deployment = await c.apps.readNamespacedDeployment({ name, namespace });
    const selector = Object.entries(deployment.spec.selector.matchLabels || {}).map(([k, v]) => `${k}=${v}`).join(',');
    const rsList = await c.apps.listNamespacedReplicaSet({ namespace, labelSelector: selector });
    const owned = rsList.items
      .filter((rs) => (rs.metadata.ownerReferences || []).some((o) => o.kind === 'Deployment' && o.name === name))
      .map((rs) => ({ rs, revision: Number(rs.metadata.annotations?.['deployment.kubernetes.io/revision'] || 0) }))
      .sort((a, b) => b.revision - a.revision);
    if (owned.length < 2) {
      throw new IntegrationError(`Aucune révision précédente disponible pour ${namespace}/${name}`, { status: 409 });
    }
    const previous = owned[1].rs;
    await c.apps.patchNamespacedDeployment({
      name,
      namespace,
      body: [{ op: 'replace', path: '/spec/template', value: previous.spec.template }]
    });
    return { ok: true, message: `${namespace}/${name} restauré à la révision ${owned[1].revision}`, revision: owned[1].revision };
  });
}

// Purge : supprime immédiatement tous les pods du deployment (contrairement
// au redémarrage progressif de restartDeployment). Coupe la disponibilité
// le temps que le contrôleur recrée les pods — action volontairement plus
// radicale, à réserver aux cas où un rolling restart ne suffit pas.
export async function purgeDeploymentPods(namespace, name) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('purge deployment pods', async () => {
    const deployment = await c.apps.readNamespacedDeployment({ name, namespace });
    const selector = Object.entries(deployment.spec.selector.matchLabels || {}).map(([k, v]) => `${k}=${v}`).join(',');
    const podList = await c.core.listNamespacedPod({ namespace, labelSelector: selector });
    await Promise.all(podList.items.map((p) => c.core.deleteNamespacedPod({ name: p.metadata.name, namespace })));
    return { ok: true, message: `${podList.items.length} pod(s) purgé(s) pour ${namespace}/${name}`, count: podList.items.length };
  });
}

export async function getPodLogs(namespace, pod, container, tailLines = 200) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('logs', async () => c.core.readNamespacedPodLog({ name: pod, namespace, container, tailLines }));
}

export async function scaleDeployment(namespace, name, replicas) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('scale deployment', async () => {
    await c.apps.patchNamespacedDeploymentScale({
      name,
      namespace,
      body: { spec: { replicas } }
    });
    return { ok: true, message: `${namespace}/${name} mis à l'échelle sur ${replicas} réplique(s)` };
  });
}

// Suppression directe (pas d'éviction) : le contrôleur du deployment/replicaset
// recrée immédiatement un pod de remplacement. Sans danger pour un pod géré,
// mais définitif pour un pod nu (rare dans cette console orientée deployments).
export async function deletePod(namespace, name) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('delete pod', async () => {
    await c.core.deleteNamespacedPod({ name, namespace });
    return { ok: true, message: `Pod ${namespace}/${name} supprimé` };
  });
}

// Renouvellement forcé : cert-manager n'expose pas d'endpoint "renew" via
// l'API Kubernetes standard (contrairement à la CLI kubectl cert-manager,
// qui patche un sous-objet interne). Le mécanisme réel et supporté est de
// supprimer le Secret TLS associé : cert-manager le détecte manquant et
// réémet immédiatement un certificat.
export async function renewCertificate(namespace, name) {
  const c = clients();
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('renew certificate', async () => {
    const cert = await c.custom.getNamespacedCustomObject({ group: 'cert-manager.io', version: 'v1', namespace, plural: 'certificates', name });
    const secretName = cert.spec?.secretName;
    if (!secretName) throw new IntegrationError(`Certificat ${namespace}/${name} sans secretName`, { status: 409 });
    await c.core.deleteNamespacedSecret({ name: secretName, namespace });
    return { ok: true, message: `Renouvellement déclenché pour ${namespace}/${name} (secret ${secretName} recréé par cert-manager)` };
  });
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
