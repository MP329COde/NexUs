import { test, expect } from '@playwright/test';

// Couvre la séparation documentaire à trois paliers (Lot 6) : une page
// générale d'organisation, une page d'équipe et une page de projet restent
// bien isolées les unes des autres (GET /wiki sans filtre ne renvoie jamais
// les pages d'équipe/projet, et réciproquement) — plus les liens
// Docusaurus/Storybook enregistrés manuellement sur un projet.
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

test.describe('Documentation à trois paliers + liens Docusaurus/Storybook', () => {
  let adminApi;
  let orgId;
  let teamId;
  let projectId;
  let relationalProjectId;

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

    const org = await adminApi.post('/api/organizations', { data: { name: 'Docs Org', slug: `docs-org-${Date.now()}` } });
    orgId = (await org.json()).organization.id;

    const team = await adminApi.post(`/api/teams/org/${orgId}`, { data: { name: 'Platform', slug: `platform-${Date.now()}` } });
    expect(team.ok()).toBeTruthy();
    teamId = (await team.json()).team.id;

    const proj = await adminApi.post('/api/projects', { data: { name: 'Docs Project', organizationId: orgId } });
    const { project } = await proj.json();
    projectId = project.id;
    const detail = await adminApi.get(`/api/projects/${projectId}`);
    relationalProjectId = (await detail.json()).project.relationalProjectId;
    expect(relationalProjectId).toBeTruthy();
  });

  test.afterAll(async () => {
    await adminApi?.dispose?.();
  });

  test('trois pages (générale, équipe, projet) restent isolées par palier', async () => {
    const general = await adminApi.post('/api/wiki', { data: { orgId, title: 'Page générale' } });
    expect(general.ok()).toBeTruthy();
    const teamPage = await adminApi.post('/api/wiki', { data: { orgId, teamId, title: "Page d'équipe" } });
    expect(teamPage.ok()).toBeTruthy();
    const projectPage = await adminApi.post('/api/wiki', { data: { orgId, projectId: relationalProjectId, title: 'Page de projet' } });
    expect(projectPage.ok()).toBeTruthy();

    const generalList = await (await adminApi.get(`/api/wiki?orgId=${orgId}`)).json();
    expect(generalList.items.some((p) => p.title === 'Page générale')).toBe(true);
    expect(generalList.items.some((p) => p.title === "Page d'équipe")).toBe(false);
    expect(generalList.items.some((p) => p.title === 'Page de projet')).toBe(false);

    const teamList = await (await adminApi.get(`/api/wiki?orgId=${orgId}&teamId=${teamId}`)).json();
    expect(teamList.items.some((p) => p.title === "Page d'équipe")).toBe(true);
    expect(teamList.items.some((p) => p.title === 'Page générale')).toBe(false);

    const projectList = await (await adminApi.get(`/api/wiki?orgId=${orgId}&projectId=${relationalProjectId}`)).json();
    expect(projectList.items.some((p) => p.title === 'Page de projet')).toBe(true);
    expect(projectList.items.some((p) => p.title === "Page d'équipe")).toBe(false);
  });

  test('une page ne peut pas être rattachée à la fois à un projet et une équipe', async () => {
    const res = await adminApi.post('/api/wiki', { data: { orgId, teamId, projectId: relationalProjectId, title: 'Invalide' } });
    expect(res.status()).toBe(400);
  });

  test('lien Docusaurus/Storybook : enregistrement puis lecture', async () => {
    const put = await adminApi.put(`/api/projects/${projectId}/doc-sites/docusaurus`, {
      data: { url: 'https://docs.example.test', repoUrl: 'https://github.com/example/nexus-docs' }
    });
    expect(put.ok()).toBeTruthy();
    const list = await (await adminApi.get(`/api/projects/${projectId}/doc-sites`)).json();
    const docs = list.items.find((s) => s.kind === 'docusaurus');
    expect(docs.url).toBe('https://docs.example.test');
    expect(docs.repo_url).toBe('https://github.com/example/nexus-docs');
  });

  test('la page projet affiche le lien Docusaurus enregistré', async ({ page }) => {
    await page.goto('/login');
    await page.locator('.login-field-email').fill('admin@rbac-pg.test');
    await page.locator('.login-field-password').fill('AdminPassword123!');
    await page.locator('button[type=submit]').click();
    await page.waitForURL(/\/$/, { timeout: 10000 });

    await page.goto(`/deployments/projects/${projectId}`);
    await page.locator('.pd-tabs .ui-tab', { hasText: 'Documentation' }).click();
    const panel = page.locator('.card', { has: page.getByText('Documentation & Design System', { exact: true }) }).first();
    await panel.scrollIntoViewIfNeeded();
    await expect(panel.getByRole('link', { name: 'Ouvrir' }).first()).toBeVisible();
  });
});
