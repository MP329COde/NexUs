import { test, expect } from '@playwright/test';

// Couvre le socle Plugin Runtime (Lot 1) : installation/activation/
// désactivation/suppression, isolation des permissions (un utilisateur sans
// plugins:write ne peut pas installer), et rejet propre d'un manifest
// invalide. Suit le même pattern que rbac.spec.js (backend Postgres
// jetable partagé entre fichiers *.spec.js de ce dossier).
test.skip(!process.env.DATABASE_URL, 'DATABASE_URL non défini — suite Postgres ignorée');

test.describe.configure({ mode: 'serial' });

function withCsrf(context) {
  async function csrfHeaders() {
    const state = await context.storageState();
    const cookie = state.cookies.find((c) => c.name === 'nexus_csrf');
    return cookie ? { 'X-CSRF-Token': cookie.value } : {};
  }
  return {
    get: (url, opts) => context.get(url, opts),
    post: async (url, opts = {}) => context.post(url, { ...opts, headers: { ...(opts.headers || {}), ...(await csrfHeaders()) } }),
    put: async (url, opts = {}) => context.put(url, { ...opts, headers: { ...(opts.headers || {}), ...(await csrfHeaders()) } }),
    delete: async (url, opts = {}) => context.delete(url, { ...opts, headers: { ...(opts.headers || {}), ...(await csrfHeaders()) } })
  };
}

const TEST_MANIFEST = {
  id: 'test-plugin',
  name: 'Plugin de test',
  version: '1.0.0',
  apiVersion: '1.0',
  permissions: ['plugin:catalog.read'],
  contributes: { menus: [{ label: 'Test' }] }
};

test.describe('Plugin Runtime — socle backend (Lot 1)', () => {
  let adminApi;
  let aliceApi;

  test.beforeAll(async ({ playwright }) => {
    // Backend jetable partagé avec rbac.spec.js/ultimate.spec.js (même
    // webServer, /api/setup ne réussit qu'une fois) : mêmes identifiants
    // admin de convention, pour que le repli "déjà configuré par un autre
    // fichier" fonctionne quel que soit l'ordre d'exécution — voir
    // rbac.spec.js.
    const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
    const setup = await rawAdmin.post('/api/setup', {
      data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
    });
    if (!setup.ok()) {
      const login = await rawAdmin.post('/api/auth/login', { data: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!' } });
      expect(login.ok()).toBeTruthy();
    }
    adminApi = withCsrf(rawAdmin);

    const aliceEmail = `alice-plugins-${Date.now()}@rbac-pg.test`;
    const alice = await adminApi.post('/api/users', { data: { email: aliceEmail, password: 'AlicePassword123!', name: 'Alice Plugins', role: 'user', skipOnboarding: true } });
    expect(alice.ok()).toBeTruthy();
    const rawAlice = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
    await rawAlice.post('/api/auth/login', { data: { email: aliceEmail, password: 'AlicePassword123!' } });
    aliceApi = withCsrf(rawAlice);
  });

  test.afterAll(async () => {
    await adminApi?.dispose?.();
    await aliceApi?.dispose?.();
  });

  test('Alice (sans permission plugins:write) ne peut pas installer un plugin', async () => {
    const res = await aliceApi.post('/api/plugins/install', { data: { manifest: TEST_MANIFEST } });
    expect(res.status()).toBe(403);
  });

  test('Un manifest invalide est rejeté proprement (400), sans crash serveur', async () => {
    const res = await adminApi.post('/api/plugins/install', { data: { manifest: { name: 'Sans id' } } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("Admin installe le plugin de test, il apparaît 'installed' (pas actif)", async () => {
    const res = await adminApi.post('/api/plugins/install', { data: { manifest: TEST_MANIFEST } });
    expect(res.ok()).toBeTruthy();
    const { plugin } = await res.json();
    expect(plugin.status).toBe('installed');

    const list = await adminApi.get('/api/plugins');
    const { items } = await list.json();
    expect(items.some((p) => p.id === 'test-plugin')).toBe(true);
  });

  test('Un second install du même id est refusé (409)', async () => {
    const res = await adminApi.post('/api/plugins/install', { data: { manifest: TEST_MANIFEST } });
    expect(res.status()).toBe(409);
  });

  test('Activation puis désactivation du plugin', async () => {
    const activate = await adminApi.post('/api/plugins/test-plugin/activate');
    expect(activate.ok()).toBeTruthy();
    expect((await activate.json()).plugin.status).toBe('active');

    const disable = await adminApi.post('/api/plugins/test-plugin/disable');
    expect(disable.ok()).toBeTruthy();
    expect((await disable.json()).plugin.status).toBe('disabled');
  });

  test('Les permissions déclarées dans le manifest sont bien enregistrées', async () => {
    const res = await adminApi.get('/api/plugins/test-plugin/permissions');
    const { items } = await res.json();
    expect(items).toContain('plugin:catalog.read');
  });

  test('Configuration du plugin : écriture puis lecture', async () => {
    const put = await adminApi.put('/api/plugins/test-plugin/config', { data: { key: 'apiKey', value: 'secret-value' } });
    expect(put.ok()).toBeTruthy();
    const get = await adminApi.get('/api/plugins/test-plugin/config');
    const { items } = await get.json();
    expect(items.find((c) => c.key === 'apiKey').value).toBe('secret-value');
  });

  test('Désinstallation du plugin : il disparaît de la liste', async () => {
    const del = await adminApi.delete('/api/plugins/test-plugin');
    expect(del.ok()).toBeTruthy();
    const list = await adminApi.get('/api/plugins');
    const { items } = await list.json();
    expect(items.some((p) => p.id === 'test-plugin')).toBe(false);
  });

  // Vérifie le vrai flux dans le navigateur (onglet Paramètres → Plugins),
  // pas seulement l'API — installation via manifest JSON collé, activation,
  // désinstallation. Utilise un id distinct de TEST_MANIFEST pour ne pas
  // dépendre de l'ordre avec les tests API ci-dessus.
  test('Onglet Plugins : installer, activer puis désinstaller depuis le navigateur', async ({ page }) => {
    await page.goto('/login');
    await page.locator('.login-field-email').fill('admin@rbac-pg.test');
    await page.locator('.login-field-password').fill('AdminPassword123!');
    await page.locator('button[type=submit]').click();
    await page.waitForURL(/\/$/, { timeout: 10000 });

    await page.goto('/settings?tab=plugins');
    await page.getByText('Installer un plugin', { exact: true }).click();
    await page.locator('textarea.input').fill(JSON.stringify({
      id: 'test-plugin-ui', name: 'Plugin UI Test', version: '1.0.0', apiVersion: '1.0'
    }));
    await page.getByRole('button', { name: 'Installer' }).click();

    const row = page.locator('.plugins-row', { has: page.getByText('Plugin UI Test', { exact: true }) });
    await expect(row).toBeVisible();
    await expect(row.getByText('Installé', { exact: true })).toBeVisible();

    await row.getByText('Activer', { exact: true }).click();
    await expect(row.getByText('Actif', { exact: true })).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await row.locator('.plugins-danger').click();
    await expect(page.locator('.plugins-row', { has: page.getByText('Plugin UI Test', { exact: true }) })).toHaveCount(0);
  });
});
