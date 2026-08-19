import { test, expect } from '@playwright/test';

// Couvre l'activité d'équipe par projet (Lot 22, todo.md items 28/31) :
// créer une tâche puis une ADR journalise deux entrées distinctes,
// affichées dans l'ordre antéchronologique sur la fiche projet.
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

test('créer une tâche puis une ADR journalise deux entrées d\'activité, affichées sur la fiche projet', async ({ page, playwright }) => {
  const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
  const setup = await rawAdmin.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  });
  if (!setup.ok()) {
    const login = await rawAdmin.post('/api/auth/login', { data: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!' } });
    expect(login.ok()).toBeTruthy();
  }
  const adminApi = withCsrf(rawAdmin);

  const org = await adminApi.post('/api/organizations', { data: { name: 'Activity Org', slug: `activity-org-${Date.now()}` } });
  const { organization } = await org.json();
  const proj = await adminApi.post('/api/projects', { data: { name: 'Activity Project', organizationId: organization.id } });
  const { project } = await proj.json();

  await adminApi.post(`/api/projects/${project.id}/tasks`, { data: { title: 'Nettoyer le CI' } });
  await adminApi.post(`/api/projects/${project.id}/adrs`, { data: { title: 'Choix du cache' } });

  const activityRes = await adminApi.get(`/api/projects/${project.id}/activity`);
  const { items } = await activityRes.json();
  expect(items.length).toBe(2);
  expect(items[0].action).toBe('adr.create'); // le plus récent en premier
  expect(items[1].action).toBe('task.create');

  await page.goto('/login');
  await page.locator('.login-field-email').fill('admin@rbac-pg.test');
  await page.locator('.login-field-password').fill('AdminPassword123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  await page.goto(`/deployments/projects/${project.id}`);
  const panel = page.locator('.card', { has: page.getByText("Activité d'équipe", { exact: true }) }).first();
  await panel.scrollIntoViewIfNeeded();
  await expect(panel.getByText('Nettoyer le CI', { exact: false })).toBeVisible();
  await expect(panel.getByText('Choix du cache', { exact: false })).toBeVisible();

  await rawAdmin.dispose();
});
