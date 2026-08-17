import { diffLines } from '../../lib/textDiff.js';
import './DiffView.css';

const ROW_CLASS = { same: 'diffview-row-same', add: 'diffview-row-add', del: 'diffview-row-del' };
const PREFIX = { same: '  ', add: '+ ', del: '- ' };

// Diff unifié (+/-) entre deux textes, ligne à ligne. `contextOnly` masque
// les lignes identiques au-delà de `context` lignes autour d'un changement,
// pour ne pas noyer un petit changement dans un manifest de 200 lignes.
export default function DiffView({ oldText, newText, context = 2 }) {
  const rows = diffLines(oldText, newText);
  const visible = context === null ? rows.map((r, i) => ({ ...r, idx: i })) : filterContext(rows, context);

  if (rows.every((r) => r.type === 'same')) {
    return <div className="faint diffview-empty">Aucune différence</div>;
  }

  return (
    <pre className="mono diffview-pre">
      {visible.map((r, i) => (
        r.gap ? (
          <div key={`gap-${i}`} className="faint diffview-gap">⋯</div>
        ) : (
          <div key={i} className={`diffview-row ${ROW_CLASS[r.type]}`}>
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
