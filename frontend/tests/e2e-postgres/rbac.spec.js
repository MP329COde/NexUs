import { test, expect } from '@playwright/test';

// Couvre le socle relationnel (RBAC projet, garde de production) que
// tests/e2e/setup.spec.js ne peut pas exercer (DATABASE_URL y est
// volontairement absent). Ignoré proprement si DATABASE_URL n'est pas
// défini dans l'environnement qui a lancé `playwright test` — voir
// playwright.postgres.config.js pour la commande complète.
test.skip(!process.env.DATABASE_URL, 'DATABASE_URL non défini — suite Postgres ignorée');

test.describe.configure({ mode: 'serial' });

// Voir tests/e2e/setup.spec.js : un appel API direct (hors navigateur)
// n'attache jamais l'en-tête CSRF automatiquement, contrairement au
// frontend réel (lib/apiClient.js) — on le rejoue ici depuis le cookie
// nexus_csrf posé par le login.
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
    delete: async (url, opts = {}) => context.delete(url, { ...opts, headers: { ...(opts.headers || {}), ...(await csrfHeaders()) } }),
    dispose: () => context.dispose()
  };
}

test.describe('RBAC relationnel et failles d\'autorisation corrigées', () => {
  let adminApi;
  let aliceApi;
  let bobApi;
  let projectId;
  let linkId;

  test.beforeAll(async ({ playwright }) => {
    const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
    const setup = await rawAdmin.post('/api/setup', {
      data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
    });
    expect(setup.ok()).toBeTruthy();
    adminApi = withCsrf(rawAdmin);

    const alice = await adminApi.post('/api/users', { data: { email: 'alice@rbac-pg.test', password: 'AlicePassword123!', name: 'Alice', role: 'user', skipOnboarding: true } });
    expect(alice.ok()).toBeTruthy();
    const bob = await adminApi.post('/api/users', { data: { email: 'bob@rbac-pg.test', password: 'BobPassword123!', name: 'Bob', role: 'user', skipOnboarding: true } });
    expect(bob.ok()).toBeTruthy();

    const rawAlice = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
    await rawAlice.post('/api/auth/login', { data: { email: 'alice@rbac-pg.test', password: 'AlicePassword123!' } });
    aliceApi = withCsrf(rawAlice);
    const rawBob = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
    await rawBob.post('/api/auth/login', { data: { email: 'bob@rbac-pg.test', password: 'BobPassword123!' } });
    bobApi = withCsrf(rawBob);

    const org = await adminApi.post('/api/organizations', { data: { name: 'RBAC Org', slug: `rbac-org-${Date.now()}` } });
    const { organization } = await org.json();
    const proj = await adminApi.post('/api/projects', { data: { name: 'RBAC Project', organizationId: organization.id } });
    const { project } = await proj.json();
    projectId = project.id;

    const link = await adminApi.post('/api/deployments', { data: { name: 'App', projectId, argocdAppName: 'rbac-test-app' } });
    expect(link.ok()).toBeTruthy();
    linkId = (await link.json()).link.id;
  });

  test.afterAll(async () => {
    await adminApi?.dispose();
    await aliceApi?.dispose();
    await bobApi?.dispose();
  });

  test('Bob (non-membre) : GET /projects ne contient pas le projet RBAC', async () => {
    const res = await bobApi.get('/api/projects');
    const { items } = await res.json();
    expect(items.some((p) => p.id === projectId)).toBe(false);
  });

  test('Bob (non-membre) : POST /deployments/:id/sync est refusé (403), pas une simple erreur ArgoCD', async () => {
    const res = await bobApi.post(`/api/deployments/${linkId}/sync`, { data: {} });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/maintainer/i);
  });

  test('Bob (non-membre) : DELETE /deployments/:id est refusé (403)', async () => {
    const res = await bobApi.delete(`/api/deployments/${linkId}`);
    expect(res.status()).toBe(403);
  });

  test('Bob (non-membre) : POST /pipelines/runs/:id/retry est réservé aux admins (403)', async () => {
    const res = await bobApi.post('/api/pipelines/runs/gitlab:1:2/retry');
    expect(res.status()).toBe(403);
  });

  test('Bob (non-membre) : POST /reviews/:key/approve est réservé aux admins (403)', async () => {
    const res = await bobApi.post('/api/reviews/gitlab:1:2/approve');
    expect(res.status()).toBe(403);
  });

  test('Bob (non-membre) : POST /reviews/:key/assign reste ouvert (bookkeeping local, pas la même classe de risque)', async () => {
    const res = await bobApi.post('/api/reviews/gitlab:1:2/assign');
    expect(res.ok()).toBeTruthy();
  });

  test('Admin : sync échoue proprement faute d\'ArgoCD configuré (409), jamais un 403 — la garde RBAC est bien passée', async () => {
    const res = await adminApi.post(`/api/deployments/${linkId}/sync`, { data: {} });
    expect(res.status()).toBe(409);
  });

  test('Un compte "developer" promu sur le projet peut sync (garde passée) mais pas rollback (owner requis)', async () => {
    const usersRes = await adminApi.get('/api/users');
    const { items: users } = await usersRes.json();
    const aliceId = users.find((u) => u.email === 'alice@rbac-pg.test').id;

    const promote = await adminApi.put(`/api/projects/${projectId}/members/${aliceId}`, { data: { role: 'maintainer' } });
    expect(promote.ok()).toBeTruthy();

    const sync = await aliceApi.post(`/api/deployments/${linkId}/sync`, { data: {} });
    expect(sync.status()).toBe(409); // garde passée, échoue seulement sur ArgoCD non configuré

    const rollback = await aliceApi.post(`/api/deployments/${linkId}/rollback`, { data: { historyId: 1 } });
    expect(rollback.status()).toBe(403);
    const body = await rollback.json();
    expect(body.error).toMatch(/owner/i);
  });
});
