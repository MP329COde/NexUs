import { test, expect } from '@playwright/test';

// Couvre les actions rapides globales du Command Center (Lot 11) :
// "Créer un projet"/"Créer une organisation" ouvrent directement le
// formulaire de la page cible (?open=create), sans exécuter l'action
// depuis la palette elle-même (convention déjà en place pour les actions
// contextuelles — voir contextualActions.js).
test.skip(!process.env.DATABASE_URL, 'DATABASE_URL non défini — suite Postgres ignorée');

test('Command Center : "Créer un projet" ouvre directement le formulaire sur la page Projets', async ({ page }) => {
  await page.request.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  }).catch(() => null);
  await page.context().clearCookies();

  await page.goto('/login');
  await page.locator('.login-field-email').fill('admin@rbac-pg.test');
  await page.locator('.login-field-password').fill('AdminPassword123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  await page.getByText('Command Center...', { exact: false }).click();
  await expect(page.getByText('Créer un projet', { exact: true })).toBeVisible();
  await page.getByText('Créer un projet', { exact: true }).click();

  await page.waitForURL(/\/deployments\/projects$/, { timeout: 10000 });
  await expect(page.locator('.modal-title', { hasText: 'Nouveau projet' })).toBeVisible();
});

test('Command Center : "Mon travail" et "Paramètres — Plugins" sont cherchables', async ({ page }) => {
  await page.goto('/login');
  await page.locator('.login-field-email').fill('admin@rbac-pg.test');
  await page.locator('.login-field-password').fill('AdminPassword123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  await page.getByText('Command Center...', { exact: false }).click();
  await page.locator('.cmdp-input').fill('mon travail');
  await expect(page.getByText('Mon travail', { exact: true })).toBeVisible();

  await page.locator('.cmdp-input').fill('plugins');
  await expect(page.getByText('Paramètres — Plugins', { exact: true })).toBeVisible();
});
