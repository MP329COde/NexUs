import { test, expect } from '@playwright/test';

// Étape 25 du plan (fais-tout-ce-que-misty-ullman.md) : chaîne Task → Code →
// Environnement de preview, exercée à travers les fonctionnalités ajoutées
// aux Lots 35-39 (colonnes d'environnement enrichies, page "Commencer à
// développer" avec CI/Previews, recherche globale de la Command Palette) —
// sans forge externe configurée dans cet environnement de dev, donc pas de
// vrai pipeline/PR de forge : uniquement les données réellement stockées en
// base par l'API (branche/URL de PR sur la tâche, environnement de preview
// avec sourceBranch), jamais une valeur inventée à l'écran.
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

test('Task → branche/PR → environnement de preview, visible sur la fiche projet, "Commencer à développer" et la Command Palette', async ({ page, playwright }) => {
  const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
  const setup = await rawAdmin.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  });
  if (!setup.ok()) {
    const login = await rawAdmin.post('/api/auth/login', { data: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!' } });
    expect(login.ok()).toBeTruthy();
  }
  const adminApi = withCsrf(rawAdmin);
  const me = await adminApi.get('/api/auth/me');
  const adminId = (await me.json()).user.id;

  const unique = Date.now();
  const org = await adminApi.post('/api/organizations', { data: { name: 'Chain Org', slug: `chain-org-${unique}` } });
  const { organization } = await org.json();
  const proj = await adminApi.post('/api/projects', { data: { name: `Chain Project ${unique}`, organizationId: organization.id } });
  const { project } = await proj.json();

  const taskRes = await adminApi.post(`/api/projects/${project.id}/tasks`, { data: { title: 'Ajouter le cache Redis', assigneeId: adminId } });
  const { task } = await taskRes.json();
  const branchName = `feature/redis-cache-${unique}`;
  const prUrl = `https://github.com/example/chain-repo/pull/${unique}`;
  const updated = await adminApi.put(`/api/projects/${project.id}/tasks/${task.id}`, { data: { branch: branchName, prUrl } });
  expect(updated.ok()).toBeTruthy();

  const envRes = await adminApi.post(`/api/projects/${project.id}/environments`, {
    data: { name: `preview-redis-${unique}`, kind: 'preview', sourceBranch: branchName, sourcePrUrl: prUrl }
  });
  expect(envRes.ok()).toBeTruthy();

  await page.goto('/login');
  await page.locator('.login-field-email').fill('admin@rbac-pg.test');
  await page.locator('.login-field-password').fill('AdminPassword123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  // Fiche projet : la tâche affiche son lien PR cliquable (chaîne Task→Code, Lot 33).
  await page.goto(`/deployments/projects/${project.id}`);
  await expect(page.getByRole('link', { name: 'PR' }).first()).toBeVisible();

  // "Commencer à développer" : la preview créée apparaît dans la nouvelle section CI & Previews (Lot 39).
  await page.goto(`/deployments/projects/${project.id}/getting-started`);
  await expect(page.getByText(`preview-redis-${unique}`, { exact: true }).first()).toBeVisible();

  // Command Palette (Lot 37/21) : l'environnement de preview est trouvable via la recherche globale.
  await page.keyboard.press('Meta+k');
  await page.locator('.cmdp-input').fill(`preview-redis-${unique}`);
  await expect(page.getByText(`${project.name} — preview-redis-${unique}`, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await rawAdmin.dispose();
});
