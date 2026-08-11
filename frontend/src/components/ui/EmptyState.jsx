export default function EmptyState({ title, hint, action }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5, color: 'var(--text-faint)', maxWidth: '46ch' }}>{hint}</div>}
      {action}
    </div>
  );
}
