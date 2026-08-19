import { test, expect } from '@playwright/test';

// Couvre l'allowlist de permissions plugin (Lot 20, todo.md item 14 :
// "Créer un modèle dédié" plutôt qu'un simple format libre plugin:<x>.<y>).
test.skip(!process.env.DATABASE_URL, 'DATABASE_URL non défini — suite Postgres ignorée');

function withCsrf(context) {
  async function csrfHeaders() {
    const state = await context.storageState();
    const cookie = state.cookies.find((c) => c.name === 'nexus_csrf');
    return cookie ? { 'X-CSRF-Token': cookie.value } : {};
  }
  return {
    post: async (url, opts = {}) => context.post(url, { ...opts, headers: { ...(opts.headers || {}), ...(await csrfHeaders()) } })
  };
}

test('un plugin déclarant une permission inconnue est rejeté (400), une du catalogue est acceptée', async ({ playwright }) => {
  const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
  const setup = await rawAdmin.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  });
  if (!setup.ok()) {
    const login = await rawAdmin.post('/api/auth/login', { data: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!' } });
    expect(login.ok()).toBeTruthy();
  }
  const adminApi = withCsrf(rawAdmin);

  const badPlugin = {
    id: 'bad-perm-plugin', name: 'Bad Perm Plugin', version: '1.0.0', apiVersion: '1.0',
    permissions: ['plugin:admin.full-access']
  };
  const rejected = await adminApi.post('/api/plugins/install', { data: { manifest: badPlugin } });
  expect(rejected.status()).toBe(400);
  const rejectedBody = await rejected.json();
  expect(rejectedBody.error).toContain('admin.full-access');

  const goodPlugin = {
    id: 'good-perm-plugin', name: 'Good Perm Plugin', version: '1.0.0', apiVersion: '1.0',
    permissions: ['plugin:catalog.read', 'plugin:secrets.read']
  };
  const accepted = await adminApi.post('/api/plugins/install', { data: { manifest: goodPlugin } });
  expect(accepted.ok()).toBeTruthy();

  await rawAdmin.dispose();
});
