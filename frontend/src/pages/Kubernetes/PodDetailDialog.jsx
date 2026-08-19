import { useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import LoadingState from '../../components/ui/LoadingState.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import './PodDetailDialog.css';

const TABS = [
  { id: 'describe', label: 'Décrire', icon: 'terminal' },
  { id: 'events', label: 'Événements', icon: 'event' },
  { id: 'metrics', label: 'Métriques', icon: 'gauge' }
];

// Regroupe describe/events/metrics dans une seule popup : trois vues sur le
// même pod, réel (API Kubernetes standard) sauf les métriques qui dépendent
// de metrics-server — absentes proprement plutôt que simulées s'il n'est pas
// installé sur le cluster.
export default function PodDetailDialog({ pod, initialTab = 'describe', onClose }) {
  const [tab, setTab] = useState(initialTab);

  return (
    <Modal title={pod.name} sub={`${pod.namespace} · détail du pod`} onClose={onClose} width={640}>
      <Tabs tabs={TABS} active={tab} onChange={setTab} className="pdd-tabs" />
      {tab === 'describe' && <DescribeTab pod={pod} />}
      {tab === 'events' && <EventsTab pod={pod} />}
      {tab === 'metrics' && <MetricsTab pod={pod} />}
    </Modal>
  );
}

function DescribeTab({ pod }) {
  const { data, loading, error } = useApi(() => api.get(`/kubernetes/pods/${pod.namespace}/${pod.name}/describe`), [pod.namespace, pod.name]);
  if (loading) return <LoadingState className="pdd-loading" />;
  if (error) return <div className="pdd-error">{error.message}</div>;
  const p = data?.pod;
  if (!p) return null;
  return (
    <div className="pdd-describe">
      <Row label="Nœud" value={p.node} />
      <Row label="IP du pod" value={p.podIP} />
      <Row label="Phase" value={p.phase} />
      <Row label="Démarré" value={p.startedAt ? new Date(p.startedAt).toLocaleString('fr-FR') : '—'} />
      <div>
        <div className="pdd-section-title">Conteneurs</div>
        {p.containers.map((c) => (
          <div key={c.name} className="pdd-container-card">
            <div className="mono pdd-container-name">{c.name}</div>
            <div className="mono faint pdd-container-image">{c.image}</div>
            <div className="pdd-container-meta">
              <span className={`badge badge-${c.ready ? 'ok' : 'crit'}`}><span className="dot" />{c.ready ? 'Prêt' : 'Non prêt'}</span>
              <span className="faint">redémarrages : {c.restartCount}</span>
              {c.state && <span className="faint">état : {c.state}</span>}
            </div>
          </div>
        ))}
      </div>
      {p.conditions.length > 0 && (
        <div>
          <div className="pdd-section-title">Conditions</div>
          {p.conditions.map((c, i) => (
            <div key={i} className="pdd-condition-row">
              <span className={`badge badge-${c.status === 'True' ? 'ok' : 'mut'} pdd-condition-badge`}>{c.type}</span>
              <span className="faint">{c.message || c.reason || '—'}</span>
            </div>
          ))}
        </div>
      )}
      {Object.keys(p.labels).length > 0 && (
        <div>
          <div className="pdd-section-title">Labels</div>
          <div className="mono faint pdd-labels">{Object.entries(p.labels).map(([k, v]) => `${k}=${v}`).join('  ')}</div>
        </div>
      )}
    </div>
  );
}

function EventsTab({ pod }) {
  const { data, loading, error } = useApi(() => api.get(`/kubernetes/events?namespace=${pod.namespace}&involvedObject=${pod.name}`), [pod.namespace, pod.name]);
  if (loading) return <LoadingState className="pdd-loading" />;
  if (error) return <div className="pdd-error">{error.message}</div>;
  const items = data?.items || [];
  if (items.length === 0) return <div className="faint pdd-empty-events">Aucun événement récent pour ce pod</div>;
  return (
    <div className="pdd-events-list">
      {items.map((e, i) => (
        <div key={i} className="pdd-event-row">
          <span className={`badge badge-${e.type === 'Warning' ? 'warn' : 'mut'} pdd-event-badge`}>{e.reason}</span>
          <div className="pdd-event-body">
            <div className="pdd-event-message">{e.message}</div>
            <div className="faint mono pdd-event-time">{e.count > 1 ? `×${e.count} · ` : ''}{e.lastTimestamp ? new Date(e.lastTimestamp).toLocaleString('fr-FR') : '—'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricsTab({ pod }) {
  const { data, loading, error } = useApi(() => api.get(`/kubernetes/pods/${pod.namespace}/${pod.name}/metrics`), [pod.namespace, pod.name]);
  if (loading) return <LoadingState className="pdd-loading" />;
  if (error) {
    return (
      <div className="faint pdd-metrics-error">
        Métriques non disponibles — metrics-server n'est probablement pas installé sur ce cluster.
        <div className="mono pdd-metrics-error-detail">{error.message}</div>
      </div>
    );
  }
  const containers = data?.metrics?.containers || [];
  return (
    <div className="pdd-metrics-list">
      {containers.map((c) => (
        <div key={c.name} className="pdd-metrics-row">
          <span className="mono pdd-metrics-name">{c.name}</span>
          <span className="mono faint pdd-metrics-value">CPU {c.cpu || '—'}</span>
          <span className="mono faint pdd-metrics-value">Mémoire {c.memory || '—'}</span>
        </div>
      ))}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="pdd-row">
      <span className="faint pdd-row-label">{label}</span>
      <span className="mono">{value || '—'}</span>
    </div>
  );
}
