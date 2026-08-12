import { useEffect, useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { api } from '../../lib/apiClient.js';

export default function PodLogsDialog({ pod, onClose }) {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/kubernetes/pods/${pod.namespace}/${pod.name}/logs?tail=300`);
      setLogs(res.logs);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 860, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border-soft)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{pod.name}</div>
            <div className="faint" style={{ fontSize: 11 }}>{pod.namespace} · 300 dernières lignes</div>
          </div>
          <span className="btn-outline" style={{ height: 28, padding: '0 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }} onClick={load}>
            <Icon name="refresh" size={12} className={loading ? 'spin' : ''} />Rafraîchir
          </span>
          <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--text-faint)', padding: 4 }}><Icon name="x" size={16} /></span>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {loading && !logs && <div className="faint" style={{ fontSize: 12.5 }}>Chargement…</div>}
          {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)' }}>{error}</div>}
          {logs && (
            <pre className="mono" style={{ fontSize: 11.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, color: 'var(--text-muted)' }}>
              {logs || '(aucun log)'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
