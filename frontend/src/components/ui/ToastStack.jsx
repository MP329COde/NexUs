import Icon from './Icon.jsx';
import './ToastStack.css';

const TONE_ICON = { ok: 'check', warn: 'alertTriangle', crit: 'xCircle', info: 'info' };

export default function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="card toast-item"
          style={{ borderLeft: `3px solid var(--tone-${t.type}-dot)` }}
        >
          <span className="toast-icon" style={{ color: `var(--tone-${t.type}-fg)` }}>
            <Icon name={TONE_ICON[t.type] || 'info'} size={17} />
          </span>
          <div className="toast-body">
            {t.title && <div className="toast-title">{t.title}</div>}
            <div className="toast-message">{t.message}</div>
          </div>
          <span onClick={() => onDismiss(t.id)} className="toast-close">
            <Icon name="x" size={14} />
          </span>
        </div>
      ))}
    </div>
  );
}
