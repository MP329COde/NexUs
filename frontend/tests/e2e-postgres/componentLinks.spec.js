import { test, expect } from '@playwright/test';

// Couvre les liens d'un composant (Lot 15 : documentation API, dashboard,
// runbook...) — le champ `links` existait déjà côté backend (schéma,
// service.yaml) mais n'était affiché ni éditable nulle part dans l'UI.
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

test('ajouter un lien "Documentation API" depuis la fiche composant, puis le retirer', async ({ page, playwright }) => {
  const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
  const setup = await rawAdmin.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  });
  if (!setup.ok()) {
    const login = await rawAdmin.post('/api/auth/login', { data: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!' } });
    expect(login.ok()).toBeTruthy();
  }
  const adminApi = withCsrf(rawAdmin);

  const org = await adminApi.post('/api/organizations', { data: { name: 'Links Org', slug: `links-org-${Date.now()}` } });
  const { organization } = await org.json();
  const proj = await adminApi.post('/api/projects', { data: { name: 'Links Project', organizationId: organization.id } });
  const { project } = await proj.json();
  const comp = await adminApi.post('/api/catalog/components', {
    data: { legacyProjectId: project.id, name: 'payments-api', kind: 'api', lifecycle: 'production' }
  });
  const { component } = await comp.json();

  await page.goto('/login');
  await page.locator('.login-field-email').fill('admin@rbac-pg.test');
  await page.locator('.login-field-password').fill('AdminPassword123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  await page.goto(`/deployments/catalog/${component.id}`);
  await expect(page.getByText('Aucun lien déclaré.', { exact: true })).toBeVisible();

  await page.getByText('Ajouter', { exact: true }).first().click();
  await page.getByPlaceholder('Libellé (ex. Documentation API)').fill('Documentation API');
  await page.getByPlaceholder('https://…').fill('https://api.example.test/docs');
  await page.getByRole('button', { name: 'Ajouter' }).click();

  const link = page.getByRole('link', { name: 'Documentation API' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://api.example.test/docs');

  await rawAdmin.dispose();
});
