// Correspondance IPv4/CIDR minimale, sans dépendance externe : suffisant pour
// la restriction de connexion (identityStore.loginCidrAllowlist) et évite
// d'ajouter une librairie pour quelques lignes de bit-masking. IPv6 n'est pas
// supporté (retourne toujours false pour une entrée IPv6) — cohérent avec le
// reste de la console, qui ne traite que des adresses IPv4 (voir
// banlistStore.isValidIp, également IPv4-only).
export function isValidCidr(value) {
  if (typeof value !== 'string') return false;
  const [ip, prefix] = value.split('/');
  if (!isValidIpv4(ip)) return false;
  if (prefix === undefined) return true; // une IP seule est acceptée comme /32 implicite
  const p = Number(prefix);
  return Number.isInteger(p) && p >= 0 && p <= 32;
}

export function isValidIpv4(ip) {
  if (typeof ip !== 'string') return false;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

export function ipMatchesCidr(ip, cidr) {
  if (!isValidIpv4(ip) || !isValidCidr(cidr)) return false;
  const [range, prefixRaw] = cidr.split('/');
  const prefix = prefixRaw === undefined ? 32 : Number(prefixRaw);
  if (prefix === 0) return true;
  const mask = prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(range) & mask);
}

export function ipMatchesAnyCidr(ip, cidrList) {
  return (cidrList || []).some((c) => ipMatchesCidr(ip, c));
}
