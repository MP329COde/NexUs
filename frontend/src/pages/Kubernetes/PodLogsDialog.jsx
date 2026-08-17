import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { api } from '../../lib/apiClient.js';
import './PodLogsDialog.css';

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
    <Modal
      title={pod.name}
      sub={`${pod.namespace} · 300 dernières lignes`}
      onClose={onClose}
      width={860}
      headerActions={(
        <span className="btn-outline pld-refresh-btn" onClick={load}>
          <Icon name="refresh" size={12} className={loading ? 'spin' : ''} />Rafraîchir
        </span>
      )}
    >
      {loading && !logs && <div className="faint pld-loading">Chargement…</div>}
      {error && <div className="pld-error">{error}</div>}
      {logs !== null && (
        <pre className="mono pld-logs">
          {logs || '(aucun log)'}
        </pre>
      )}
    </Modal>
  );
}
