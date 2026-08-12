import { useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <form className="card" style={{ width: 420, padding: 22 }} onClick={(e) => e.stopPropagation()} onSubmit={attach}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Icon name="gitBranch" size={18} style={{ color: 'var(--primary)' }} />
          <div style={{ fontSize: 15, fontWeight: 600 }}>Attacher à un frontend HAProxy</div>
        </div>
        <p className="faint" style={{ fontSize: 12.5, marginBottom: 14 }}>
          Crée une ACL <code className="mono">Host: {proxy.domain}</code> sur le frontend choisi et une règle de commutation vers le backend <code className="mono">nexus_{proxy.id}</code>. Complète le rattachement laissé manuel après « Appliquer ».
        </p>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Frontend HAProxy</label>
        <select className="input" required value={frontendName} onChange={(e) => setFrontendName(e.target.value)} style={{ marginBottom: 18 }}>
          <option value="" disabled>Sélectionner…</option>
          {data?.items.map((f) => <option key={f.name} value={f.name}>{f.name} ({f.mode})</option>)}
        </select>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <span className="btn-outline" onClick={onClose}>Annuler</span>
          <button className="btn" type="submit" disabled={busy || !frontendName}>{busy ? 'Rattachement…' : 'Rattacher'}</button>
        </div>
      </form>
    </div>
  );
}
