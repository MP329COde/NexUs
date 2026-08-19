import { test, expect } from '@playwright/test';

// Couvre Task → Code (Lot 21, todo.md items 25/48/50) : une tâche peut
// être liée à une branche/PR, affichée sur le backlog (vue liste).
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

test('lier une tâche à une branche depuis la fiche projet, affichée sur le backlog', async ({ page, playwright }) => {
  const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
  const setup = await rawAdmin.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  });
  if (!setup.ok()) {
    const login = await rawAdmin.post('/api/auth/login', { data: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!' } });
    expect(login.ok()).toBeTruthy();
  }
  const adminApi = withCsrf(rawAdmin);

  const org = await adminApi.post('/api/organizations', { data: { name: 'Link Org', slug: `link-org-${Date.now()}` } });
  const { organization } = await org.json();
  const proj = await adminApi.post('/api/projects', { data: { name: 'Link Project', organizationId: organization.id } });
  const { project } = await proj.json();
  const task = await adminApi.post(`/api/projects/${project.id}/tasks`, { data: { title: 'Corriger le bug de login' } });
  const { task: createdTask } = await task.json();
  expect(createdTask.branch).toBe('');

  await page.goto('/login');
  await page.locator('.login-field-email').fill('admin@rbac-pg.test');
  await page.locator('.login-field-password').fill('AdminPassword123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  await page.goto(`/deployments/projects/${project.id}`);
  await page.locator('.pd-tabs .ui-tab', { hasText: 'Travail' }).click();
  await page.locator('.pd-task-row', { hasText: 'Corriger le bug de login' }).locator('.pd-task-remove').first().click();
  await page.locator('input[placeholder="branche (ex. feature/ma-tache)"]').fill('fix/login-bug');
  await page.getByRole('button', { name: 'Enregistrer le lien' }).click();
  await page.waitForTimeout(300); // laisse le temps à la requête PUT + reload du backlog
  await page.keyboard.press('Escape');

  await expect(page.locator('.pd-task-row', { hasText: 'Corriger le bug de login' }).getByText('fix/login-bug', { exact: true })).toBeVisible();

  await rawAdmin.dispose();
});
