// Formatage tabulaire minimal, sans dépendance — testable en isolation
// (pas d'appel réseau), réutilisé par toutes les commandes de liste.
export function formatTable(rows, columns) {
  if (rows.length === 0) return '(aucun résultat)';
  const widths = columns.map((c) => Math.max(c.header.length, ...rows.map((r) => String(c.value(r) ?? '').length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  const header = line(columns.map((c) => c.header));
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  const body = rows.map((r) => line(columns.map((c) => c.value(r) ?? '')));
  return [header, sep, ...body].join('\n');
}
