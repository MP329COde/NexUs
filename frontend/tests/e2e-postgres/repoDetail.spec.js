import { test, expect } from '@playwright/test';

// Couvre le routage du Repository Workspace (Lot 5). Aucune forge Git n'est
// configurée dans cet environnement de test (pas de GitLab/GitHub/Gitea
// réel à portée) — le test se limite donc honnêtement à ce qui est
// vérifiable sans intégration externe : la route se charge, et un dépôt
// inconnu affiche un état "introuvable" propre plutôt qu'un crash React.
test.skip(!process.env.DATABASE_URL, 'DATABASE_URL non défini — suite Postgres ignorée');

test('Repository Workspace : un dépôt inconnu affiche "introuvable" sans crash', async ({ page }) => {
  // Repli silencieux : /api/setup ne réussit qu'une fois par backend
  // partagé — un autre fichier *.spec.js de ce dossier l'a probablement
  // déjà fait avec ces mêmes identifiants de convention (voir rbac.spec.js).
  await page.request.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  }).catch(() => null);

  await page.goto('/login');
  await page.locator('.login-field-email').fill('admin@rbac-pg.test');
  await page.locator('.login-field-password').fill('AdminPassword123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  await page.goto('/deployments/repos/gitlab%3A999999');
  await expect(page.getByText('Dépôt introuvable.', { exact: true })).toBeVisible();
});
