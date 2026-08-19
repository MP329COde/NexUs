import { test, expect } from '@playwright/test';

// Couvre le fil d'Ariane (Lot 9) : chaque niveau de contexte
// (Organisation → Développement → Projet) doit être affiché et cliquable
// sur la fiche projet, pour qu'on sache toujours "où on est".
test.skip(!process.env.DATABASE_URL, 'DATABASE_URL non défini — suite Postgres ignorée');

test('la fiche projet affiche un fil d\'Ariane Développement / Organisation / Projets / nom du projet, cliquable', async ({ page }) => {
  await page.request.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  }).catch(() => null);
  // Un /api/setup réussi émet directement un cookie de session (voir
  // issueSessionCookies dans routes/setup.routes.js), partagé avec la page
  // via le même contexte navigateur — sans ce nettoyage, page.goto('/login')
  // redirigerait aussitôt vers "/" (déjà authentifié) et jamais le
  // formulaire de connexion.
  await page.context().clearCookies();

  await page.goto('/login');
  await page.locator('.login-field-email').fill('admin@rbac-pg.test');
  await page.locator('.login-field-password').fill('AdminPassword123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  // page.request n'attache jamais l'en-tête CSRF automatiquement pour une
  // requête mutative (contrairement au frontend réel, lib/apiClient.js) —
  // on le relit ici depuis le cookie nexus_csrf posé par le login, comme
  // dans les autres fichiers *.spec.js de ce dossier.
  const csrfCookie = (await page.context().cookies()).find((c) => c.name === 'nexus_csrf');
  const csrfHeaders = csrfCookie ? { 'X-CSRF-Token': csrfCookie.value } : {};

  const orgRes = await page.request.post('/api/organizations', { data: { name: 'Breadcrumb Org', slug: `breadcrumb-org-${Date.now()}` }, headers: csrfHeaders });
  const { organization } = await orgRes.json();
  const projRes = await page.request.post('/api/projects', { data: { name: 'Breadcrumb Project', organizationId: organization.id }, headers: csrfHeaders });
  const { project } = await projRes.json();

  await page.goto(`/deployments/projects/${project.id}`);
  const crumbs = page.locator('.breadcrumbs');
  await expect(crumbs).toBeVisible();
  await expect(crumbs.getByText('Développement', { exact: true })).toBeVisible();
  // Le nom de l'organisation vient d'un second appel réseau (GET
  // /organizations/:id, déclenché seulement une fois GET /projects/:id
  // résolu) — laisse plus de marge que le timeout par défaut quand le
  // backend partagé est sous la charge du reste de la suite.
  await expect(crumbs.getByText('Breadcrumb Org', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(crumbs.getByText('Projets', { exact: true })).toBeVisible();
  await expect(crumbs.locator('.breadcrumbs-current')).toHaveText('Breadcrumb Project');

  await crumbs.getByText('Projets', { exact: true }).click();
  await page.waitForURL(/\/deployments\/projects$/, { timeout: 10000 });
});
