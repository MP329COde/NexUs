import { useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

export default function RestoreBackupDialog({ file, onClose, onRestored }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const notify = useNotify();

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/backups/${file}/restore`, { password });
      notify(`Base restaurée depuis ${res.restoredFrom}`, { type: 'ok', title: 'Restauration réussie' });
      onRestored();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <form className="card" style={{ width: 420, padding: 22 }} onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ color: 'var(--tone-crit-fg)' }}><Icon name="alertTriangle" size={18} /></span>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Restaurer une sauvegarde</div>
        </div>
        <p className="faint" style={{ fontSize: 12.5, marginBottom: 4 }}>
          Cette action remplace <strong>toutes les données actuelles</strong> (utilisateurs, intégrations, proxies, hôtes...) par le contenu de :
        </p>
        <code className="mono" style={{ display: 'block', fontSize: 11.5, background: 'var(--border-soft)', padding: '6px 10px', borderRadius: 6, marginBottom: 14, wordBreak: 'break-all' }}>{file}</code>
        <p className="faint" style={{ fontSize: 11.5, marginBottom: 14 }}>
          Une sauvegarde de sécurité de l'état actuel sera créée automatiquement avant.
        </p>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 5, color: 'var(--text-muted)' }}>Confirmez avec votre mot de passe</label>
        <input className="input" type="password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />

        {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)', margin: '10px 0 0' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <span className="btn-outline" onClick={onClose}>Annuler</span>
          <button className="btn" type="submit" disabled={busy || !password} style={{ background: 'var(--tone-crit-dot)' }}>
            {busy ? 'Restauration…' : 'Restaurer maintenant'}
          </button>
        </div>
      </form>
    </div>
  );
}
