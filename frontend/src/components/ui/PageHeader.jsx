export default function PageHeader({ title, sub, actions }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginBottom: 20 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-.022em' }}>{title}</h1>
        {sub && <p style={{ margin: '5px 0 0', fontSize: 13.5, color: 'var(--text-muted)', maxWidth: '70ch' }}>{sub}</p>}
      </div>
      <div style={{ flex: 1 }} />
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>{actions}</div>}
    </div>
  );
}
