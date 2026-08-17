import './Panel.css';

export default function Panel({ title, sub, actions, children, span, style }) {
  return (
    <section className={`card panel-section${span ? ' panel-span' : ''}`} style={{ gridColumn: span ? `span ${span}` : undefined, ...style }}>
      {(title || actions) && (
        <div className="panel-header">
          <div className="panel-header-text">
            {title && <div className="panel-title">{title}</div>}
            {sub && <div className="panel-sub">{sub}</div>}
          </div>
          <div className="panel-header-spacer" />
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
