import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { getRawIntegration } from '../store/settingsStore.js';

// Lot B4 (Certificats, fonctionnalité centrale) : liste des intégrations dont
// la config expose un hôte HTTPS diagnosticable + les champs TLS qu'elles
// supportent réellement côté backend. Reste volontairement limité aux
// intégrations effectivement câblées sur buildHttpsAgentFromConfig
// (services/integrations/httpClient.js) — ajouter une entrée ici sans que le
// service correspondant lise allowSelfSigned/caCertPem serait mensonger
// (le réglage semblerait actif sans effet réel).
//
// Kubernetes est une exception documentée : son champ "ignorer le certificat"
// s'appelle insecureSkipTlsVerify (câblé via @kubernetes/client-node, pas
// buildHttpsAgentFromConfig) et il ne supporte PAS d'import de CA personnalisée
// dans le code actuel — `supportsCaImport: false` reflète cette limite réelle,
// le diagnostic TLS (lecture seule) reste néanmoins utile pour ce cluster.
export const TLS_INTEGRATIONS = {
  argocd: { label: 'Argo CD', urlField: 'baseUrl', allowSelfSignedField: 'allowSelfSigned', supportsCaImport: true },
  haproxy: { label: 'HAProxy', urlField: 'dataPlaneUrl', allowSelfSignedField: 'allowSelfSigned', supportsCaImport: true },
  gitlab: { label: 'GitLab', urlField: 'baseUrl', allowSelfSignedField: 'allowSelfSigned', supportsCaImport: true },
  proxmox: { label: 'Proxmox VE', urlField: 'baseUrl', allowSelfSignedField: 'allowSelfSigned', supportsCaImport: true },
  wazuh: { label: 'Wazuh', urlField: 'baseUrl', allowSelfSignedField: 'allowSelfSigned', supportsCaImport: true },
  kubernetes: { label: 'Kubernetes', urlField: 'apiServer', allowSelfSignedField: 'insecureSkipTlsVerify', supportsCaImport: false }
};

export function listTlsIntegrationKeys() {
  return Object.keys(TLS_INTEGRATIONS);
}

function parseHostPort(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') return null;
    return { host: u.hostname, port: u.port ? Number(u.port) : 443 };
  } catch {
    return null;
  }
}

// Construit la chaîne de certificats présentée par le serveur en suivant
// `issuerCertificate` jusqu'à une référence à soi-même (racine) ou jusqu'à
// une profondeur raisonnable — évite toute boucle infinie sur une chaîne
// malformée.
function buildChain(peerCert) {
  const chain = [];
  let cur = peerCert;
  let guard = 0;
  while (cur && Object.keys(cur).length > 0 && guard < 10) {
    chain.push({
      subject: cur.subject,
      issuer: cur.issuer,
      validFrom: cur.valid_from,
      validTo: cur.valid_to,
      serialNumber: cur.serialNumber,
      fingerprint: cur.fingerprint
    });
    if (cur.issuerCertificate && cur.issuerCertificate !== cur) {
      cur = cur.issuerCertificate;
    } else {
      break;
    }
    guard += 1;
  }
  return chain;
}

function daysUntil(validToStr) {
  if (!validToStr) return null;
  const ms = new Date(validToStr).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

// Une seule connexion TLS réelle, avec le mode de vérification demandé.
// N'INVENTE RIEN : en cas d'échec de connexion (hôte injoignable, timeout,
// refus...), retourne { reachable: false, error } sans jamais fabriquer de
// données de certificat.
function connectOnce(host, port, { rejectUnauthorized, ca, timeoutMs = 5000 }) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = tls.connect({
      host,
      port,
      servername: host,
      rejectUnauthorized,
      ca: ca || undefined,
      timeout: timeoutMs
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* noop */ }
      resolve(result);
    };

    socket.on('secureConnect', () => {
      const peerCert = socket.getPeerCertificate(true);
      const authorized = socket.authorized;
      const authorizationError = socket.authorizationError;
      finish({
        reachable: true,
        authorized,
        authorizationError: authorized ? null : String(authorizationError || 'inconnue'),
        chain: peerCert && Object.keys(peerCert).length ? buildChain(peerCert) : []
      });
    });

    socket.on('error', (err) => {
      finish({ reachable: false, error: { code: err.code || null, message: err.message } });
    });

    socket.on('timeout', () => {
      finish({ reachable: false, error: { code: 'ETIMEDOUT', message: `Aucune réponse TLS après ${timeoutMs}ms` } });
    });
  });
}

