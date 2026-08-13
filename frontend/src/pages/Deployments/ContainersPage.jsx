import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import DemoNote from '../../components/ui/DemoNote.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import PodLogsDialog from '../Kubernetes/PodLogsDialog.jsx';

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

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--border-soft)' }}>
        {[{ id: 'k8s', label: 'Kubernetes', icon: 'k8s' }, { id: 'docker', label: 'Docker', icon: 'cube' }].map((t) => (
          <div
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', fontSize: 13, fontWeight: tab === t.id ? 600 : 500, color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent', cursor: 'pointer' }}
          >
            <Icon name={t.icon} size={13} />{t.label}
          </div>
        ))}
      </div>

      {tab === 'k8s' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 16 }}>
            <KpiCard label="Pods actifs" value={running} unit={`/ ${items.length}`} tint="#3B82F6" />
            <KpiCard label="Redémarrages cumulés" value={items.reduce((s, p) => s + (p.restarts || 0), 0)} tint="#F59E0B" />
          </div>
          <Panel title="Pods" sub="Cliquez sur un pod pour voir ses logs" span={12}>
            {items.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Non configuré — nécessite l'intégration Kubernetes</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      {['Pod', 'Namespace', 'Nœud', 'État', 'Redémarrages', ''].map((c) => (
                        <th key={c} style={{ textAlign: 'left', padding: '8px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-soft)' }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <tr key={`${p.namespace}/${p.name}`} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                        <td style={{ padding: '9px 16px', fontWeight: 600 }} className="mono">{p.name}</td>
                        <td style={{ padding: '9px 16px' }} className="mono muted">{p.namespace}</td>
                        <td style={{ padding: '9px 16px' }} className="mono muted">{p.node || '—'}</td>
                        <td style={{ padding: '9px 16px' }}><span className={`badge badge-${PHASE_TONE[p.phase] || 'mut'}`}><span className="dot" />{p.phase}</span></td>
                        <td style={{ padding: '9px 16px' }} className="mono">{p.restarts}</td>
                        <td style={{ padding: '9px 16px' }}>
                          <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => setLogsFor(p)}>
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
          <div className="card" style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Non configuré</div>
        </>
      )}

      {logsFor && <PodLogsDialog pod={logsFor} onClose={() => setLogsFor(null)} />}
    </>
  );
}
