import { test, expect } from '@playwright/test';

// Couvre les ADR (Architecture Decision Records, Lot 14) : numérotation
// séquentielle par projet (ADR-001, ADR-002...), changement de statut.
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

test('deux ADR consécutives sont numérotées ADR-001 puis ADR-002, et le statut est modifiable', async ({ page, playwright }) => {
  const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
  const setup = await rawAdmin.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  });
  if (!setup.ok()) {
    const login = await rawAdmin.post('/api/auth/login', { data: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!' } });
    expect(login.ok()).toBeTruthy();
  }
  const adminApi = withCsrf(rawAdmin);

  const org = await adminApi.post('/api/organizations', { data: { name: 'ADR Org', slug: `adr-org-${Date.now()}` } });
  const { organization } = await org.json();
  const proj = await adminApi.post('/api/projects', { data: { name: 'ADR Project', organizationId: organization.id } });
  const { project } = await proj.json();

  const adr1 = await adminApi.post(`/api/projects/${project.id}/adrs`, { data: { title: 'Choix de la base de données', content: 'PostgreSQL retenu.' } });
  expect(adr1.ok()).toBeTruthy();
  const { adr: firstAdr } = await adr1.json();
  expect(firstAdr.number).toBe(1);

  const adr2 = await adminApi.post(`/api/projects/${project.id}/adrs`, { data: { title: 'Choix du frontend' } });
  const { adr: secondAdr } = await adr2.json();
  expect(secondAdr.number).toBe(2);

  const accept = await adminApi.put(`/api/projects/${project.id}/adrs/${firstAdr.id}`, { data: { status: 'accepted' } });
  expect(accept.ok()).toBeTruthy();

  await page.goto('/login');
  await page.locator('.login-field-email').fill('admin@rbac-pg.test');
  await page.locator('.login-field-password').fill('AdminPassword123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  await page.goto(`/deployments/projects/${project.id}`);
  await expect(page.getByText('ADR-001', { exact: true })).toBeVisible();
  await expect(page.getByText('ADR-002', { exact: true })).toBeVisible();
  await expect(page.getByText('Acceptée', { exact: true })).toBeVisible();

  await rawAdmin.dispose();
});
