import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

// Commentaires génériques (entity_comments, migration 0041, todo.md ligne
// ~118) : même pattern que TaskCommentsModal.jsx (mentions
// @nom-utilisateur, notifiées côté backend via extractMentionedUserIds/
// notifyUser), mais en panneau plutôt qu'en modale et branché sur n'importe
// quelle ressource dotée d'une route `GET`/`POST /.../comments` — `endpoint`
// pointe vers cette route. `userName` résout un id utilisateur en nom
// affichable (même fonction que le reste de la fiche projet).
export default function EntityCommentsPanel({ endpoint, userName, span = 12 }) {
  const comments = useApi(() => api.get(endpoint), [endpoint]);
  const notify = useNotify();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const items = comments.data?.items || [];

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.post(endpoint, { body });
      setBody('');
      comments.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Commentaires" span={span}>
      {items.length === 0 ? (
        <div className="pd-empty">Aucun commentaire.</div>
      ) : (
        <div className="pd-list-loose">
          {items.map((c) => (
            <div key={c.id} className="pd-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <div className="faint">{userName(c.author_id)} — {new Date(c.created_at).toLocaleString('fr-FR')}</div>
              <div>{c.body}</div>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="pd-form-row">
        <input
          className="input pd-form-input"
          placeholder="Écrire un commentaire… (@nom-utilisateur pour mentionner)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button className="btn" type="submit" disabled={busy}>Envoyer</button>
      </form>
    </Panel>
  );
}
