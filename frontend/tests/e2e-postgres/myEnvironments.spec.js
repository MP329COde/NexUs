import { test, expect } from '@playwright/test';

// Couvre "Mes environnements" sur la page Mon travail (Lot 16) : les
// environnements de type preview sur mes projets, avec leur branche
// source, sont agrégés et affichés — un environnement de production/
// staging n'apparaît pas ici (ce n'est pas une preview).
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

test('les environnements de preview de mes projets apparaissent sur Mon travail, pas la production', async ({ page, playwright }) => {
  const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
  const setup = await rawAdmin.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  });
  if (!setup.ok()) {
    const login = await rawAdmin.post('/api/auth/login', { data: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!' } });
    expect(login.ok()).toBeTruthy();
  }
  const adminApi = withCsrf(rawAdmin);

  const org = await adminApi.post('/api/organizations', { data: { name: 'Env Org', slug: `env-org-${Date.now()}` } });
  const { organization } = await org.json();
  const proj = await adminApi.post('/api/projects', { data: { name: 'Env Project', organizationId: organization.id } });
  const { project } = await proj.json();

  const preview = await adminApi.post(`/api/projects/${project.id}/environments`, {
    data: { name: 'pr-42', kind: 'preview', sourceBranch: 'feature/pr-42', sourcePrUrl: 'https://example.test/pr/42' }
  });
  expect(preview.ok()).toBeTruthy();

  await page.goto('/login');
  await page.locator('.login-field-email').fill('admin@rbac-pg.test');
  await page.locator('.login-field-password').fill('AdminPassword123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  await page.goto('/deployments/my-work');
  const row = page.locator('.mywork-row', { has: page.getByText('pr-42', { exact: true }) });
  await expect(row).toBeVisible();
  await expect(row.getByText('feature/pr-42', { exact: true })).toBeVisible();
  await expect(page.getByText('production', { exact: true })).toHaveCount(0);

  await rawAdmin.dispose();
});
