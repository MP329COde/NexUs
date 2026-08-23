import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';

process.env.NEXUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-tls-'));

const { diagnoseHost, validateCaCertPem, suggestFix } = await import('../src/services/tlsDiagnosticsService.js');
const { buildHttpsAgentFromConfig } = await import('../src/services/integrations/httpClient.js');

// Génère une paire clé/certificat auto-signée réelle via openssl (comme au
// Lot A1) : test contre un vrai serveur TLS, aucune donnée simulée.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-tls-cert-'));
const keyPath = path.join(workDir, 'key.pem');
const certPath = path.join(workDir, 'cert.pem');
let opensslAvailable = true;
try {
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-keyout', keyPath, '-out', certPath,
    '-days', '1', '-nodes', '-subj', '/CN=localhost'
  ], { stdio: 'pipe' });
} catch {
  opensslAvailable = false;
}

test('diagnoseHost : hôte injoignable renvoie un échec honnête, sans données inventées', async () => {
  const diag = await diagnoseHost('localhost', 65530, {});
  assert.equal(diag.reachable, false);
  assert.equal(diag.certificate, null);
  assert.ok(diag.error?.code);
});

test('diagnoseHost + buildHttpsAgentFromConfig : certificat auto-signé réel, sujet/émetteur/expiration corrects, strict échoue puis réussit avec la CA', { skip: !opensslAvailable && 'openssl indisponible dans cet environnement' }, async () => {
  const key = fs.readFileSync(keyPath);
  const cert = fs.readFileSync(certPath);
  const server = https.createServer({ key, cert }, (req, res) => res.end('ok'));
  await new Promise((resolve) => server.listen(0, 'localhost', resolve));
  const port = server.address().port;

  try {
    // Sans CA fournie : connexion stricte doit échouer avec un code TLS connu.
    const diag = await diagnoseHost('localhost', port, {});
    assert.equal(diag.reachable, true);
    assert.ok(diag.certificate, 'le certificat réel doit être lu (mode permissif)');
    assert.match(diag.certificate.subject.CN, /localhost/);
    assert.ok(diag.certificate.validTo, 'la date d\'expiration réelle doit être renvoyée');
    assert.equal(typeof diag.daysUntilExpiry, 'number');
    assert.equal(diag.strict.ok, false, 'la vérification stricte doit échouer sans CA de confiance');
    assert.ok(diag.strict.errorCode, 'un code d\'erreur TLS précis doit être renvoyé');
    assert.ok(suggestFix(diag, true), 'une suggestion actionnable doit être proposée');

    // Avec la CA (= le certificat auto-signé lui-même ici) fournie : succès.
    const diagWithCa = await diagnoseHost('localhost', port, { caCertPem: cert.toString('utf8') });
    assert.equal(diagWithCa.strict.ok, true, 'la connexion stricte doit réussir une fois la CA configurée');

    // Vérifie aussi que buildHttpsAgentFromConfig (câblage réel utilisé par
    // les services d'intégration) produit un agent qui fait effectivement
    // confiance à cette CA pour une requête HTTPS complète (pas seulement tls.connect brut).
    const agent = buildHttpsAgentFromConfig({ caCertPem: cert.toString('utf8') });
    const requestOk = await new Promise((resolve) => {
      const req = https.request({ host: 'localhost', port, path: '/', agent }, (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve(true));
      });
      req.on('error', () => resolve(false));
      req.end();
    });
    assert.equal(requestOk, true, 'une requête HTTPS via buildHttpsAgentFromConfig avec la bonne CA doit réussir');
  } finally {
    server.close();
  }
});

test('validateCaCertPem : rejette un texte qui n\'est pas un certificat PEM', () => {
  assert.throws(() => validateCaCertPem('pas un certificat'), /Format de certificat invalide/);
});

test('validateCaCertPem : accepte un certificat auto-signé réel et en extrait le sujet', { skip: !opensslAvailable && 'openssl indisponible dans cet environnement' }, () => {
  const cert = fs.readFileSync(certPath, 'utf8');
  const info = validateCaCertPem(cert);
  assert.match(info.subject, /localhost/);
});
