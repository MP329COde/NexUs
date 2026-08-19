import { test, expect } from '@playwright/test';

// Couvre la page "Commencer à développer" (Lot 18, todo.md item 58) :
// accessible depuis la fiche projet, affiche les vraies données du projet
// (secrets déclarés, environnements) sans jamais exposer la valeur d'un
// secret.
test.skip(!process.env.DATABASE_URL, 'DATABASE_URL non défini — suite Postgres ignorée');

function withCsrf(context) {
  async function csrfHeaders() {
    const state = await context.storageState();
    const cookie = state.cookies.find((c) => c.name === 'nexus_csrf');
    return cookie ? { 'X-CSRF-Token': cookie.value } : {};
  }
  return {
    get: (url, opts) => context.get(url, opts),
    post: async (url, opts = {}) => context.post(url, { ...opts, headers: { ...(opts.headers || {}), ...(await csrfHeaders()) } })
  };
}

test('la page "Commencer à développer" liste les secrets déclarés (sans leur valeur) et les environnements', async ({ page, playwright }) => {
  const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
  const setup = await rawAdmin.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  });
  if (!setup.ok()) {
    const login = await rawAdmin.post('/api/auth/login', { data: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!' } });
    expect(login.ok()).toBeTruthy();
  }
  const adminApi = withCsrf(rawAdmin);

  const org = await adminApi.post('/api/organizations', { data: { name: 'GS Org', slug: `gs-org-${Date.now()}` } });
  const { organization } = await org.json();
  const proj = await adminApi.post('/api/projects', { data: { name: 'GS Project', organizationId: organization.id } });
  const { project } = await proj.json();

  const secret = await adminApi.post(`/api/projects/${project.id}/vault`, { data: { label: 'DATABASE_URL', secret: 'postgres://super-secret-value' } });
  expect(secret.ok()).toBeTruthy();

  await page.goto('/login');
  await page.locator('.login-field-email').fill('admin@rbac-pg.test');
  await page.locator('.login-field-password').fill('AdminPassword123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  await page.goto(`/deployments/projects/${project.id}`);
  await page.getByText('Commencer à développer', { exact: true }).click();
  await page.waitForURL(new RegExp(`/deployments/projects/${project.id}/getting-started$`), { timeout: 10000 });

  await expect(page.getByText('DATABASE_URL', { exact: true })).toBeVisible();
  await expect(page.getByText('super-secret-value', { exact: false })).toHaveCount(0);
  await expect(page.getByText('production', { exact: true }).first()).toBeVisible();

  await rawAdmin.dispose();
});
