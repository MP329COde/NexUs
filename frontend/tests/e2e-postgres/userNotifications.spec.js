import { test, expect } from '@playwright/test';

// Couvre les notifications persistantes de développement (Lot 7) :
// contrairement à NotificationContext.jsx (toasts de session, perdus au
// rechargement), une notification "tâche assignée" doit survivre à une
// déconnexion/reconnexion de l'utilisateur concerné.
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
    post: async (url, opts = {}) => context.post(url, { ...opts, headers: { ...(opts.headers || {}), ...(await csrfHeaders()) } }),
    put: async (url, opts = {}) => context.put(url, { ...opts, headers: { ...(opts.headers || {}), ...(await csrfHeaders()) } })
  };
}

test.describe('Notifications persistantes de développement', () => {
  let adminApi;
  let bobEmail;
  let bobApi;
  let bobId;
  let projectId;
  let taskId;

  test.beforeAll(async ({ playwright }) => {
    const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
    const setup = await rawAdmin.post('/api/setup', {
      data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
    });
    if (!setup.ok()) {
      const login = await rawAdmin.post('/api/auth/login', { data: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!' } });
      expect(login.ok()).toBeTruthy();
    }
    adminApi = withCsrf(rawAdmin);

    bobEmail = `bob-notif-${Date.now()}@rbac-pg.test`;
    const bob = await adminApi.post('/api/users', { data: { email: bobEmail, password: 'BobPassword123!', name: 'Bob Notif', role: 'user', skipOnboarding: true } });
    expect(bob.ok()).toBeTruthy();
    bobId = (await bob.json()).user.id;

    const rawBob = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
    await rawBob.post('/api/auth/login', { data: { email: bobEmail, password: 'BobPassword123!' } });
    bobApi = withCsrf(rawBob);

    const org = await adminApi.post('/api/organizations', { data: { name: 'Notif Org', slug: `notif-org-${Date.now()}` } });
    const { organization } = await org.json();
    const proj = await adminApi.post('/api/projects', { data: { name: 'Notif Project', organizationId: organization.id } });
    const { project } = await proj.json();
    projectId = project.id;
    await adminApi.put(`/api/projects/${projectId}/members/${bobId}`, { data: { role: 'developer' } });

    const task = await adminApi.post(`/api/projects/${projectId}/tasks`, { data: { title: 'Tâche à assigner' } });
    taskId = (await task.json()).task.id;
  });

  test.afterAll(async () => {
    await adminApi?.dispose?.();
    await bobApi?.dispose?.();
  });

  test("Bob n'a aucune notification avant l'assignation", async () => {
    const res = await bobApi.get('/api/my-notifications');
    const { items } = await res.json();
    expect(items.some((n) => n.type === 'task.assigned')).toBe(false);
  });

  test('Assigner la tâche à Bob crée une notification persistante pour lui', async () => {
    const assign = await adminApi.put(`/api/projects/${projectId}/tasks/${taskId}`, { data: { assigneeId: bobId } });
    expect(assign.ok()).toBeTruthy();

    const res = await bobApi.get('/api/my-notifications');
    const { items, unreadCount } = await res.json();
    const notif = items.find((n) => n.type === 'task.assigned');
    expect(notif).toBeTruthy();
    expect(notif.message).toContain('Tâche à assigner');
    expect(unreadCount).toBeGreaterThan(0);
  });

  test('La notification reste après déconnexion/reconnexion (persistance réelle)', async ({ playwright }) => {
    const rawBob2 = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
    await rawBob2.post('/api/auth/login', { data: { email: bobEmail, password: 'BobPassword123!' } });
    const bobApi2 = withCsrf(rawBob2);
    const res = await bobApi2.get('/api/my-notifications');
    const { items } = await res.json();
    expect(items.some((n) => n.type === 'task.assigned')).toBe(true);
    await bobApi2.dispose?.();
  });

  test("S'assigner sa propre tâche ne crée pas de notification (pas de self-spam)", async () => {
    const task2 = await adminApi.post(`/api/projects/${projectId}/tasks`, { data: { title: 'Tâche 2' } });
    const task2Id = (await task2.json()).task.id;
    await bobApi.put(`/api/projects/${projectId}/tasks/${task2Id}`, { data: { assigneeId: bobId } });
    const res = await bobApi.get('/api/my-notifications');
    const { items } = await res.json();
    expect(items.filter((n) => n.type === 'task.assigned').length).toBe(1); // toujours celle du test précédent, pas 2
  });

  test('La cloche du header affiche la notification dans le navigateur', async ({ page }) => {
    await page.goto('/login');
    await page.locator('.login-field-email').fill(bobEmail);
    await page.locator('.login-field-password').fill('BobPassword123!');
    await page.locator('button[type=submit]').click();
    await page.waitForURL(/\/$/, { timeout: 10000 });

    await page.locator('.header-notif-btn').click();
    await expect(page.getByText('Tâche à assigner', { exact: false })).toBeVisible();
  });
});
