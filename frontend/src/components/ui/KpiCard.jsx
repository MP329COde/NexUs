import './KpiCard.css';

export default function KpiCard({ label, value, unit, delta, deltaTone = 'mut', note, tint = '#3B82F6' }) {
  return (
    <div className="card kpi-card">
      <div className="kpi-card-label-row">
        <span className="kpi-card-dot" style={{ background: tint }} />
        <span className="kpi-card-label">{label}</span>
      </div>
      <div className="kpi-card-value-row">
        <span className="kpi-card-value">{value}</span>
        {unit && <span className="kpi-card-unit">{unit}</span>}
      </div>
      {(delta || note) && (
        <div className="kpi-card-meta-row">
          {delta && <span className="mono kpi-card-delta" style={{ color: `var(--tone-${deltaTone}-fg)` }}>{delta}</span>}
          {note && <span className="kpi-card-note">{note}</span>}
        </div>
      )}
    </div>
  );
}
