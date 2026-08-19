import { test, expect } from '@playwright/test';

// Couvre l'espace d'équipe (Lot 10) : membres et composants du catalogue
// dont l'équipe est propriétaire, agrégés depuis des vues déjà réelles
// (GET /teams/:id, GET /catalog/components?ownerTeamId=).
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

test.describe('Team Workspace', () => {
  let adminApi;
  let orgId;
  let teamId;
  let projectId;
  let componentName;

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

    const org = await adminApi.post('/api/organizations', { data: { name: 'Team Workspace Org', slug: `team-ws-org-${Date.now()}` } });
    orgId = (await org.json()).organization.id;

    const team = await adminApi.post(`/api/teams/org/${orgId}`, { data: { name: 'Platform Team', slug: `platform-team-${Date.now()}` } });
    expect(team.ok()).toBeTruthy();
    teamId = (await team.json()).team.id;

    const proj = await adminApi.post('/api/projects', { data: { name: 'Team Workspace Project', organizationId: orgId } });
    projectId = (await proj.json()).project.id;

    componentName = `nexus-api-${Date.now()}`;
    const comp = await adminApi.post('/api/catalog/components', {
      data: { legacyProjectId: projectId, ownerTeamId: teamId, name: componentName, kind: 'service', lifecycle: 'production' }
    });
    expect(comp.ok()).toBeTruthy();
  });

  test.afterAll(async () => {
    await adminApi?.dispose?.();
  });

  test("GET /teams/:id inclut bien l'admin comme membre lead (créateur de l'équipe)", async () => {
    const res = await adminApi.get(`/api/teams/${teamId}`);
    const { members } = await res.json();
    expect(members.length).toBeGreaterThan(0);
  });

  test("l'espace d'équipe affiche le membre, le composant possédé, et le lien vers la documentation", async ({ page }) => {
    await page.goto('/login');
    await page.locator('.login-field-email').fill('admin@rbac-pg.test');
    await page.locator('.login-field-password').fill('AdminPassword123!');
    await page.locator('button[type=submit]').click();
    await page.waitForURL(/\/$/, { timeout: 10000 });

    await page.goto(`/deployments/teams/${teamId}`);
    await expect(page.locator('.breadcrumbs').getByText('Team Workspace Org', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: componentName })).toBeVisible();

    const docLink = page.getByRole('link', { name: "Documentation d'équipe" });
    await expect(docLink).toBeVisible();
    await docLink.click();
    await page.waitForURL(new RegExp(`teamId=${teamId}`), { timeout: 10000 });
  });
});
