export default function PageHeader({ title, sub, actions }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
      <div style={{ minWidth: 220, flex: '1 1 320px' }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-.022em' }}>{title}</h1>
        {sub && <p style={{ margin: '5px 0 0', fontSize: 13.5, color: 'var(--text-muted)', maxWidth: '70ch' }}>{sub}</p>}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}
