const TONE_LABEL = { ok: 'OK', warn: 'Attention', crit: 'Critique', info: 'Info', mut: '—' };

export function toneFromStatus(entry) {
  if (!entry || entry.configured === false) return 'mut';
  return entry.ok ? 'ok' : 'crit';
}

export default function StatusBadge({ tone = 'mut', label }) {
  return (
    <span className={`badge badge-${tone}`}>
      <span className="dot" />
      {label ?? TONE_LABEL[tone]}
    </span>
  );
}
