import * as k8s from '@kubernetes/client-node';
import { Writable } from 'node:stream';
import { getK8sCluster } from '../../store/settingsStore.js';
import { IntegrationError, notConfigured } from './httpClient.js';

function buildKubeConfig(clusterId) {
  const cfg = getK8sCluster(clusterId);
  if (!cfg || !cfg.apiServer) return null;
  const kc = new k8s.KubeConfig();
  kc.loadFromOptions({
    clusters: [{ name: 'nexus', server: cfg.apiServer, skipTLSVerify: Boolean(cfg.insecureSkipTlsVerify) }],
    users: [{ name: 'nexus-user', token: cfg.token || undefined }],
    contexts: [{ name: 'nexus', cluster: 'nexus', user: 'nexus-user', namespace: cfg.namespace || 'default' }],
    currentContext: 'nexus'
  });
  return kc;
}

function clients(clusterId) {
  const kc = buildKubeConfig(clusterId);
  if (!kc) return null;
  return {
    kc,
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

export async function getStatus(clusterId) {
  const c = clients(clusterId);
  if (!c) return notConfigured('Kubernetes');
  return wrap('version', async () => {
    const res = await c.core.listNamespace();
    return { configured: true, ok: true, message: `Cluster joignable · ${res.items.length} namespaces` };
  });
}

// Nœuds physiques du cluster (kubectl get nodes) — utilisé par la topologie
// graphique (networkTopologyService.js) pour représenter le cluster K8s comme
// un vrai sous-graphe (cluster → nœuds → pods), pas seulement une liste de
// services. Aucun autre appelant avant ce lot.
export async function listClusterNodes(clusterId) {
  const c = clients(clusterId);
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('nodes', async () => (await c.core.listNode()).items.map((n) => ({
    name: n.metadata.name,
    ready: (n.status.conditions || []).some((cond) => cond.type === 'Ready' && cond.status === 'True'),
    roles: Object.keys(n.metadata.labels || {})
      .filter((k) => k.startsWith('node-role.kubernetes.io/'))
      .map((k) => k.replace('node-role.kubernetes.io/', '')) || [],
    kubeletVersion: n.status.nodeInfo?.kubeletVersion
  })));
}

export async function listNamespaces(clusterId) {
  const c = clients(clusterId);
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('namespaces', async () => (await c.core.listNamespace()).items.map((n) => ({
    name: n.metadata.name,
    status: n.status.phase,
    createdAt: n.metadata.creationTimestamp
  })));
}

// Utilisé par le nettoyage automatique des environnements de preview expirés
// (previewEnvironmentCleanupService.js) : supprime réellement le namespace
// provisionné, pas seulement l'enregistrement en base — sans quoi les
// ressources restaient orphelines indéfiniment (limite documentée dans
// todo.md, "aucune infrastructure cron/setInterval n'existe").
export async function deleteNamespace(namespace, clusterId) {
  const c = clients(clusterId);
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('delete namespace', async () => {
    await c.core.deleteNamespace({ name: namespace });
    return { ok: true, message: `Namespace ${namespace} en cours de suppression` };
  });
}

export async function listPods(namespace, clusterId) {
  const c = clients(clusterId);
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
export async function describePod(namespace, name, clusterId) {
  const c = clients(clusterId);
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
export async function getPodOwners(namespace, name, clusterId) {
  const c = clients(clusterId);
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
export async function listEvents(namespace, involvedObjectName, clusterId) {
  const c = clients(clusterId);
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
export async function getPodMetrics(namespace, name, clusterId) {
  const c = clients(clusterId);
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('pod metrics', async () => {
    const res = await c.custom.getNamespacedCustomObject({ group: 'metrics.k8s.io', version: 'v1beta1', namespace, plural: 'pods', name });
    return {
      timestamp: res.timestamp,
      containers: (res.containers || []).map((ct) => ({ name: ct.name, cpu: ct.usage?.cpu, memory: ct.usage?.memory }))
    };
  });
}

export async function listDeployments(namespace, clusterId) {
  const c = clients(clusterId);
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

// Rassemble les signaux réels nécessaires au diagnostic automatique d'un
// deployment : disponibilité, redémarrages par pod, limites de ressources
// déclarées, et usage réel (metrics-server) si disponible. Ne calcule aucune
// cause ici — c'est lib/diagnostics.js (frontend) qui applique les règles,
// pour que la logique de diagnostic reste testable et visible indépendamment
// de la collecte de données.
export async function getDeploymentDiagnostics(namespace, name, clusterId) {
  const c = clients(clusterId);
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('deployment diagnostics', async () => {
    const deployment = await c.apps.readNamespacedDeployment({ name, namespace });
    const selector = Object.entries(deployment.spec.selector.matchLabels || {}).map(([k, v]) => `${k}=${v}`).join(',');
    const podList = await c.core.listNamespacedPod({ namespace, labelSelector: selector });

    const limits = (deployment.spec.template.spec.containers || []).map((ct) => ({
      name: ct.name,
      cpu: ct.resources?.limits?.cpu || null,
      memory: ct.resources?.limits?.memory || null
    }));

    const pods = podList.items.map((p) => ({
      name: p.metadata.name,
      phase: p.status.phase,
      restarts: (p.status.containerStatuses || []).reduce((s, cs) => s + (cs.restartCount || 0), 0),
      startedAt: p.status.startTime
    }));

    let metrics = null;
    try {
      const metricsRes = await c.custom.listNamespacedCustomObject({ group: 'metrics.k8s.io', version: 'v1beta1', namespace, plural: 'pods' });
      const podNames = new Set(pods.map((p) => p.name));
      metrics = (metricsRes.items || [])
        .filter((m) => podNames.has(m.metadata.name))
        .map((m) => ({
          pod: m.metadata.name,
          containers: (m.containers || []).map((ct) => ({ name: ct.name, cpu: ct.usage?.cpu, memory: ct.usage?.memory }))
        }));
    } catch { /* metrics-server absent — pas de données d'usage, diagnostic dégradé mais pas d'erreur bloquante */ }

    return {
      replicas: deployment.status.replicas || 0,
      ready: deployment.status.readyReplicas || 0,
      limits,
      pods,
      metrics
    };
  });
}

export async function listServices(namespace, clusterId) {
  const c = clients(clusterId);
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

export async function restartDeployment(namespace, name, clusterId) {
  const c = clients(clusterId);
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
export async function rollbackDeployment(namespace, name, clusterId) {
  const c = clients(clusterId);
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
export async function purgeDeploymentPods(namespace, name, clusterId) {
  const c = clients(clusterId);
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('purge deployment pods', async () => {
    const deployment = await c.apps.readNamespacedDeployment({ name, namespace });
    const selector = Object.entries(deployment.spec.selector.matchLabels || {}).map(([k, v]) => `${k}=${v}`).join(',');
    const podList = await c.core.listNamespacedPod({ namespace, labelSelector: selector });
    await Promise.all(podList.items.map((p) => c.core.deleteNamespacedPod({ name: p.metadata.name, namespace })));
    return { ok: true, message: `${podList.items.length} pod(s) purgé(s) pour ${namespace}/${name}`, count: podList.items.length };
  });
}

export async function getPodLogs(namespace, pod, container, tailLines = 200, clusterId) {
  const c = clients(clusterId);
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('logs', async () => c.core.readNamespacedPodLog({ name: pod, namespace, container, tailLines }));
}

export async function scaleDeployment(namespace, name, replicas, clusterId) {
  const c = clients(clusterId);
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('scale deployment', async () => {
    // Comme restartDeployment : le client v1 négocie "application/json-patch+json"
    // par défaut, y compris sur le sous-endpoint /scale — un body merge-patch
    // ({spec:{replicas}}) est rejeté par l'API server (400 "cannot unmarshal
    // object into []jsonPatchOp"). Découvert en testant contre un vrai cluster
    // k3d (échec silencieux jusque-là, jamais testé bout en bout).
    await c.apps.patchNamespacedDeploymentScale({
      name,
      namespace,
      body: [{ op: 'replace', path: '/spec/replicas', value: replicas }]
    });
    return { ok: true, message: `${namespace}/${name} mis à l'échelle sur ${replicas} réplique(s)` };
  });
}

// Suppression directe (pas d'éviction) : le contrôleur du deployment/replicaset
// recrée immédiatement un pod de remplacement. Sans danger pour un pod géré,
// mais définitif pour un pod nu (rare dans cette console orientée deployments).
export async function deletePod(namespace, name, clusterId) {
  const c = clients(clusterId);
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
export async function renewCertificate(namespace, name, clusterId) {
  const c = clients(clusterId);
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  return wrap('renew certificate', async () => {
    const cert = await c.custom.getNamespacedCustomObject({ group: 'cert-manager.io', version: 'v1', namespace, plural: 'certificates', name });
    const secretName = cert.spec?.secretName;
    if (!secretName) throw new IntegrationError(`Certificat ${namespace}/${name} sans secretName`, { status: 409 });
    await c.core.deleteNamespacedSecret({ name: secretName, namespace });
    return { ok: true, message: `Renouvellement déclenché pour ${namespace}/${name} (secret ${secretName} recréé par cert-manager)` };
  });
}

export async function listCertManagerCertificates(namespace, clusterId) {
  const c = clients(clusterId);
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
      renewalTime: item.status?.renewalTime,
      notAfter: item.status?.notAfter
    }));
  });
}

// --- Terminal sécurisé (voir terminalService.js pour les permissions par
// palier) : exécution non-interactive d'une commande dans un conteneur
// (pas de session shell ouverte — une commande, un résultat, auditable), et
// "apply" équivalent server-side apply de kubectl, tous deux au travers de
// l'API Kubernetes officielle, jamais d'un vrai shell côté serveur.
const EXEC_TIMEOUT_MS = 10_000;
const EXEC_OUTPUT_LIMIT = 20_000;

class CappedWritable extends Writable {
  constructor() {
    super();
    this.chunks = [];
    this.length = 0;
  }
  _write(chunk, enc, cb) {
    if (this.length < EXEC_OUTPUT_LIMIT) { this.chunks.push(chunk); this.length += chunk.length; }
    cb();
  }
  text() { return Buffer.concat(this.chunks).toString('utf8').slice(0, EXEC_OUTPUT_LIMIT); }
}

export async function execInPod(namespace, pod, container, command, clusterId) {
  const c = clients(clusterId);
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  const exec = new k8s.Exec(c.kc);
  const stdout = new CappedWritable();
  const stderr = new CappedWritable();
  let exitStatus = null;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new IntegrationError(`Commande interrompue après ${EXEC_TIMEOUT_MS / 1000}s (pas de session interactive)`, { status: 504 })), EXEC_TIMEOUT_MS);
    exec.exec(namespace, pod, container || undefined, command, stdout, stderr, null, false, (status) => {
      exitStatus = status;
      clearTimeout(timer);
      resolve();
    }).catch((err) => { clearTimeout(timer); reject(new IntegrationError(`Kubernetes · exec: ${err.message}`, { status: 502, cause: err })); });
  });

  return { stdout: stdout.text(), stderr: stderr.text(), status: exitStatus?.status || 'Unknown', message: exitStatus?.message };
}

export async function applyManifest(manifest, clusterId) {
  const c = clients(clusterId);
  if (!c) throw new IntegrationError('Kubernetes non configuré', { status: 409 });
  if (!manifest?.apiVersion || !manifest?.kind || !manifest?.metadata?.name) {
    throw new IntegrationError('Manifest invalide : apiVersion, kind et metadata.name sont requis', { status: 400 });
  }
  return wrap('apply', async () => {
    const objectApi = k8s.KubernetesObjectApi.makeApiClient(c.kc);
    const result = await objectApi.patch(manifest, undefined, undefined, 'nexus-console', true, k8s.PatchStrategy.ServerSideApply);
    return { kind: result.kind, name: result.metadata.name, namespace: result.metadata.namespace, resourceVersion: result.metadata.resourceVersion };
  });
}
