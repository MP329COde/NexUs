import { useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

// Commentaires sur une tâche, avec mentions @nom-utilisateur — le backend
// (POST /projects/:id/tasks/:taskId/comments) notifie chaque utilisateur
// mentionné et l'assigné de la tâche (voir routes/projects.routes.js).
export default function TaskCommentsModal({ projectId, task, userName, onClose }) {
  const comments = useApi(() => api.get(`/projects/${projectId}/tasks/${task.id}/comments`), [projectId, task.id]);
  const notify = useNotify();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const items = comments.data?.items || [];

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post(`/projects/${projectId}/tasks/${task.id}/comments`, { text });
      setText('');
      comments.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Commentaires — ${task.title}`} onClose={onClose} width={480}>
      <div className="pd-list-loose">
        {items.length === 0 ? (
          <div className="pd-empty">Aucun commentaire.</div>
        ) : (
          items.map((c) => (
            <div key={c.id} className="pd-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <div className="faint">{userName(c.userId)} — {new Date(c.createdAt).toLocaleString('fr-FR')}</div>
              <div>{c.text}</div>
            </div>
          ))
        )}
        <form onSubmit={submit} className="pd-form-row">
          <input
            className="input pd-form-input"
            placeholder="Écrire un commentaire… (@nom-utilisateur pour mentionner)"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn" type="submit" disabled={busy}>Envoyer</button>
        </form>
      </div>
    </Modal>
  );
}
