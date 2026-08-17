import { useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './RestoreBackupDialog.css';

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
    <div className="restore-overlay" onClick={onClose}>
      <form className="card restore-card" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="restore-header">
          <span className="restore-header-icon"><Icon name="alertTriangle" size={18} /></span>
          <div className="restore-title">Restaurer une sauvegarde</div>
        </div>
        <p className="faint restore-intro">
          Cette action remplace <strong>toutes les données actuelles</strong> (utilisateurs, intégrations, proxies, hôtes...) par le contenu de :
        </p>
        <code className="mono restore-file">{file}</code>
        <p className="faint restore-note">
          Une sauvegarde de sécurité de l'état actuel sera créée automatiquement avant.
        </p>

        <label className="restore-field-label">Confirmez avec votre mot de passe</label>
        <input className="input" type="password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />

        {error && <div className="restore-error">{error}</div>}

        <div className="restore-actions">
          <span className="btn-outline" onClick={onClose}>Annuler</span>
          <button className="btn restore-submit-btn" type="submit" disabled={busy || !password}>
            {busy ? 'Restauration…' : 'Restaurer maintenant'}
          </button>
        </div>
      </form>
    </div>
  );
}
