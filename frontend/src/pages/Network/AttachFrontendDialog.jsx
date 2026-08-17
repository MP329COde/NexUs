import { useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './AttachFrontendDialog.css';

export default function AttachFrontendDialog({ proxy, onClose }) {
  const { data } = useApi(() => api.get('/haproxy/frontends'), []);
  const [frontendName, setFrontendName] = useState('');
  const [busy, setBusy] = useState(false);
  const notify = useNotify();

  async function attach(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post(`/proxies/${proxy.id}/attach-frontend`, { frontendName });
      notify(res.message, { type: 'ok', title: 'Rattachement effectué' });
      onClose();
    } catch (err) {
      notify(err.message, { type: 'crit', title: 'Échec du rattachement' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="afd-overlay" onClick={onClose}>
      <form className="card afd-card" onClick={(e) => e.stopPropagation()} onSubmit={attach}>
        <div className="afd-title-row">
          <Icon name="gitBranch" size={18} className="afd-title-icon" />
          <div className="afd-title">Attacher à un frontend HAProxy</div>
        </div>
        <p className="faint afd-desc">
          Crée une ACL <code className="mono">Host: {proxy.domain}</code> sur le frontend choisi et une règle de commutation vers le backend <code className="mono">nexus_{proxy.id}</code>. Complète le rattachement laissé manuel après « Appliquer ».
        </p>

        <label className="afd-field-label">Frontend HAProxy</label>
        <select className="input afd-select" required value={frontendName} onChange={(e) => setFrontendName(e.target.value)}>
          <option value="" disabled>Sélectionner…</option>
          {data?.items.map((f) => <option key={f.name} value={f.name}>{f.name} ({f.mode})</option>)}
        </select>

        <div className="afd-actions">
          <span className="btn-outline" onClick={onClose}>Annuler</span>
          <button className="btn" type="submit" disabled={busy || !frontendName}>{busy ? 'Rattachement…' : 'Rattacher'}</button>
        </div>
      </form>
    </div>
  );
}
