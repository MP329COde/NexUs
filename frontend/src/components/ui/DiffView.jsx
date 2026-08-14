import { diffLines } from '../../lib/textDiff.js';

const ROW_STYLE = {
  same: { color: 'var(--text-muted)' },
  add: { background: 'var(--tone-ok-soft, rgba(16,185,129,.12))', color: 'var(--tone-ok-fg)' },
  del: { background: 'var(--tone-crit-soft, rgba(244,63,94,.12))', color: 'var(--tone-crit-fg)' }
};
const PREFIX = { same: '  ', add: '+ ', del: '- ' };

// Diff unifié (+/-) entre deux textes, ligne à ligne. `contextOnly` masque
// les lignes identiques au-delà de `context` lignes autour d'un changement,
// pour ne pas noyer un petit changement dans un manifest de 200 lignes.
export default function DiffView({ oldText, newText, context = 2 }) {
  const rows = diffLines(oldText, newText);
  const visible = context === null ? rows.map((r, i) => ({ ...r, idx: i })) : filterContext(rows, context);

  if (rows.every((r) => r.type === 'same')) {
    return <div className="faint" style={{ fontSize: 12.5, textAlign: 'center', padding: 16 }}>Aucune différence</div>;
  }

  return (
    <pre className="mono" style={{ margin: 0, fontSize: 12, lineHeight: 1.6, overflowX: 'auto' }}>
      {visible.map((r, i) => (
        r.gap ? (
          <div key={`gap-${i}`} className="faint" style={{ padding: '2px 0' }}>⋯</div>
        ) : (
          <div key={i} style={{ ...ROW_STYLE[r.type], padding: '0 4px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {PREFIX[r.type]}{r.line}
          </div>
        )
      ))}
    </pre>
  );
}

function filterContext(rows, context) {
  const keep = new Set();
  rows.forEach((r, i) => {
    if (r.type !== 'same') {
      for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++) keep.add(k);
    }
  });
  const out = [];
  let lastKept = -2;
  rows.forEach((r, i) => {
    if (!keep.has(i)) return;
    if (i - lastKept > 1) out.push({ gap: true });
    out.push(r);
    lastKept = i;
  });
  return out;
}
