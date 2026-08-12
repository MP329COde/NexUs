import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NEXUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-proxy-'));

const proxyService = await import('../src/services/proxyService.js');

test('refuse la création sans champs requis', () => {
  assert.throws(() => proxyService.create({ name: 'incomplet' }), /requis/);
});

test('refuse un domaine invalide', () => {
  assert.throws(
    () => proxyService.create({ name: 'x', domain: 'pas un domaine', targetService: 'svc', targetPort: 80 }),
    /domaine/i
  );
});

// Ces trois champs sont interpolés tels quels dans le YAML écrit pour Traefik
// (voir traefikService.writeDynamicRoute) : sans validation de format, un
// utilisateur authentifié non-admin pourrait injecter des clés YAML
// arbitraires et détourner du routage. Régression : ils n'étaient auparavant
// vérifiés que pour leur présence, pas leur contenu.
test('refuse un service cible contenant des caractères YAML dangereux', () => {
  assert.throws(
    () => proxyService.create({ name: 'x', domain: 'app.homelab.local', targetService: 'svc"\n  routers:\n    evil:', targetPort: 80 }),
    /service cible/i
  );
});

test('refuse un port hors plage', () => {
  assert.throws(
    () => proxyService.create({ name: 'x', domain: 'app.homelab.local', targetService: 'svc', targetPort: 99999 }),
    /port cible/i
  );
});

test('refuse un certResolver contenant des caractères YAML dangereux', () => {
  assert.throws(
    () => proxyService.create({ name: 'x', domain: 'app.homelab.local', targetService: 'svc', targetPort: 80, certResolver: 'default\n  routers:' }),
    /resolver de certificat/i
  );
});

test('crée un proxy valide avec les valeurs par défaut attendues', () => {
  const proxy = proxyService.create({ name: 'app', domain: 'app.homelab.local', targetService: 'app-svc', targetPort: '8080' });
  assert.equal(proxy.status, 'draft');
  assert.equal(proxy.engine, 'traefik');
  assert.equal(proxy.targetPort, 8080); // converti en nombre
  assert.equal(proxyService.list().length, 1);
});

test('update() sur un id inconnu (mais payload valide) renvoie une 404', () => {
  assert.throws(
    () => proxyService.update('id-inexistant', { name: 'x', domain: 'x.homelab.local', targetService: 'svc', targetPort: 80 }),
    /introuvable/
  );
});
