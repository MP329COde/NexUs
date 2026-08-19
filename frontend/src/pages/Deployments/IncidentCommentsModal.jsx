import { useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

// Commentaires sur un incident (todo.md item 30 : commentaires sur
// "tâches, PR, projets, documents, deployments, incidents") — le backend
// existait déjà entièrement (incidentStore.js, POST .../incidents/:id/
// comments) mais sans aucune interface pour le consulter.
export default function IncidentCommentsModal({ projectId, incident, userName, onClose }) {
  const detail = useApi(() => api.get(`/projects/${projectId}/incidents/${incident.id}`), [projectId, incident.id]);
  const notify = useNotify();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const items = detail.data?.comments || [];

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post(`/projects/${projectId}/incidents/${incident.id}/comments`, { body: text });
      setText('');
      detail.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Incident — ${incident.title}`} onClose={onClose} width={480}>
      <div className="pd-list-loose">
        {items.length === 0 ? (
          <div className="pd-empty">Aucun commentaire.</div>
        ) : (
          items.map((c) => (
            <div key={c.id} className="pd-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <div className="faint">{userName(c.author_id)} — {new Date(c.created_at).toLocaleString('fr-FR')}</div>
              <div>{c.body}</div>
            </div>
          ))
        )}
        <form onSubmit={submit} className="pd-form-row">
          <input className="input pd-form-input" placeholder="Écrire un commentaire…" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn" type="submit" disabled={busy}>Envoyer</button>
        </form>
      </div>
    </Modal>
  );
}