// Diagnostic complet d'un hôte HTTPS : une connexion permissive (pour lire le
// certificat réel même s'il n'est pas fiable) + une connexion stricte (pour
// détecter précisément si/pourquoi la vérification échouerait en usage réel,
// avec la CA personnalisée éventuellement configurée).
export async function diagnoseHost(host, port, { caCertPem } = {}) {
  const permissive = await connectOnce(host, port, { rejectUnauthorized: false });
  if (!permissive.reachable) {
    return { host, port, reachable: false, error: permissive.error, strict: null, certificate: null, daysUntilExpiry: null };
  }
  const strict = await connectOnce(host, port, { rejectUnauthorized: true, ca: caCertPem });
  const leaf = permissive.chain[0] || null;
  return {
    host,
    port,
    reachable: true,
    certificate: leaf,
    chain: permissive.chain,
    daysUntilExpiry: leaf ? daysUntil(leaf.validTo) : null,
    strict: {
      ok: strict.reachable && strict.authorized !== false,
      errorCode: strict.reachable ? (strict.authorized ? null : (strict.authorizationError || null)) : (strict.error?.code || null),
      message: strict.reachable
        ? (strict.authorized ? null : strict.authorizationError)
        : strict.error?.message
    }
  };
}

// Suggestion actionnable, honnête (aucun texte générique masquant l'absence
// de diagnostic) à partir du code d'erreur détecté en connexion stricte.
export function suggestFix(diag, supportsCaImport) {
  if (!diag) return null;
  if (!diag.reachable) {
    return `Hôte injoignable (${diag.error?.code || 'erreur inconnue'}) — vérifiez l'URL, le port et que le service est démarré.`;
  }
  const code = diag.strict?.errorCode;
  if (!code || diag.strict?.ok) return null;
  if (/SELF_SIGNED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|self signed/i.test(String(code))) {
    return supportsCaImport
      ? "Certificat non reconnu par une autorité publique — importez la CA de cette intégration ci-dessous, ou cochez « Ignorer la vérification du certificat »."
      : "Certificat non reconnu par une autorité publique — cochez « Ignorer la vérification du certificat » pour cette intégration.";
  }
  if (/CERT_HAS_EXPIRED|expired/i.test(String(code))) {
    return 'Le certificat présenté est expiré — renouvelez-le côté serveur.';
  }
  return `Vérification stricte en échec (${code}).`;
}

// Diagnostique une intégration connue en lisant sa config réelle (URL,
// allowSelfSigned, caCertPem). Retourne { configured:false } si l'URL n'est
// pas renseignée — n'invente jamais de résultat de connexion dans ce cas.
export async function diagnoseIntegration(key) {
  const meta = TLS_INTEGRATIONS[key];
  if (!meta) throw Object.assign(new Error(`Intégration TLS inconnue: ${key}`), { status: 400 });
  const cfg = getRawIntegration(key);
  const urlValue = cfg[meta.urlField];
  if (!urlValue) {
    return { key, label: meta.label, configured: false, supportsCaImport: meta.supportsCaImport, allowSelfSigned: Boolean(cfg[meta.allowSelfSignedField]), caCertPemSet: Boolean(cfg.caCertPem) };
  }
  const hp = parseHostPort(urlValue);
  if (!hp) {
    return { key, label: meta.label, configured: true, url: urlValue, error: { code: null, message: "URL non HTTPS ou invalide — diagnostic TLS non applicable." }, supportsCaImport: meta.supportsCaImport, allowSelfSigned: Boolean(cfg[meta.allowSelfSignedField]), caCertPemSet: Boolean(cfg.caCertPem) };
  }
  const diag = await diagnoseHost(hp.host, hp.port, { caCertPem: cfg.caCertPem });
  return {
    key,
    label: meta.label,
    configured: true,
    url: urlValue,
    supportsCaImport: meta.supportsCaImport,
    allowSelfSigned: Boolean(cfg[meta.allowSelfSignedField]),
    caCertPemSet: Boolean(cfg.caCertPem),
    ...diag,
    suggestion: suggestFix(diag, meta.supportsCaImport)
  };
}

// Valide un PEM de certificat CA avant sauvegarde : format ET analyse réelle
// via crypto.X509Certificate (rejette tout ce qui ne parse pas comme un
// certificat X.509 valide, pas seulement une vérification d'en-tête).
export function validateCaCertPem(pem) {
  if (typeof pem !== 'string' || !/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(pem)) {
    throw Object.assign(new Error('Format de certificat invalide : un bloc PEM -----BEGIN CERTIFICATE----- ... -----END CERTIFICATE----- est attendu.'), { status: 400 });
  }
  try {
    const cert = new X509Certificate(pem);
    return { subject: cert.subject, issuer: cert.issuer, validFrom: cert.validFrom, validTo: cert.validTo };
  } catch (err) {
    throw Object.assign(new Error(`Certificat illisible par OpenSSL : ${err.message}`), { status: 400 });
  }
}
