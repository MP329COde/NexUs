// Estimation d'entropie et de robustesse, calculée localement (aucune
// donnée envoyée nulle part). Hypothèse d'attaque hors-ligne à 10 milliards
// d'essais/seconde (ordre de grandeur d'un GPU récent sur un hash rapide) —
// volontairement pessimiste, pour ne jamais donner un faux sentiment de
// sécurité sur un mot de passe qui semble long mais est peu aléatoire.
const GUESSES_PER_SECOND = 1e10;

export function entropyBitsForRandom(length, alphabetSize) {
  if (!length || !alphabetSize) return 0;
  return length * Math.log2(alphabetSize);
}

export function entropyBitsForPassphrase(wordCount, wordlistSize) {
  if (!wordCount || !wordlistSize) return 0;
  return wordCount * Math.log2(wordlistSize);
}

export function strengthLabel(bits) {
  if (bits < 28) return { label: 'Très faible', tone: 'crit' };
  if (bits < 45) return { label: 'Faible', tone: 'crit' };
  if (bits < 60) return { label: 'Moyen', tone: 'warn' };
  if (bits < 80) return { label: 'Fort', tone: 'ok' };
  return { label: 'Très fort', tone: 'ok' };
}

export function crackTimeLabel(bits) {
  const combinations = Math.pow(2, bits);
  const seconds = combinations / GUESSES_PER_SECOND / 2; // en moyenne, la moitié de l'espace
  const UNITS = [
    ['seconde(s)', 60],
    ['minute(s)', 60],
    ['heure(s)', 24],
    ['jour(s)', 365],
    ['année(s)', Infinity]
  ];
  if (seconds < 1) return 'instantané';
  let value = seconds;
  let unit = 'seconde(s)';
  for (const [label, factor] of UNITS) {
    unit = label;
    if (value < factor) break;
    value /= factor;
  }
  if (unit === 'année(s)' && value > 1e6) return `> 1 million d'années`;
  return `~${Math.round(value * 10) / 10} ${unit}`;
}
