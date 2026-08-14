// Coloration syntaxique YAML minimale par ligne (regex), pas un vrai
// tokenizer — suffisant pour distinguer clés/valeurs/commentaires/listes
// d'un coup d'œil sans tirer de dépendance externe (pas de CodeMirror/Monaco).
const COLORS = {
  key: '#7DB0F7',
  string: '#9ECE6A',
  comment: 'var(--text-faintest)',
  dash: 'var(--text-faint)',
  bool: '#E0AF68'
};

function renderLine(line) {
  const commentIdx = line.indexOf('#');
  const [code, comment] = commentIdx >= 0 ? [line.slice(0, commentIdx), line.slice(commentIdx)] : [line, ''];

  const keyMatch = code.match(/^(\s*(?:-\s+)?)([A-Za-z0-9_.-]+)(:)(\s*)(.*)$/);
  let body;
  if (keyMatch) {
    const [, indent, key, colon, sp, value] = keyMatch;
    const isBool = /^(true|false|null|~)$/i.test(value.trim());
    const isString = /^["'].*["']$/.test(value.trim());
    body = (
      <>
        <span>{indent}</span>
        <span style={{ color: COLORS.key }}>{key}</span>
        <span>{colon}{sp}</span>
        {value && <span style={{ color: isBool ? COLORS.bool : isString ? COLORS.string : undefined }}>{value}</span>}
      </>
    );
  } else {
    const dashMatch = code.match(/^(\s*-\s+)(.*)$/);
    body = dashMatch ? <><span style={{ color: COLORS.dash }}>{dashMatch[1]}</span><span>{dashMatch[2]}</span></> : <span>{code}</span>;
  }

  return (
    <>
      {body}
      {comment && <span style={{ color: COLORS.comment }}>{comment}</span>}
    </>
  );
}

export default function YamlView({ text, style }) {
  const lines = (text ?? '').split('\n');
  return (
    <pre className="mono" style={{ margin: 0, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', ...style }}>
      {lines.map((line, i) => <div key={i}>{renderLine(line) || ' '}</div>)}
    </pre>
  );
}
