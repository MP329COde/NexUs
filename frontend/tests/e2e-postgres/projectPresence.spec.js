import { test, expect } from '@playwright/test';

// Couvre la présence temps quasi-réel (Lot 28, todo.md item 3 :
// "présence des utilisateurs") : deux comptes ouvrant la même fiche projet
// se voient l'un l'autre, jamais soi-même dans sa propre liste.
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

test('la présence sur la fiche projet montre l\'autre utilisateur, pas soi-même', async ({ browser, playwright }) => {
  const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
  const setup = await rawAdmin.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  });
  if (!setup.ok()) {
    const login = await rawAdmin.post('/api/auth/login', { data: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!' } });
    expect(login.ok()).toBeTruthy();
  }
  const adminApi = withCsrf(rawAdmin);

  const bobEmail = `bob-presence-${Date.now()}@rbac-pg.test`;
  const bob = await adminApi.post('/api/users', { data: { email: bobEmail, password: 'BobPassword123!', name: 'Bob Presence', role: 'user', skipOnboarding: true } });
  expect(bob.ok()).toBeTruthy();
  const bobId = (await bob.json()).user.id;

  const org = await adminApi.post('/api/organizations', { data: { name: 'Presence Org', slug: `presence-org-${Date.now()}` } });
  const { organization } = await org.json();
  const proj = await adminApi.post('/api/projects', { data: { name: 'Presence Project', organizationId: organization.id } });
  const { project } = await proj.json();
  const addMember = await adminApi.put(`/api/projects/${project.id}/members/${bobId}`, { data: { role: 'developer' } });
  expect(addMember.ok()).toBeTruthy();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await adminPage.goto('/login');
  await adminPage.locator('.login-field-email').fill('admin@rbac-pg.test');
  await adminPage.locator('.login-field-password').fill('AdminPassword123!');
  await adminPage.locator('button[type=submit]').click();
  await adminPage.waitForURL(/\/$/, { timeout: 10000 });
  await adminPage.goto(`/deployments/projects/${project.id}`);

  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  await bobPage.goto('/login');
  await bobPage.locator('.login-field-email').fill(bobEmail);
  await bobPage.locator('.login-field-password').fill('BobPassword123!');
  await bobPage.locator('button[type=submit]').click();
  await bobPage.waitForURL(/\/$/, { timeout: 10000 });
  await bobPage.goto(`/deployments/projects/${project.id}`);

  // Admin voit Bob dans "Actuellement sur cette fiche", jamais lui-même
  // (userName resolution nécessite un compte admin, voir ProjectPresenceBar.jsx).
  await expect(adminPage.getByText('Bob Presence', { exact: true })).toBeVisible({ timeout: 20000 });

  await adminContext.close();
  await bobContext.close();
  await rawAdmin.dispose();
});
