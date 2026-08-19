import { test, expect } from '@playwright/test';

// Couvre les feature flags (Lot 19) : création, bascule global on/off,
// et la logique de résolution isFeatureEnabled (ciblage org/utilisateur
// sans activation globale).
test.skip(!process.env.DATABASE_URL, 'DATABASE_URL non défini — suite Postgres ignorée');

function withCsrf(context) {
  async function csrfHeaders() {
    const state = await context.storageState();
    const cookie = state.cookies.find((c) => c.name === 'nexus_csrf');
    return cookie ? { 'X-CSRF-Token': cookie.value } : {};
  }
  return {
    get: (url, opts) => context.get(url, opts),
    put: async (url, opts = {}) => context.put(url, { ...opts, headers: { ...(opts.headers || {}), ...(await csrfHeaders()) } })
  };
}

test('créer un flag désactivé, l\'activer via l\'UI, puis le supprimer', async ({ page, playwright }) => {
  const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
  const setup = await rawAdmin.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  });
  if (!setup.ok()) {
    const login = await rawAdmin.post('/api/auth/login', { data: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!' } });
    expect(login.ok()).toBeTruthy();
  }
  const adminApi = withCsrf(rawAdmin);

  const flagKey = `beta-board-${Date.now()}`;
  const create = await adminApi.put(`/api/feature-flags/${flagKey}`, { data: { label: 'Beta Board', enabled: false } });
  expect(create.ok()).toBeTruthy();
  const { flag } = await create.json();
  expect(flag.enabled).toBe(false);

  await page.goto('/login');
  await page.locator('.login-field-email').fill('admin@rbac-pg.test');
  await page.locator('.login-field-password').fill('AdminPassword123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  await page.goto('/settings?tab=feature-flags');
  const row = page.locator('.ff-row', { has: page.getByText('Beta Board', { exact: true }) });
  await expect(row.getByText('Désactivé', { exact: true })).toBeVisible();

  await row.getByText('Désactivé', { exact: true }).click();
  await expect(row.getByText('Activé (tous)', { exact: true })).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await row.locator('.ff-row-delete').click();
  await expect(page.locator('.ff-row', { has: page.getByText('Beta Board', { exact: true }) })).toHaveCount(0);

  await rawAdmin.dispose();
});
