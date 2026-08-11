import Icon from './Icon.jsx';

const TONE_ICON = { ok: 'check', warn: 'alertTriangle', crit: 'xCircle', info: 'info' };

export default function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{ position: 'fixed', bottom: 18, right: 18, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 200, width: 340, maxWidth: 'calc(100vw - 36px)' }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className="card"
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 12px', animation: 'slideInRight .25s cubic-bezier(.16,1,.3,1) both', borderLeft: `3px solid var(--tone-${t.type}-dot)` }}
        >
          <span style={{ color: `var(--tone-${t.type}-fg)`, flex: 'none', marginTop: 1 }}>
            <Icon name={TONE_ICON[t.type] || 'info'} size={17} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {t.title && <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>{t.title}</div>}
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.4, wordBreak: 'break-word' }}>{t.message}</div>
          </div>
          <span onClick={() => onDismiss(t.id)} style={{ cursor: 'pointer', color: 'var(--text-faint)', flex: 'none', padding: 2 }}>
            <Icon name="x" size={14} />
          </span>
        </div>
      ))}
    </div>
  );
}
