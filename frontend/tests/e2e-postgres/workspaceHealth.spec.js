import { test, expect } from '@playwright/test';

// Couvre le panneau "Santé du workspace" (Lot 12) : chaque vérification
// reflète des données déjà réelles (dépôts, doc-sites, sécurité, incidents),
// jamais une valeur inventée — un projet neuf doit afficher tout au rouge
// sauf "Incidents" (aucun incident ouvert par défaut est un vrai succès).
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

test('la santé du workspace passe au vert pour Documentation après avoir enregistré un lien Docusaurus', async ({ page, playwright }) => {
  const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
  const setup = await rawAdmin.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  });
  if (!setup.ok()) {
    const login = await rawAdmin.post('/api/auth/login', { data: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!' } });
    expect(login.ok()).toBeTruthy();
  }
  const adminApi = withCsrf(rawAdmin);

  const org = await adminApi.post('/api/organizations', { data: { name: 'Health Org', slug: `health-org-${Date.now()}` } });
  const { organization } = await org.json();
  const proj = await adminApi.post('/api/projects', { data: { name: 'Health Project', organizationId: organization.id } });
  const { project } = await proj.json();

  await page.goto('/login');
  await page.locator('.login-field-email').fill('admin@rbac-pg.test');
  await page.locator('.login-field-password').fill('AdminPassword123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  await page.goto(`/deployments/projects/${project.id}`);
  const healthPanel = page.locator('.card', { has: page.getByText('Santé du workspace', { exact: true }) }).first();
  await healthPanel.scrollIntoViewIfNeeded();
  await expect(healthPanel.getByText('Aucun lien enregistré').first()).toBeVisible();
  await expect(healthPanel.getByText('Aucun incident ouvert', { exact: true })).toBeVisible();

  await adminApi.put(`/api/projects/${project.id}/doc-sites/docusaurus`, { data: { url: 'https://docs.health.test' } });
  await page.reload();
  const healthPanel2 = page.locator('.card', { has: page.getByText('Santé du workspace', { exact: true }) }).first();
  await healthPanel2.scrollIntoViewIfNeeded();
  await expect(healthPanel2.getByText('Lien Docusaurus enregistré', { exact: true })).toBeVisible();

  await rawAdmin.dispose();
});
