import { useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

// Commentaires + lien Task → Code (branche/PR) sur une tâche. Les
// commentaires notifient les mentions @nom-utilisateur et l'assigné (voir
// POST /projects/:id/tasks/:taskId/comments) ; le lien Task → Code est
// enregistré manuellement (todo.md items 25/48/50 — aucune détection
// automatique de branche sans forge configurée) via le même PUT que le
// changement de statut.
export default function TaskCommentsModal({ projectId, task, userName, onClose, onTaskUpdated }) {
  const comments = useApi(() => api.get(`/projects/${projectId}/tasks/${task.id}/comments`), [projectId, task.id]);
  const notify = useNotify();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [branch, setBranch] = useState(task.branch || '');
  const [prUrl, setPrUrl] = useState(task.prUrl || '');
  const [linkBusy, setLinkBusy] = useState(false);
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

  async function saveLink(e) {
    e.preventDefault();
    setLinkBusy(true);
    try {
      const updated = await api.put(`/projects/${projectId}/tasks/${task.id}`, { branch, prUrl });
      notify('Lien code enregistré', { type: 'ok' });
      onTaskUpdated?.(updated.task);
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <Modal title={`${task.title}`} onClose={onClose} width={480}>
      <div className="pd-list-loose">
        <form onSubmit={saveLink} className="pd-list-loose" style={{ paddingBottom: 10, borderBottom: '1px solid var(--border-soft)' }}>
          <div className="faint">Task → Code</div>
          <input className="input mono" placeholder="branche (ex. feature/ma-tache)" value={branch} onChange={(e) => setBranch(e.target.value)} />
          <input className="input" placeholder="URL de la pull request" value={prUrl} onChange={(e) => setPrUrl(e.target.value)} />
          <div className="pd-form-row">
            <button className="btn" type="submit" disabled={linkBusy}>Enregistrer le lien</button>
            {prUrl && <a href={prUrl} target="_blank" rel="noreferrer" className="btn-outline">Ouvrir la PR</a>}
          </div>
        </form>

        <div className="faint">Commentaires</div>
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
