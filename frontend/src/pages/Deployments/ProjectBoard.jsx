import { useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import './ProjectBoard.css';

const COLUMNS = [
  { status: 'todo', label: 'Backlog' },
  { status: 'in_progress', label: 'En cours' },
  { status: 'review', label: 'En revue' },
  { status: 'done', label: 'Terminé' }
];

// Vue tableau (drag & drop natif HTML5, aucune dépendance) du backlog déjà
// existant — même donnée, même mutation (PUT .../tasks/:taskId status) que
// la vue liste, juste une présentation en colonnes. Déplacer une carte
// entre colonnes appelle exactement le même setTaskStatus que le
// <select> de la vue liste.
export default function ProjectBoard({ tasks, userName, onStatusChange, onOpenComments }) {
  const [dragId, setDragId] = useState(null);
  const [overStatus, setOverStatus] = useState(null);

  function onDrop(status) {
    if (dragId) onStatusChange(dragId, status);
    setDragId(null);
    setOverStatus(null);
  }

  return (
    <div className="board-columns">
      {COLUMNS.map((col) => (
        <div
          key={col.status}
          className={`board-column${overStatus === col.status ? ' board-column-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOverStatus(col.status); }}
          onDragLeave={() => setOverStatus((s) => (s === col.status ? null : s))}
          onDrop={(e) => { e.preventDefault(); onDrop(col.status); }}
        >
          <div className="board-column-head">
            <span>{col.label}</span>
            <span className="faint mono">{tasks.filter((t) => t.status === col.status).length}</span>
          </div>
          <div className="board-column-body">
            {tasks.filter((t) => t.status === col.status).map((t) => (
              <div
                key={t.id}
                className="board-card"
                draggable
                onDragStart={() => setDragId(t.id)}
                onDragEnd={() => setDragId(null)}
              >
                <div className="board-card-title">{t.title}</div>
                <div className="board-card-foot">
                  {t.assigneeId ? <span className="badge badge-vio">{userName(t.assigneeId)}</span> : <span className="faint">Non assignée</span>}
                  <span className="board-card-comments" onClick={() => onOpenComments(t)} title="Commentaires">
                    <Icon name="edit" size={12} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
