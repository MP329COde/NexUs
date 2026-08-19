import { test, expect } from '@playwright/test';

// Couvre le Project Board (drag & drop) et les commentaires/mentions sur
// les tâches (Lot 8). Le drag & drop natif HTML5 n'est pas fiable à
// simuler via les événements souris standards de Playwright — ce test
// vérifie donc le changement de statut via le <select> déjà couvert
// ailleurs, et se concentre ici sur ce qui est spécifique à ce lot :
// bascule Liste/Tableau, présence des colonnes, commentaires, mentions.
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

test.describe('Project Board + commentaires/mentions', () => {
  let adminApi;
  let aliceEmail;
  let aliceUsername;
  let aliceId;
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

    aliceEmail = `alice-board-${Date.now()}@rbac-pg.test`;
    const alice = await adminApi.post('/api/users', { data: { email: aliceEmail, password: 'AlicePassword123!', name: 'Alice Board', role: 'user', skipOnboarding: true } });
    expect(alice.ok()).toBeTruthy();
    const aliceUser = (await alice.json()).user;
    aliceId = aliceUser.id;
    // username est optionnel côté backend (souvent absent) — le mention
    // handle se replie alors sur la partie locale de l'e-mail (voir
    // extractMentionedUserIds dans routes/projects.routes.js).
    aliceUsername = aliceEmail.split('@')[0];

    const org = await adminApi.post('/api/organizations', { data: { name: 'Board Org', slug: `board-org-${Date.now()}` } });
    const { organization } = await org.json();
    const proj = await adminApi.post('/api/projects', { data: { name: 'Board Project', organizationId: organization.id } });
    const { project } = await proj.json();
    projectId = project.id;
    await adminApi.put(`/api/projects/${projectId}/members/${aliceId}`, { data: { role: 'developer' } });

    const task = await adminApi.post(`/api/projects/${projectId}/tasks`, { data: { title: 'Tâche du tableau' } });
    taskId = (await task.json()).task.id;
  });

  test.afterAll(async () => {
    await adminApi?.dispose?.();
  });

  test('commenter avec une mention @alice notifie Alice, jamais soi-même', async () => {
    const comment = await adminApi.post(`/api/projects/${projectId}/tasks/${taskId}/comments`, {
      data: { text: `Peux-tu regarder ça @${aliceUsername} ?` }
    });
    expect(comment.ok()).toBeTruthy();

    const notifsRes = await adminApi.get('/api/my-notifications'); // vérifie d'abord qu'admin n'est pas notifié pour sa propre mention absente
    const adminNotifs = (await notifsRes.json()).items;
    expect(adminNotifs.some((n) => n.type === 'task.mention')).toBe(false);

    const list = await adminApi.get(`/api/projects/${projectId}/tasks/${taskId}/comments`);
    const { items } = await list.json();
    expect(items.some((c) => c.text.includes(`@${aliceUsername}`))).toBe(true);
  });

  test('Alice reçoit bien la notification de mention', async ({ playwright }) => {
    const rawAlice = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
    await rawAlice.post('/api/auth/login', { data: { email: aliceEmail, password: 'AlicePassword123!' } });
    const aliceApi = withCsrf(rawAlice);
    const res = await aliceApi.get('/api/my-notifications');
    const { items } = await res.json();
    expect(items.some((n) => n.type === 'task.mention')).toBe(true);
    await aliceApi.dispose?.();
  });

  test('la page projet affiche le tableau (colonnes) et les commentaires', async ({ page }) => {
    await page.goto('/login');
    await page.locator('.login-field-email').fill('admin@rbac-pg.test');
    await page.locator('.login-field-password').fill('AdminPassword123!');
    await page.locator('button[type=submit]').click();
    await page.waitForURL(/\/$/, { timeout: 10000 });

    await page.goto(`/deployments/projects/${projectId}`);
    await page.getByText('Tableau', { exact: true }).click();

    await expect(page.locator('.board-column-head', { hasText: 'Backlog' })).toBeVisible();
    await expect(page.locator('.board-column-head', { hasText: 'En cours' })).toBeVisible();
    const card = page.locator('.board-card', { hasText: 'Tâche du tableau' });
    await expect(card).toBeVisible();

    await card.locator('.board-card-comments').click();
    await expect(page.getByText(`Commentaires — Tâche du tableau`, { exact: false })).toBeVisible();
    await expect(page.getByText(`@${aliceUsername}`, { exact: false })).toBeVisible();
  });
});
