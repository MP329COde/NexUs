export default function Panel({ title, sub, actions, children, span }) {
  return (
    <section className="card" style={{ gridColumn: span ? `span ${span}` : undefined, overflow: 'hidden', animation: 'riseIn .3s ease both' }}>
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border-soft)' }}>
          <div style={{ minWidth: 0 }}>
            {title && <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div>}
            {sub && <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 1 }}>{sub}</div>}
          </div>
          <div style={{ flex: 1 }} />
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
