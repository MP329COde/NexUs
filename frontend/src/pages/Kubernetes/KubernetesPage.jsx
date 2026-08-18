import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ActionConfirmModal from '../../components/ui/ActionConfirmModal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import { useCommandCenter } from '../../context/CommandCenterContext.jsx';
import PodLogsDialog from './PodLogsDialog.jsx';
import PodDetailDialog from './PodDetailDialog.jsx';
import DiagnosticsModal from './DiagnosticsModal.jsx';
import './KubernetesPage.css';

export default function KubernetesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Pré-rempli depuis ?ns=<namespace> (lien direct depuis la fiche composant
  // du Software Catalog, voir CatalogComponentPage.jsx#EnvironmentPodsSummary) —
  // sans ça, le lien "N pod(s) Running" ouvrait la page sans jamais filtrer
  // sur le namespace annoncé.
  const [namespace, setNamespace] = useState(() => searchParams.get('ns') || '');
  const [logsPod, setLogsPod] = useState(null);
  const [detailPod, setDetailPod] = useState(null); // { pod, tab }
  const [diagnosing, setDiagnosing] = useState(null); // { namespace, name }
  const [scaling, setScaling] = useState(null); // "ns/name" en cours d'édition
  const [scaleValue, setScaleValue] = useState('');
  const [pending, setPending] = useState(null); // action en attente de confirmation
  const status = useApi(() => api.get('/kubernetes/status'), []);
  const namespaces = useApi(() => api.get('/kubernetes/namespaces'), [], { pollMs: 30000 });
  const deployments = useApi(() => api.get(`/kubernetes/deployments${namespace ? `?namespace=${namespace}` : ''}`), [namespace], { pollMs: 15000 });
  const pods = useApi(() => api.get(`/kubernetes/pods${namespace ? `?namespace=${namespace}` : ''}`), [namespace], { pollMs: 15000 });
  const notify = useNotify();
  const { openPalette } = useCommandCenter();

  const configured = status.data?.status?.configured;

  async function scale(ns, name) {
    const replicas = Number(scaleValue);
    if (!Number.isInteger(replicas) || replicas < 0) return;
    try {
      const res = await api.post(`/kubernetes/deployments/${ns}/${name}/scale`, { replicas });
      notify(res.message, { type: 'ok', title: 'Mise à l\'échelle' });
      setScaling(null);
      deployments.reload();
    } catch (err) {
      notify(err.message, { type: 'crit', title: 'Échec de la mise à l\'échelle' });
    }
  }

  function askRestart(ns, name, replicas) {
    setPending({
      title: `Redémarrer ${name}`,
      sub: `${ns} · redémarrage progressif`,
      tone: 'warn',
      confirmLabel: 'Redémarrer',
      impact: [
        replicas ? `Rolling restart des ${replicas} réplique(s) — chaque pod est remplacé un à un.` : 'Rolling restart — chaque pod est remplacé un à un.',
        'Le service reste disponible pendant l\'opération (pas de coupure totale).',
        'Les connexions actives sur un pod remplacé sont interrompues.'
      ],
      run: async () => {
        const res = await api.post(`/kubernetes/deployments/${ns}/${name}/restart`, {});
        notify(res.message, { type: 'ok', title: 'Redémarrage déclenché' });
        deployments.reload();
      }
    });
  }

  function askRollback(ns, name) {
    setPending({
      title: `Revenir à la révision précédente — ${name}`,
      sub: `${ns} · rollback`,
      tone: 'crit',
      confirmLabel: 'Revenir en arrière',
      impact: [
        'Restaure le modèle de pod (image, variables, ressources) de la révision juste avant la dernière mise à jour.',
        'Provoque un rolling restart vers cette version antérieure.',
        'Échoue si aucune révision précédente n\'est conservée par le cluster.'
      ],
      run: async () => {
        const res = await api.post(`/kubernetes/deployments/${ns}/${name}/rollback`, {});
        notify(res.message, { type: 'ok', title: 'Retour arrière effectué' });
        deployments.reload();
      }
    });
  }

  function askPurge(ns, name, replicas) {
    setPending({
      title: `Purger tous les pods — ${name}`,
      sub: `${ns} · action radicale`,
      tone: 'crit',
      confirmLabel: 'Purger',
      requireTypedConfirmation: name,
      impact: [
        replicas ? `Supprime immédiatement les ${replicas} réplique(s) en une fois (pas de rolling, contrairement à Redémarrer).` : 'Supprime immédiatement tous les pods en une fois (pas de rolling, contrairement à Redémarrer).',
        'Coupure de service probable le temps que le contrôleur recrée les pods.',
        'À réserver aux cas où un redémarrage progressif ne suffit pas (pods bloqués, état corrompu).'
      ],
      run: async () => {
        const res = await api.post(`/kubernetes/deployments/${ns}/${name}/purge`, {});
        notify(res.message, { type: 'ok', title: 'Purge effectuée' });
        deployments.reload();
        pods.reload();
      }
    });
  }

  function askDeletePod(ns, name) {
    setPending({
      title: `Supprimer le pod ${name}`,
      sub: `${ns} · suppression directe`,
      tone: 'warn',
      confirmLabel: 'Supprimer',
      impact: [
        'Le pod est supprimé immédiatement (pas d\'éviction progressive).',
        'S\'il est géré par un deployment, un pod de remplacement est recréé aussitôt.',
        'S\'il s\'agit d\'un pod nu (sans contrôleur), la suppression est définitive.'
      ],
      run: async () => {
        const res = await api.del(`/kubernetes/pods/${ns}/${name}`);
        notify(res.message, { type: 'ok', title: 'Pod supprimé' });
        pods.reload();
      }
    });
  }

  async function showOwners(ns, name) {
    try {
      const res = await api.get(`/kubernetes/pods/${ns}/${name}/owners`);
      const parts = [];
      if (res.deploymentName) parts.push(`Deployment : ${res.deploymentName}`);
      if (res.serviceNames?.length) parts.push(`Service(s) : ${res.serviceNames.join(', ')}`);
      notify(parts.length ? parts.join(' · ') : 'Aucun Deployment ni Service propriétaire trouvé', { type: parts.length ? 'ok' : 'info', title: `Propriétaires de ${name}` });
      setNamespace(ns);
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  // Le Command Center (⌘K sur l'icône "⋯" d'un pod/deployment) navigue ici
  // avec ?ns=&pod=|deploy=&open=... plutôt que d'agir depuis la palette :
  // cet effet traduit ces paramètres en ouverture de dialogue / action, une
  // seule fois, puis nettoie l'URL pour ne pas rejouer l'action au reload.
  useEffect(() => {
    const ns = searchParams.get('ns');
    const podName = searchParams.get('pod');
    const deployName = searchParams.get('deploy');
    const open = searchParams.get('open');
    if (!ns || !open) return;

    if (podName) {
      const pod = { namespace: ns, name: podName };
      if (open === 'logs') setLogsPod(pod);
      else if (open === 'describe') setDetailPod({ pod, tab: 'describe' });
      else if (open === 'events') setDetailPod({ pod, tab: 'events' });
      else if (open === 'metrics') setDetailPod({ pod, tab: 'metrics' });
      else if (open === 'restart') askDeletePod(ns, podName);
      else if (open === 'owners') showOwners(ns, podName);
      setNamespace(ns);
    } else if (deployName) {
      const d = deployments.data?.items?.find((x) => x.namespace === ns && x.name === deployName);
      if (open === 'restart') askRestart(ns, deployName, d?.replicas);
      else if (open === 'rollback') askRollback(ns, deployName);
      else if (open === 'purge') askPurge(ns, deployName, d?.replicas);
      else if (open === 'diagnose') setDiagnosing({ namespace: ns, name: deployName });
      else if (open === 'scale') { setNamespace(ns); setScaling(`${ns}/${deployName}`); setScaleValue(String(d?.replicas ?? '')); }
    }
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, deployments.data]);

  if (status.data && !configured) {
    return (
      <>
        <PageHeader title="Kubernetes" sub="Cluster K3s/K8s, charges de travail et GitOps" />
        <div className="card"><EmptyState title="Kubernetes n'est pas configuré" hint="Renseignez l'URL du serveur API et un token de service depuis Paramètres → Kubernetes." /></div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Kubernetes"
        sub={status.data?.status?.message}
        actions={(
          <select className="input k8s-namespace-select" value={namespace} onChange={(e) => setNamespace(e.target.value)}>
            <option value="">Tous les namespaces</option>
            {namespaces.data?.items.map((n) => <option key={n.name} value={n.name}>{n.name}</option>)}
          </select>
        )}
      />

      <div className="k8s-panel-grid">
        <Panel title="Deployments" sub="Statut des déploiements et actions" span={12}>
          <DataTable
            columns={['Nom', 'Namespace', 'Répliques prêtes', 'Image', 'Actions']}
            rows={deployments.data?.items}
            emptyTitle="Aucun deployment"
            renderRow={(d) => {
              const key = `${d.namespace}/${d.name}`;
              return (
                <tr key={key}>
                  <td className="k8s-cell-name">{d.name}</td>
                  <td className="mono muted">{d.namespace}</td>
                  <td className="mono">{d.ready}/{d.replicas}</td>
                  <td className="mono faint k8s-cell-image">{d.image}</td>
                  <td>
                    {scaling === key ? (
                      <div className="k8s-scale-form">
                        <input
                          className="input k8s-scale-input" type="number" min={0} max={100} autoFocus
                          value={scaleValue} onChange={(e) => setScaleValue(e.target.value)}
                        />
                        <span className="btn k8s-scale-btn" onClick={() => scale(d.namespace, d.name)}>OK</span>
                        <span className="btn-outline k8s-scale-btn" onClick={() => setScaling(null)}>Annuler</span>
                      </div>
                    ) : (
                      <div className="k8s-row-actions">
                        <span className="btn-outline k8s-action-btn" onClick={() => askRestart(d.namespace, d.name, d.replicas)}><Icon name="refresh" size={11} />Redémarrer</span>
                        <span className="btn-outline k8s-action-btn" onClick={() => { setScaling(key); setScaleValue(String(d.replicas)); }}>Scale</span>
                        <span className="btn-outline k8s-action-btn" onClick={() => askRollback(d.namespace, d.name)}>Rollback</span>
                        <span className="btn-outline k8s-action-btn k8s-action-btn-danger" onClick={() => askPurge(d.namespace, d.name, d.replicas)}>Purger</span>
                        <span className="btn-outline k8s-action-btn" onClick={() => setDiagnosing({ namespace: d.namespace, name: d.name })}>
                          <Icon name="gauge" size={11} />Diagnostiquer
                        </span>
                        <span className="btn-outline k8s-action-btn" title="Command Center" onClick={() => openPalette({ type: 'deployment', namespace: d.namespace, name: d.name })}>
                          <Icon name="more" size={13} />
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            }}
          />
        </Panel>

        <Panel title="Pods" sub="État en temps réel — cliquez sur un pod pour voir ses logs" span={12}>
          <DataTable
            columns={['Nom', 'Namespace', 'Phase', 'Redémarrages', 'Nœud', '']}
            rows={pods.data?.items}
            emptyTitle="Aucun pod"
            renderRow={(p) => (
              <tr key={`${p.namespace}/${p.name}`}>
                <td className="k8s-cell-name">{p.name}</td>
                <td className="mono muted">{p.namespace}</td>
                <td><span className={`badge badge-${p.phase === 'Running' ? 'ok' : p.phase === 'Pending' ? 'warn' : 'crit'}`}><span className="dot" />{p.phase}</span></td>
                <td className="mono">{p.restarts}</td>
                <td className="mono faint">{p.node}</td>
                <td>
                  <div className="k8s-row-actions-end">
                    <span className="btn-outline k8s-action-btn" onClick={() => setLogsPod(p)}>Logs</span>
                    <span className="btn-outline k8s-action-btn k8s-action-btn-danger" onClick={() => askDeletePod(p.namespace, p.name)}>Supprimer</span>
                    <span className="btn-outline k8s-action-btn" title="Command Center" onClick={() => openPalette({ type: 'pod', namespace: p.namespace, name: p.name })}>
                      <Icon name="more" size={13} />
                    </span>
                  </div>
                </td>
              </tr>
            )}
          />
        </Panel>
      </div>

      {logsPod && <PodLogsDialog pod={logsPod} onClose={() => setLogsPod(null)} />}
      {detailPod && <PodDetailDialog pod={detailPod.pod} initialTab={detailPod.tab} onClose={() => setDetailPod(null)} />}
      {diagnosing && <DiagnosticsModal namespace={diagnosing.namespace} name={diagnosing.name} onClose={() => setDiagnosing(null)} />}

      {pending && (
        <ActionConfirmModal
          title={pending.title}
          sub={pending.sub}
          tone={pending.tone}
          impact={pending.impact}
          confirmLabel={pending.confirmLabel}
          requireTypedConfirmation={pending.requireTypedConfirmation}
          onClose={() => setPending(null)}
          onConfirm={pending.run}
        />
      )}
    </>
  );
}
