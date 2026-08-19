import { test, expect } from '@playwright/test';

// Couvre l'historique des révisions d'ADR (Lot 24, todo.md item 11 :
// "refus des écrasements silencieux, historique des modifications").
test.skip(!process.env.DATABASE_URL, 'DATABASE_URL non défini — suite Postgres ignorée');

function withCsrf(context) {
  async function csrfHeaders() {
    const state = await context.storageState();
    const cookie = state.cookies.find((c) => c.name === 'nexus_csrf');
    return cookie ? { 'X-CSRF-Token': cookie.value } : {};
  }
  return {
    get: (url, opts) => context.get(url, opts),
    post: async (url, opts = {}) => context.post(url, { ...opts, headers: { ...(opts.headers || {}), ...(await csrfHeaders()) } }),
    put: async (url, opts = {}) => context.put(url, { ...opts, headers: { ...(opts.headers || {}), ...(await csrfHeaders()) } })
  };
}

test('modifier une ADR conserve la version précédente dans son historique', async ({ page, playwright }) => {
  const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
  const setup = await rawAdmin.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  });
  if (!setup.ok()) {
    const login = await rawAdmin.post('/api/auth/login', { data: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!' } });
    expect(login.ok()).toBeTruthy();
  }
  const adminApi = withCsrf(rawAdmin);

  const org = await adminApi.post('/api/organizations', { data: { name: 'ADR Rev Org', slug: `adr-rev-org-${Date.now()}` } });
  const { organization } = await org.json();
  const proj = await adminApi.post('/api/projects', { data: { name: 'ADR Rev Project', organizationId: organization.id } });
  const { project } = await proj.json();
  const adr = await adminApi.post(`/api/projects/${project.id}/adrs`, { data: { title: 'Choix initial du cache', status: 'proposed' } });
  const { adr: createdAdr } = await adr.json();

  await adminApi.put(`/api/projects/${project.id}/adrs/${createdAdr.id}`, { data: { status: 'accepted' } });

  const revisionsRes = await adminApi.get(`/api/projects/${project.id}/adrs/${createdAdr.id}/revisions`);
  const { items } = await revisionsRes.json();
  expect(items.length).toBe(1);
  expect(items[0].status).toBe('proposed'); // l'état AVANT la modification, jamais perdu

  await page.goto('/login');
  await page.locator('.login-field-email').fill('admin@rbac-pg.test');
  await page.locator('.login-field-password').fill('AdminPassword123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  await page.goto(`/deployments/projects/${project.id}`);
  await page.getByText('Choix initial du cache', { exact: true }).click();
  await expect(page.getByText('Historique des modifications', { exact: true })).toBeVisible();

  await rawAdmin.dispose();
});
