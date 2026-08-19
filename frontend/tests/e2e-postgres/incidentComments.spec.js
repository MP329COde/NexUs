import { test, expect } from '@playwright/test';

// Couvre les commentaires sur incident (Lot 23, todo.md item 30) : le
// backend existait déjà (incidentStore.js) mais sans interface. Vérifie
// le flux complet dans le navigateur.
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

test('commenter un incident depuis la fiche projet, journalisé dans l\'activité', async ({ page, playwright }) => {
  const rawAdmin = await playwright.request.newContext({ baseURL: 'http://localhost:4056' });
  const setup = await rawAdmin.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  });
  if (!setup.ok()) {
    const login = await rawAdmin.post('/api/auth/login', { data: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!' } });
    expect(login.ok()).toBeTruthy();
  }
  const adminApi = withCsrf(rawAdmin);

  const org = await adminApi.post('/api/organizations', { data: { name: 'Incident Org', slug: `incident-org-${Date.now()}` } });
  const { organization } = await org.json();
  const proj = await adminApi.post('/api/projects', { data: { name: 'Incident Project', organizationId: organization.id } });
  const { project } = await proj.json();
  const incident = await adminApi.post(`/api/projects/${project.id}/incidents`, { data: { title: 'API en erreur 500', severity: 'high' } });
  expect(incident.ok()).toBeTruthy();

  await page.goto('/login');
  await page.locator('.login-field-email').fill('admin@rbac-pg.test');
  await page.locator('.login-field-password').fill('AdminPassword123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  await page.goto(`/deployments/projects/${project.id}`);
  await page.locator('.pd-tabs .ui-tab', { hasText: 'Paramètres' }).click();
  await page.locator('.pd-row', { hasText: 'API en erreur 500' }).getByText('Commentaires', { exact: true }).click();
  await expect(page.locator('.modal-title', { hasText: 'API en erreur 500' })).toBeVisible();

  const modal = page.locator('.modal-card', { hasText: 'API en erreur 500' });
  await modal.locator('input[placeholder="Écrire un commentaire…"]').fill('Investigation en cours, cause identifiée.');
  await modal.getByRole('button', { name: 'Envoyer' }).click();
  await expect(modal.getByText('Investigation en cours, cause identifiée.', { exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  // Le panneau Activité d'équipe charge une fois au montage (pas
  // d'abonnement temps réel) — un rechargement de page reflète ce qu'un
  // vrai utilisateur reverrait en revenant sur la fiche projet.
  await page.reload();
  const activityPanel = page.locator('.card', { has: page.getByText("Activité d'équipe", { exact: true }) }).first();
  await activityPanel.scrollIntoViewIfNeeded();
  await expect(activityPanel.getByText('API en erreur 500', { exact: false })).toBeVisible();

  await rawAdmin.dispose();
});
