import { test, expect } from '@playwright/test';

// Couvre le socle relationnel (RBAC projet, garde de production) que
// tests/e2e/setup.spec.js ne peut pas exercer (DATABASE_URL y est
// volontairement absent). Ignoré proprement si DATABASE_URL n'est pas
// défini dans l'environnement qui a lancé `playwright test` — voir
// playwright.postgres.config.js pour la commande complète.
test.skip(!process.env.DATABASE_URL, 'DATABASE_URL non défini — suite Postgres ignorée');

test.describe.configure({ mode: 'serial' });

// Voir tests/e2e/setup.spec.js : un appel API direct (hors navigateur)
// n'attache jamais l'en-tête CSRF automatiquement, contrairement au
// frontend réel (lib/apiClient.js) — on le rejoue ici depuis le cookie
// nexus_csrf posé par le login.
function withCsrf(context) {
  async function csrfHeaders() {
    const state = await context.storageState();
    const cookie = state.cookies.find((c) => c.name === 'nexus_csrf');
    return cookie ? { 'X-CSRF-Token': cookie.value } : {};
  }
  return {
    get: (url, opts) => context.get(url, opts),
    post: async (url, opts = {}) => context.post(url, { ...opts, headers: { ...(opts.headers || {}), ...(await csrfHeaders()) } }),
    put: async (url, opts = {}) => context.put(url, { ...opts, headers: { ...(opts.headers || {}), ...(await csrfHeaders()) } }),
    delete: async (url, opts = {}) => context.delete(url, { ...opts, headers: { ...(opts.headers || {}), ...(await csrfHeaders()) } }),
    dispose: () => context.dispose()
  };
}

