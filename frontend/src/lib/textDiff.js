// Diff ligne à ligne par plus longue sous-séquence commune (LCS) — suffisant
// pour des manifests YAML de quelques dizaines/centaines de lignes, sans
// tirer de dépendance externe. Retourne une liste de { type: 'same'|'add'|'del', line }.
export function diffLines(oldText, newText) {
  const a = (oldText ?? '').split('\n');
  const b = (newText ?? '').split('\n');
  const n = a.length, m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: 'same', line: a[i] }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ type: 'del', line: a[i] }); i++; }
    else { out.push({ type: 'add', line: b[j] }); j++; }
  }
  while (i < n) { out.push({ type: 'del', line: a[i] }); i++; }
  while (j < m) { out.push({ type: 'add', line: b[j] }); j++; }
  return out;
}

export function hasChanges(diffResult) {
  return diffResult.some((d) => d.type !== 'same');
}
