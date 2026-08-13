// Recherche floue tolérante aux fautes de frappe/orthographe, sans dépendance
// externe. Chaque terme de la requête doit correspondre à au moins un mot du
// texte cible, soit en sous-chaîne directe (score fort), soit à une distance
// de Levenshtein bornée par la longueur du mot (score plus faible).
export function normalizeText(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev = new Array(lb + 1);
  let curr = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[lb];
}

function maxDistanceFor(len) {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  return 2;
}

// Score d'un terme de requête contre un texte cible (déjà normalisé, mots séparés
// par des espaces). Retourne null si aucun mot ne correspond, sinon un score > 0.
function scoreTermAgainstText(term, words) {
  let best = null;
  for (const word of words) {
    if (!word) continue;
    if (word === term) return 100;
    // Mots de 1-2 lettres (articles, "à", "os"...) exclus de la correspondance
    // par sous-chaîne : sinon ils matcheraient n'importe quelle requête par
    // inclusion triviale et fausseraient le score.
    if (Math.min(term.length, word.length) >= 3 && (word.includes(term) || term.includes(word))) {
      const s = 70 + 20 * (Math.min(term.length, word.length) / Math.max(term.length, word.length));
      if (best === null || s > best) best = s;
      continue;
    }
    const dist = levenshtein(term, word);
    if (dist <= maxDistanceFor(term.length)) {
      const s = 40 - dist * 10;
      if (best === null || s > best) best = s;
    }
  }
  return best;
}

// Retourne un score total (plus haut = plus pertinent) ou null si la requête
// ne correspond pas à `text`. `query` doit déjà être découpée en termes non vides.
export function fuzzyScore(text, queryTerms) {
  if (queryTerms.length === 0) return 1;
  const normalized = normalizeText(text);
  const words = normalized.split(/\s+/);
  let total = 0;
  for (const term of queryTerms) {
    const s = scoreTermAgainstText(term, words);
    if (s === null) return null;
    total += s;
  }
  return total;
}

export function queryTerms(query) {
  return normalizeText(query).split(/\s+/).filter(Boolean);
}
