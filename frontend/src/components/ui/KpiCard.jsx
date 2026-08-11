export default function KpiCard({ label, value, unit, delta, deltaTone = 'mut', note, tint = '#3B82F6' }) {
  return (
    <div className="card" style={{ padding: '15px 16px', animation: 'riseIn .3s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: tint }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 9 }}>
        <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-.028em', lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 12.5, color: 'var(--text-faint)', fontWeight: 500 }}>{unit}</span>}
      </div>
      {(delta || note) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9 }}>
          {delta && <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: `var(--tone-${deltaTone}-fg)` }}>{delta}</span>}
          {note && <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{note}</span>}
        </div>
      )}
    </div>
  );
}
