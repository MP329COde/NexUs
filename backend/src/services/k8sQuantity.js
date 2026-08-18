// Parsing des quantités Kubernetes (ÉTAPE 26 IDP, Quotas) — format déjà
// utilisé par environment_blueprints.cpu/memory (ex. "500m", "2", "512Mi",
// "1Gi") : implémentation du sous-ensemble réellement documenté par
// Kubernetes (https://kubernetes.io/docs/reference/kubernetes-api/common-definitions/quantity/),
// jamais une approximation devinée. CPU → millicores (entier), mémoire →
// octets (entier), pour pouvoir sommer/comparer sans perte.
const MEMORY_BINARY_SUFFIXES = { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4 };
const MEMORY_DECIMAL_SUFFIXES = { k: 1000, K: 1000, M: 1000 ** 2, G: 1000 ** 3, T: 1000 ** 4 };

export class QuantityError extends Error {}

export function parseCpuToMillicores(value) {
  if (value == null || value === '') return 0;
  const str = String(value).trim();
  const match = str.match(/^(\d+(?:\.\d+)?)m$/);
  if (match) return Math.round(parseFloat(match[1]));
  const num = Number(str);
  if (!Number.isFinite(num) || num < 0) throw new QuantityError(`Quantité CPU invalide : "${value}"`);
  return Math.round(num * 1000);
}

export function parseMemoryToBytes(value) {
  if (value == null || value === '') return 0;
  const str = String(value).trim();
  for (const [suffix, factor] of Object.entries(MEMORY_BINARY_SUFFIXES)) {
    if (str.endsWith(suffix)) {
      const num = Number(str.slice(0, -suffix.length));
      if (!Number.isFinite(num) || num < 0) throw new QuantityError(`Quantité mémoire invalide : "${value}"`);
      return Math.round(num * factor);
    }
  }
  for (const [suffix, factor] of Object.entries(MEMORY_DECIMAL_SUFFIXES)) {
    if (str.endsWith(suffix)) {
      const num = Number(str.slice(0, -suffix.length));
      if (!Number.isFinite(num) || num < 0) throw new QuantityError(`Quantité mémoire invalide : "${value}"`);
      return Math.round(num * factor);
    }
  }
  const num = Number(str);
  if (!Number.isFinite(num) || num < 0) throw new QuantityError(`Quantité mémoire invalide : "${value}"`);
  return Math.round(num);
}

export function formatMillicores(m) {
  return m % 1000 === 0 ? `${m / 1000}` : `${m}m`;
}

export function formatBytesAsMi(bytes) {
  return `${Math.round(bytes / 1024 ** 2)}Mi`;
}
