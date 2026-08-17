import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import DemoNote from '../../components/ui/DemoNote.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import PodLogsDialog from '../Kubernetes/PodLogsDialog.jsx';
import './ContainersPage.css';

const PHASE_TONE = { Running: 'ok', Succeeded: 'ok', Pending: 'warn', Failed: 'crit', Unknown: 'mut' };

// Deux sources réelles distinctes : Kubernetes (pods, via l'intégration déjà
// configurée) et Docker (aucune intégration dans la console aujourd'hui —
// affiché honnêtement "Non configuré", pas de conteneur inventé).
export default function ContainersPage() {
  const [tab, setTab] = useState('k8s');
  const pods = useApi(() => api.get('/kubernetes/pods'), []);
  const [logsFor, setLogsFor] = useState(null);

  const items = pods.data?.items || [];
  const running = items.filter((p) => p.phase === 'Running').length;

  return (
    <>
      <PageHeader title="Conteneurs" sub="Conteneurs en exécution sur Kubernetes et sur les hôtes Docker déclarés." />

      <div className="cnp-tabs">
        {[{ id: 'k8s', label: 'Kubernetes', icon: 'k8s' }, { id: 'docker', label: 'Docker', icon: 'cube' }].map((t) => (
          <div
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`cnp-tab${tab === t.id ? ' cnp-tab-active' : ''}`}
          >
            <Icon name={t.icon} size={13} />{t.label}
          </div>
        ))}
      </div>

      {tab === 'k8s' ? (
        <>
          <div className="cnp-kpi-grid">
            <KpiCard label="Pods actifs" value={running} unit={`/ ${items.length}`} tint="#3B82F6" />
            <KpiCard label="Redémarrages cumulés" value={items.reduce((s, p) => s + (p.restarts || 0), 0)} tint="#F59E0B" />
          </div>
          <Panel title="Pods" sub="Cliquez sur un pod pour voir ses logs" span={12}>
            {items.length === 0 ? (
              <div className="cnp-empty">Non configuré — nécessite l'intégration Kubernetes</div>
            ) : (
              <div className="cnp-table-wrap">
                <table className="cnp-table">
                  <thead>
                    <tr>
                      {['Pod', 'Namespace', 'Nœud', 'État', 'Redémarrages', ''].map((c) => (
                        <th key={c} className="cnp-th">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <tr key={`${p.namespace}/${p.name}`} className="cnp-row">
                        <td className="cnp-td-name mono">{p.name}</td>
                        <td className="cnp-td mono muted">{p.namespace}</td>
                        <td className="cnp-td mono muted">{p.node || '—'}</td>
                        <td className="cnp-td"><span className={`badge badge-${PHASE_TONE[p.phase] || 'mut'}`}><span className="dot" />{p.phase}</span></td>
                        <td className="cnp-td mono">{p.restarts}</td>
                        <td className="cnp-td">
                          <span className="btn-outline cnp-logs-btn" onClick={() => setLogsFor(p)}>
                            <Icon name="externalLink" size={12} />Logs
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : (
        <>
          <DemoNote>Aucune intégration Docker n'existe dans la console — aucun hôte Docker déclaré, aucun conteneur ne peut être listé ici.</DemoNote>
          <div className="card cnp-docker-empty">Non configuré</div>
        </>
      )}

      {logsFor && <PodLogsDialog pod={logsFor} onClose={() => setLogsFor(null)} />}
    </>
  );
}
