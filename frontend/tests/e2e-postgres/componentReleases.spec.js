import { test, expect } from '@playwright/test';

// Couvre le Changelog/Releases par composant (Lot 13) : publication
// manuelle d'une version avec ses références (commit, PR, pipeline,
// déploiement) — pas de détection automatique (aucune forge configurée
// dans cet environnement de test, cf. limite déjà documentée ailleurs).
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

test('publier deux fois la même version est refusé (409), la page affiche la version publiée', async ({ page, playwright }) => {
  const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
  const setup = await rawAdmin.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  });
  if (!setup.ok()) {
    const login = await rawAdmin.post('/api/auth/login', { data: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!' } });
    expect(login.ok()).toBeTruthy();
  }
  const adminApi = withCsrf(rawAdmin);

  const org = await adminApi.post('/api/organizations', { data: { name: 'Releases Org', slug: `releases-org-${Date.now()}` } });
  const { organization } = await org.json();
  const proj = await adminApi.post('/api/projects', { data: { name: 'Releases Project', organizationId: organization.id } });
  const { project } = await proj.json();
  const comp = await adminApi.post('/api/catalog/components', {
    data: { legacyProjectId: project.id, name: 'billing-api', kind: 'service', lifecycle: 'production' }
  });
  const { component } = await comp.json();

  const first = await adminApi.post(`/api/catalog/components/${component.id}/releases`, { data: { version: '1.0.0', notes: 'Première version', commitSha: 'abc1234567' } });
  expect(first.ok()).toBeTruthy();
  const dup = await adminApi.post(`/api/catalog/components/${component.id}/releases`, { data: { version: '1.0.0' } });
  expect(dup.status()).toBe(409);

  await page.goto('/login');
  await page.locator('.login-field-email').fill('admin@rbac-pg.test');
  await page.locator('.login-field-password').fill('AdminPassword123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  await page.goto(`/deployments/catalog/${component.id}`);
  await expect(page.getByText('1.0.0', { exact: true })).toBeVisible();
  await expect(page.getByText('abc1234', { exact: true })).toBeVisible();

  await rawAdmin.dispose();
});
