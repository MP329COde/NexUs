// Validation légère, pas un parseur YAML complet : suffisant pour attraper
// les erreurs les plus fréquentes avant de committer (tabulations interdites
// en YAML, guillemets non fermés, clés dupliquées au même niveau) sans tirer
// de dépendance externe. Retourne une liste de { line, message }.
export function lintYaml(text) {
  const lines = (text ?? '').split('\n');
  const issues = [];
  const keysByIndent = new Map(); // indent -> Set(key)

  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    if (raw.includes('\t')) {
      issues.push({ line: lineNo, message: 'Tabulation détectée — YAML exige des espaces pour l\'indentation.' });
    }

    const trimmed = raw.replace(/\s+$/, '');
    if (!trimmed.trim() || trimmed.trim().startsWith('#')) return;

    const quoteChars = (trimmed.match(/"/g) || []).length;
    if (quoteChars % 2 !== 0) {
      issues.push({ line: lineNo, message: 'Guillemet double non fermé sur cette ligne.' });
    }

    const indentMatch = raw.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    const keyMatch = trimmed.match(/^(\s*)(?:-\s+)?([A-Za-z0-9_.-]+):(\s|$)/);
    if (keyMatch) {
      const key = keyMatch[2];
      if (!keysByIndent.has(indent)) keysByIndent.set(indent, new Set());
      const set = keysByIndent.get(indent);
      if (set.has(key)) {
        issues.push({ line: lineNo, message: `Clé "${key}" dupliquée au même niveau d'indentation.` });
      }
      set.add(key);
      // Une ligne moins indentée referme les niveaux plus profonds : leurs
      // clés redeviennent valides à réutiliser (nouveau bloc).
      for (const [ind] of keysByIndent) if (ind > indent) keysByIndent.delete(ind);
    }
  });

  return issues;
}
