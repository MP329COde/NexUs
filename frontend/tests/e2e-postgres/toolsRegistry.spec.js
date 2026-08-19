import { test, expect } from '@playwright/test';

// Couvre la séparation Outils intégrés / Outils externes sur "Accès aux
// outils" (Lot 17, todo.md item 22 : "Elle mélange actuellement
// intégrations connectées et raccourcis externes").
test.skip(!process.env.DATABASE_URL, 'DATABASE_URL non défini — suite Postgres ignorée');

test('un raccourci externe ajouté apparaît sous "Outils externes", jamais parmi les outils intégrés', async ({ page }) => {
  await page.request.post('/api/setup', {
    data: { organisation: { consoleName: 'RBAC PG Test' }, admin: { email: 'admin@rbac-pg.test', password: 'AdminPassword123!', name: 'Admin' } }
  }).catch(() => null);

  await page.goto('/login');
  await page.locator('.login-field-email').fill('admin@rbac-pg.test');
  await page.locator('.login-field-password').fill('AdminPassword123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  await page.goto('/deployments');
  await expect(page.getByText('Outils intégrés', { exact: true })).toBeVisible();
  await expect(page.getByText('Outils externes (raccourcis manuels)', { exact: true })).toBeVisible();

  await page.getByText('Ajouter un raccourci', { exact: true }).click();
  await page.locator('input[placeholder="SonarQube"]').fill('SonarQube Lab');
  await page.locator('input[placeholder="https://sonar.lab.local"]').fill('https://sonar.example.test');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();

  const externalSection = page.locator('h2', { hasText: 'Outils externes' }).locator('xpath=following-sibling::*[1]');
  await expect(externalSection.getByText('SonarQube Lab', { exact: true })).toBeVisible();

  const integratedSection = page.locator('.tools-category-grid');
  await expect(integratedSection.getByText('SonarQube Lab', { exact: true })).toHaveCount(0);
});
