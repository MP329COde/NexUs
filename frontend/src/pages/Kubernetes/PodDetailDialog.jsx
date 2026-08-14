import { useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

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
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, borderBottom: '1px solid var(--border-soft)' }}>
        {TABS.map((t) => (
          <div
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 4px', marginRight: 14, fontSize: 12.5, fontWeight: tab === t.id ? 600 : 500, color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent', cursor: 'pointer' }}
          >
            <Icon name={t.icon} size={13} />{t.label}
          </div>
        ))}
      </div>
      {tab === 'describe' && <DescribeTab pod={pod} />}
      {tab === 'events' && <EventsTab pod={pod} />}
      {tab === 'metrics' && <MetricsTab pod={pod} />}
    </Modal>
  );
}

function DescribeTab({ pod }) {
  const { data, loading, error } = useApi(() => api.get(`/kubernetes/pods/${pod.namespace}/${pod.name}/describe`), [pod.namespace, pod.name]);
  if (loading) return <div className="faint" style={{ fontSize: 12.5 }}>Chargement…</div>;
  if (error) return <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)' }}>{error}</div>;
  const p = data?.pod;
  if (!p) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 12.5 }}>
      <Row label="Nœud" value={p.node} />
      <Row label="IP du pod" value={p.podIP} />
      <Row label="Phase" value={p.phase} />
      <Row label="Démarré" value={p.startedAt ? new Date(p.startedAt).toLocaleString('fr-FR') : '—'} />
      <div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Conteneurs</div>
        {p.containers.map((c) => (
          <div key={c.name} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-soft)', marginBottom: 6 }}>
            <div className="mono" style={{ fontWeight: 600 }}>{c.name}</div>
            <div className="mono faint" style={{ fontSize: 11 }}>{c.image}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11 }}>
              <span className={`badge badge-${c.ready ? 'ok' : 'crit'}`}><span className="dot" />{c.ready ? 'Prêt' : 'Non prêt'}</span>
              <span className="faint">redémarrages : {c.restartCount}</span>
              {c.state && <span className="faint">état : {c.state}</span>}
            </div>
          </div>
        ))}
      </div>
      {p.conditions.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Conditions</div>
          {p.conditions.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11.5, marginBottom: 3 }}>
              <span className={`badge badge-${c.status === 'True' ? 'ok' : 'mut'}`} style={{ flex: 'none' }}>{c.type}</span>
              <span className="faint">{c.message || c.reason || '—'}</span>
            </div>
          ))}
        </div>
      )}
      {Object.keys(p.labels).length > 0 && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Labels</div>
          <div className="mono faint" style={{ fontSize: 11 }}>{Object.entries(p.labels).map(([k, v]) => `${k}=${v}`).join('  ')}</div>
        </div>
      )}
    </div>
  );
}

function EventsTab({ pod }) {
  const { data, loading, error } = useApi(() => api.get(`/kubernetes/events?namespace=${pod.namespace}&involvedObject=${pod.name}`), [pod.namespace, pod.name]);
  if (loading) return <div className="faint" style={{ fontSize: 12.5 }}>Chargement…</div>;
  if (error) return <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)' }}>{error}</div>;
  const items = data?.items || [];
  if (items.length === 0) return <div className="faint" style={{ fontSize: 12.5, textAlign: 'center', padding: 20 }}>Aucun événement récent pour ce pod</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((e, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-soft)' }}>
          <span className={`badge badge-${e.type === 'Warning' ? 'warn' : 'mut'}`} style={{ flex: 'none' }}>{e.reason}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12 }}>{e.message}</div>
            <div className="faint mono" style={{ fontSize: 10.5 }}>{e.count > 1 ? `×${e.count} · ` : ''}{e.lastTimestamp ? new Date(e.lastTimestamp).toLocaleString('fr-FR') : '—'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricsTab({ pod }) {
  const { data, loading, error } = useApi(() => api.get(`/kubernetes/pods/${pod.namespace}/${pod.name}/metrics`), [pod.namespace, pod.name]);
  if (loading) return <div className="faint" style={{ fontSize: 12.5 }}>Chargement…</div>;
  if (error) {
    return (
      <div className="faint" style={{ fontSize: 12.5, textAlign: 'center', padding: 20 }}>
        Métriques non disponibles — metrics-server n'est probablement pas installé sur ce cluster.
        <div className="mono" style={{ fontSize: 11, marginTop: 6, color: 'var(--tone-crit-fg)' }}>{error}</div>
      </div>
    );
  }
  const containers = data?.metrics?.containers || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {containers.map((c) => (
        <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-soft)' }}>
          <span className="mono" style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>{c.name}</span>
          <span className="mono faint" style={{ fontSize: 11.5 }}>CPU {c.cpu || '—'}</span>
          <span className="mono faint" style={{ fontSize: 11.5 }}>Mémoire {c.memory || '—'}</span>
        </div>
      ))}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <span className="faint" style={{ width: 90, flex: 'none' }}>{label}</span>
      <span className="mono">{value || '—'}</span>
    </div>
  );
}