test.describe('RBAC relationnel et failles d\'autorisation corrigées', () => {
  let adminApi;
  let aliceApi;
  let bobApi;
  let projectId;
  let linkId;

  test.beforeAll(async ({ playwright }) => {
    const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
    const setup = await rawAdmin.post('/api/setup', {
      data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
    });
    expect(setup.ok()).toBeTruthy();
    adminApi = withCsrf(rawAdmin);

    const alice = await adminApi.post('/api/users', { data: { email: 'alice@rbac-pg.test', password: 'AlicePassword123!', name: 'Alice', role: 'user', skipOnboarding: true } });
    expect(alice.ok()).toBeTruthy();
    const bob = await adminApi.post('/api/users', { data: { email: 'bob@rbac-pg.test', password: 'BobPassword123!', name: 'Bob', role: 'user', skipOnboarding: true } });
    expect(bob.ok()).toBeTruthy();

    const rawAlice = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
    await rawAlice.post('/api/auth/login', { data: { email: 'alice@rbac-pg.test', password: 'AlicePassword123!' } });
    aliceApi = withCsrf(rawAlice);
    const rawBob = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
    await rawBob.post('/api/auth/login', { data: { email: 'bob@rbac-pg.test', password: 'BobPassword123!' } });
    bobApi = withCsrf(rawBob);

    const org = await adminApi.post('/api/organizations', { data: { name: 'RBAC Org', slug: `rbac-org-${Date.now()}` } });
    const { organization } = await org.json();
    const proj = await adminApi.post('/api/projects', { data: { name: 'RBAC Project', organizationId: organization.id } });
    const { project } = await proj.json();
    projectId = project.id;

    const link = await adminApi.post('/api/deployments', { data: { name: 'App', projectId, argocdAppName: 'rbac-test-app' } });
    expect(link.ok()).toBeTruthy();
    linkId = (await link.json()).link.id;
  });

  test.afterAll(async () => {
    await adminApi?.dispose();
    await aliceApi?.dispose();
    await bobApi?.dispose();
  });

  test('Bob (non-membre) : GET /projects ne contient pas le projet RBAC', async () => {
    const res = await bobApi.get('/api/projects');
    const { items } = await res.json();
    expect(items.some((p) => p.id === projectId)).toBe(false);
  });

  test('Bob (non-membre) : POST /deployments/:id/sync est refusé (403), pas une simple erreur ArgoCD', async () => {
    const res = await bobApi.post(`/api/deployments/${linkId}/sync`, { data: {} });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/maintainer/i);
  });

  test('Bob (non-membre) : DELETE /deployments/:id est refusé (403)', async () => {
    const res = await bobApi.delete(`/api/deployments/${linkId}`);
    expect(res.status()).toBe(403);
  });

  test('Bob (non-membre) : POST /pipelines/runs/:id/retry est réservé aux admins (403)', async () => {
    const res = await bobApi.post('/api/pipelines/runs/gitlab:1:2/retry');
    expect(res.status()).toBe(403);
  });

  test('Bob (non-membre) : POST /reviews/:key/approve est réservé aux admins (403)', async () => {
    const res = await bobApi.post('/api/reviews/gitlab:1:2/approve');
    expect(res.status()).toBe(403);
  });

  test('Bob (non-membre) : POST /reviews/:key/assign reste ouvert (bookkeeping local, pas la même classe de risque)', async () => {
    const res = await bobApi.post('/api/reviews/gitlab:1:2/assign');
    expect(res.ok()).toBeTruthy();
  });

  test('Admin : sync échoue proprement faute d\'ArgoCD configuré (409), jamais un 403 — la garde RBAC est bien passée', async () => {
    const res = await adminApi.post(`/api/deployments/${linkId}/sync`, { data: {} });
    expect(res.status()).toBe(409);
  });

  test('Un compte "developer" promu sur le projet peut sync (garde passée) mais pas rollback (owner requis)', async () => {
    const usersRes = await adminApi.get('/api/users');
    const { items: users } = await usersRes.json();
    const aliceId = users.find((u) => u.email === 'alice@rbac-pg.test').id;

    const promote = await adminApi.put(`/api/projects/${projectId}/members/${aliceId}`, { data: { role: 'maintainer' } });
    expect(promote.ok()).toBeTruthy();

    const sync = await aliceApi.post(`/api/deployments/${linkId}/sync`, { data: {} });
    expect(sync.status()).toBe(409); // garde passée, échoue seulement sur ArgoCD non configuré

    const rollback = await aliceApi.post(`/api/deployments/${linkId}/rollback`, { data: { historyId: 1 } });
    expect(rollback.status()).toBe(403);
    const body = await rollback.json();
    expect(body.error).toMatch(/owner/i);
  });

  // IDOR corrigé (audit sécurité, ÉTAPE 9/28) : PUT .../environments/:envId/link
  // et POST .../environments/:envId/provision-argocd-app ne vérifiaient pas
  // que :envId appartenait bien au projet de l'URL — un maintainer d'un
  // projet A pouvait manipuler le lien Argo CD d'un environnement d'un
  // projet B en devinant/énumérant son id, malgré loadProjectAccess() qui
  // n'autorise que le rôle sur A.
  test('SÉCURITÉ — un maintainer du projet A ne peut pas lier/provisionner un environnement du projet B via son id', async () => {
    const detail = await adminApi.get(`/api/projects/${projectId}`);
    const { project: fullProject } = await detail.json();

    const proj2 = await adminApi.post('/api/projects', { data: { name: 'RBAC Project 2 (autre projet)', organizationId: fullProject.orgId } });
    expect(proj2.ok()).toBeTruthy();
    const project2Id = (await proj2.json()).project.id;

    const envsRes = await adminApi.get(`/api/projects/${project2Id}/environments`);
    const { items: project2Envs } = await envsRes.json();
    const otherProjectEnvId = project2Envs[0].id; // "production" auto-créé avec le projet

    // Alice est maintainer sur `projectId` (test précédent) mais pas membre
    // de project2 : viser l'environnement de project2 DEPUIS l'URL de
    // projectId doit être refusé comme si l'environnement n'existait pas
    // pour ce projet, jamais accepté silencieusement.
    const link = await aliceApi.put(`/api/projects/${projectId}/environments/${otherProjectEnvId}/link`, { data: { argocdApp: 'stolen-app-name' } });
    expect(link.status()).toBe(404);

    const provision = await aliceApi.post(`/api/projects/${projectId}/environments/${otherProjectEnvId}/provision-argocd-app`, {
      data: { repoURL: 'https://github.com/org/repo.git', destinationNamespace: 'x' }
    });
    expect(provision.status()).toBe(404);

    // L'environnement de project2 n'a bien été modifié par aucune des deux
    // tentatives (pas seulement un 404 — vérifie qu'il n'y a pas eu d'effet
    // de bord avant le rejet).
    const unchanged = await adminApi.get(`/api/projects/${project2Id}/environments`);
    const { items: stillEnvs } = await unchanged.json();
    expect(stillEnvs.find((e) => e.id === otherProjectEnvId).argocd_app).toBeNull();
  });

  // Lien projet ↔ wiki d'organisation (voir ProjectDetailPage.jsx,
  // panneau Documentation) : jusqu'ici trois îlots de données séparés
  // (projets, wiki, runbook des incidents) sans lien dans l'UI, alors que
  // le backend supportait déjà un projectId optionnel sur une page wiki.
  // Vérifie le vrai flux dans le navigateur, pas seulement l'API : id
  // relationnel du projet (distinct du legacy id de l'URL) correctement
  // résolu et transmis au filtre wiki.
  test('le panneau Documentation du projet montre une page wiki qui lui est liée, et seulement celle-là', async ({ page }) => {
    const detail = await adminApi.get(`/api/projects/${projectId}`);
    const { project: fullProject } = await detail.json();
    expect(fullProject.orgId).toBeTruthy();
    expect(fullProject.relationalProjectId).toBeTruthy();

    const linked = await adminApi.post('/api/wiki', {
      data: { orgId: fullProject.orgId, projectId: fullProject.relationalProjectId, title: 'Runbook RBAC Project', content: 'procédure' }
    });
    expect(linked.ok()).toBeTruthy();
    const unrelated = await adminApi.post('/api/wiki', {
      data: { orgId: fullProject.orgId, title: 'Page générale sans projet', content: 'autre' }
    });
    expect(unrelated.ok()).toBeTruthy();

    await page.goto('/login');
    await page.locator('.login-field-email').fill('admin@rbac-pg.test');
    await page.locator('.login-field-password').fill('AdminPassword123!');
    await page.locator('button[type=submit]').click();
    await page.waitForURL(/\/$/, { timeout: 10000 });

    await page.goto(`/deployments/projects/${projectId}`);
    const docPanel = page.locator('.card', { has: page.getByText('Documentation', { exact: true }) }).first();
    await docPanel.scrollIntoViewIfNeeded();
    await expect(docPanel.getByText('Runbook RBAC Project')).toBeVisible();
    await expect(docPanel.getByText('Page générale sans projet')).toHaveCount(0);
  });
});
