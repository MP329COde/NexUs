// Donut SVG léger et sans dépendance (même technique que WorkloadDonutPanel
// de la page d'accueil), réutilisé pour les répartitions par statut.
export default function MiniDonut({ segments, size = 116, centerLabel, centerSub }) {
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0);
  const r = (size - 14) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const arcs = total > 0 ? segments.filter((s) => s.value > 0).map((seg) => {
    const dash = (seg.value / total) * circumference;
    const arc = { ...seg, dash, gap: circumference - dash, offset };
    offset += dash;
    return arc;
  }) : [];

  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        {arcs.length === 0 ? (
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border-soft)" strokeWidth={14} />
        ) : arcs.map((a) => (
          <circle key={a.label} cx={c} cy={c} r={r} fill="none" stroke={a.color} strokeWidth={14} strokeDasharray={`${a.dash} ${a.gap}`} strokeDashoffset={-a.offset} />
        ))}
      </svg>
      {(centerLabel !== undefined) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span className="mono" style={{ fontSize: 20, fontWeight: 700 }}>{centerLabel}</span>
          {centerSub && <span style={{ fontSize: 9.5, color: 'var(--text-faint)' }}>{centerSub}</span>}
        </div>
      )}
    </div>
  );
}
