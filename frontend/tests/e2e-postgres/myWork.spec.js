import { test, expect } from '@playwright/test';

// Couvre la page "Mon travail" (Lot 4 : refonte de la navigation
// Développement) : une tâche assignée à l'utilisateur connecté doit
// apparaître, avec le nom du projet, et rediriger vers la fiche projet.
test.skip(!process.env.DATABASE_URL, 'DATABASE_URL non défini — suite Postgres ignorée');

test.describe.configure({ mode: 'serial' });

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

test.describe('Page "Mon travail"', () => {
  let adminApi;
  let projectId;
  let adminId;

  test.beforeAll(async ({ playwright }) => {
    // Backend partagé avec les autres fichiers *.spec.js de ce dossier —
    // mêmes identifiants de convention (voir rbac.spec.js).
    const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
    const setup = await rawAdmin.post('/api/setup', {
      data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
    });
    if (!setup.ok()) {
      const login = await rawAdmin.post('/api/auth/login', { data: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!' } });
      expect(login.ok()).toBeTruthy();
    }
    adminApi = withCsrf(rawAdmin);

    const me = await adminApi.get('/api/auth/me');
    adminId = (await me.json()).user.id;

    const org = await adminApi.post('/api/organizations', { data: { name: 'MyWork Org', slug: `mywork-org-${Date.now()}` } });
    const { organization } = await org.json();
    const proj = await adminApi.post('/api/projects', { data: { name: 'MyWork Project', organizationId: organization.id } });
    const { project } = await proj.json();
    projectId = project.id;

    const task = await adminApi.post(`/api/projects/${projectId}/tasks`, { data: { title: 'Tâche assignée à moi', assigneeId: adminId } });
    expect(task.ok()).toBeTruthy();
    await adminApi.post(`/api/projects/${projectId}/tasks`, { data: { title: 'Tâche non assignée' } });
  });

  test.afterAll(async () => {
    await adminApi?.dispose?.();
  });

  test('GET /projects/mine/tasks : ne renvoie que les tâches assignées à moi, avec le nom du projet', async () => {
    const res = await adminApi.get('/api/projects/mine/tasks');
    const { items } = await res.json();
    const mine = items.find((t) => t.title === 'Tâche assignée à moi');
    expect(mine).toBeTruthy();
    expect(mine.projectName).toBe('MyWork Project');
    expect(items.some((t) => t.title === 'Tâche non assignée')).toBe(false);
  });

  test('La page "Mon travail" affiche la tâche et redirige vers le projet au clic', async ({ page }) => {
    await page.goto('/login');
    await page.locator('.login-field-email').fill('admin@rbac-pg.test');
    await page.locator('.login-field-password').fill('AdminPassword123!');
    await page.locator('button[type=submit]').click();
    await page.waitForURL(/\/$/, { timeout: 10000 });

    await page.goto('/deployments/my-work');
    const row = page.locator('.mywork-row', { has: page.getByText('Tâche assignée à moi', { exact: true }) });
    await expect(row).toBeVisible();
    await expect(page.getByText('Tâche non assignée', { exact: true })).toHaveCount(0);

    await row.click();
    await page.waitForURL(new RegExp(`/deployments/projects/${projectId}$`), { timeout: 10000 });
  });
});
