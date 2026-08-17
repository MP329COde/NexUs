import './EmptyState.css';

export default function EmptyState({ title, hint, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-title">{title}</div>
      {hint && <div className="empty-state-hint">{hint}</div>}
      {action}
    </div>
  );
}
