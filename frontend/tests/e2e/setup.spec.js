import { test, expect } from '@playwright/test';

// La console de test démarre sans aucun utilisateur (voir playwright.config.js,
// NEXUS_DATA_DIR jetable + ADMIN_EMAIL vide). Les tests s'exécutent en série
// (fullyParallel: false) et partagent le même backend jetable : la soumission
// complète, qui crée le premier administrateur, doit donc rester le DERNIER
// test — une fois l'administrateur créé, /setup redirige vers /login pour
// tout le reste de l'exécution.

test.describe.configure({ mode: 'serial' });

test.describe("Assistant de configuration initiale", () => {
  test('redirige vers /setup tant qu’aucun administrateur n’existe', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByRole('heading', { name: 'Organisation' })).toBeVisible();
  });

  test('refuse un mot de passe trop court et des mots de passe différents', async ({ page }) => {
    await page.goto('/setup');
    await page.getByRole('button', { name: 'Continuer' }).click(); // étape 1 -> 2

    await page.getByLabel('Nom complet').fill('Test Admin');
    await page.getByLabel('Adresse électronique').fill('test@nexus.lan');
    await page.getByLabel('Mot de passe initial').fill('short');
    await page.getByLabel('Confirmation').fill('short');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByText('au moins 8 caractères')).toBeVisible();

    await page.getByLabel('Mot de passe initial').fill('LongEnoughPassword1');
    await page.getByLabel('Confirmation').fill('DoesNotMatch1');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByText('ne correspondent pas')).toBeVisible();
  });

  test('le compte administrateur est obligatoire (pas de "Configurer plus tard")', async ({ page }) => {
    await page.goto('/setup');
    await page.getByRole('button', { name: 'Continuer' }).click(); // étape 1 -> 2
    await expect(page.getByRole('heading', { name: 'Compte administrateur' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Configurer plus tard' })).toHaveCount(0);
  });

  test('permet de passer une étape optionnelle via "Configurer plus tard"', async ({ page }) => {
    await page.goto('/setup');
    await page.getByRole('button', { name: 'Continuer' }).click(); // 1 -> 2
    await page.getByLabel('Nom complet').fill('Alex');
    await page.getByLabel('Adresse électronique').fill('skip@nexus.lan');
    await page.getByLabel('Mot de passe initial').fill('SuperSecurePass123!');
    await page.getByLabel('Confirmation').fill('SuperSecurePass123!');
    await page.getByRole('button', { name: 'Continuer' }).click(); // 2 -> 3
    await expect(page.getByRole('heading', { name: 'Connexion & identité' })).toBeVisible();
    await page.getByRole('button', { name: 'Configurer plus tard' }).click(); // 3 -> 4 sans validation
    await expect(page.getByRole('heading', { name: 'Services Git' })).toBeVisible();
  });

  test('parcourt les six étapes et ouvre la console', async ({ page }) => {
    await page.goto('/setup');

    // Étape 1 — Organisation
    await expect(page.getByRole('heading', { name: 'Organisation' })).toBeVisible();
    await page.getByLabel("Nom de l'organisation").fill('Nexus Lab');
    await page.getByLabel("URL de l'instance").fill('https://console.nexus.lan');
    await page.getByLabel('Adresse de contact').fill('ops@nexus.lan');
    await page.getByRole('button', { name: 'Continuer' }).click();

    // Étape 2 — Compte administrateur
    await expect(page.getByRole('heading', { name: 'Compte administrateur' })).toBeVisible();
    await page.getByLabel('Nom complet').fill('Alexandre Lambert');
    await page.getByLabel('Identifiant').fill('alex.lambert');
    await page.getByLabel('Adresse électronique').fill('alex@nexus.lan');
    await page.getByLabel('Mot de passe initial').fill('SuperSecurePass123!');
    await page.getByLabel('Confirmation').fill('SuperSecurePass123!');
    await page.getByRole('button', { name: 'Continuer' }).click();

    // Étape 3 — Connexion & identité (valeurs par défaut acceptées)
    await expect(page.getByRole('heading', { name: 'Connexion & identité' })).toBeVisible();
    await page.getByRole('button', { name: 'Continuer' }).click();

    // Étape 4 — Services Git
    await expect(page.getByRole('heading', { name: 'Services Git' })).toBeVisible();
    await page.getByRole('button', { name: 'Continuer' }).click();

    // Étape 5 — Outils à connecter (Wazuh/Prometheus/Grafana/Gitea préselectionnés)
    await expect(page.getByRole('heading', { name: 'Outils à connecter' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Wazuh/ })).toBeChecked();
    await page.getByRole('button', { name: 'Continuer' }).click();

    // Étape 6 — Prêt : récapitulatif puis ouverture
    await expect(page.getByRole('heading', { name: 'Prêt' })).toBeVisible();
    await expect(page.getByText('Alexandre Lambert · alex@nexus.lan')).toBeVisible();
    await page.getByRole('button', { name: 'Ouvrir la console' }).click();

    // La console s'ouvre directement (session posée par POST /api/setup)
    // et /setup redirige désormais vers /login pour un nouvel administrateur.
    await expect(page).toHaveURL(/\/$/, { timeout: 10000 });
    await expect(page.getByText('Vue générale').first()).toBeVisible();

    await page.goto('/setup');
    await expect(page).toHaveURL(/\/(login)?$/);
  });
});
