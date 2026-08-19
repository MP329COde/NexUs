import { useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './AttachFrontendDialog.css';

export default function CreateFrontendDialog({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [port, setPort] = useState('');
  const [mode, setMode] = useState('http');
  const [busy, setBusy] = useState(false);
  const notify = useNotify();

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/haproxy/frontends', { name, port, mode });
      notify(res.message, { type: 'ok', title: 'Frontend créé' });
      onCreated();
      onClose();
    } catch (err) {
      notify(err.message, { type: 'crit', title: 'Échec de la création' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="afd-overlay" onClick={onClose}>
      <form className="card afd-card" onClick={(e) => e.stopPropagation()} onSubmit={create}>
        <div className="afd-title-row">
          <Icon name="gitBranch" size={18} className="afd-title-icon" />
          <div className="afd-title">Nouveau frontend HAProxy</div>
        </div>
        <p className="faint afd-desc">
          Crée un frontend en écoute sur le port choisi. Utilisez ensuite « Attacher à un frontend » depuis un proxy pour y router du trafic.
        </p>

        <label className="afd-field-label">Nom</label>
        <input className="input afd-select" required placeholder="fe_web" value={name} onChange={(e) => setName(e.target.value)} />

        <label className="afd-field-label">Port</label>
        <input className="input afd-select" required type="number" placeholder="443" value={port} onChange={(e) => setPort(e.target.value)} />

        <label className="afd-field-label">Mode</label>
        <select className="input afd-select" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="http">HTTP</option>
          <option value="tcp">TCP</option>
        </select>

        <div className="afd-actions">
          <span className="btn-outline" onClick={onClose}>Annuler</span>
          <button className="btn" type="submit" disabled={busy || !name || !port}>{busy ? 'Création…' : 'Créer'}</button>
        </div>
      </form>
    </div>
  );
}
