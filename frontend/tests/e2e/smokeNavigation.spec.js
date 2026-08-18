import { test, expect } from '@playwright/test';

// Passage large sur l'ensemble des pages de la console, indépendant de
// setup.spec.js (mode serial, mais fichiers différents = même backend
// jetable réutilisé au sein d'une même exécution `npx playwright test`).
// Deux objectifs distincts :
// 1. Chaque page se charge sans erreur JS non gérée (régression silencieuse
//    après un changement transverse comme le CSRF ou la révocation de
//    session, qui pourrait casser un appel API sur une page jamais testée).
// 2. Au moins une action d'écriture réelle par grande zone de l'app passe
//    par le vrai flux navigateur (cookie CSRF posé au login, en-tête
//    renvoyé par lib/apiClient.js) — pas seulement testée via l'API brute
//    comme le reste de la suite.
test.describe.configure({ mode: 'serial' });

const ADMIN_EMAIL = 'alex@nexus.lan';
const ADMIN_PASSWORD = 'SuperSecurePass123!';

async function login(page) {
  await page.goto('/login');
  await page.locator('.login-field-email').fill(ADMIN_EMAIL);
  await page.locator('.login-field-password').fill(ADMIN_PASSWORD);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/$/, { timeout: 10000 });
}

// Routes sans paramètre d'URL — celles avec :id (organizations/:id,
// projects/:id) sont déjà couvertes par ailleurs (setup.spec.js,
// rbac.spec.js) et nécessitent une entité existante pour être pertinentes.
const ROUTES = [
  '/deployments',
  '/deployments/catalog',
  '/deployments/templates',
  '/deployments/requests',
  '/deployments/projects',
  '/deployments/organizations',
  '/deployments/repos',
  '/deployments/reviews',
  '/deployments/pipelines',
  '/deployments/environments',
  '/deployments/releases',
  '/deployments/iac',
  '/deployments/tests',
  '/deployments/containers',
  '/deployments/images',
  '/deployments/secrets',
  '/deployments/supply-chain',
  '/infrastructure',
  '/infrastructure/hosts',
  '/kubernetes',
  '/kubernetes/services',
  '/kubernetes/terminal',
  '/network',
  '/network/proxies',
  '/network/services',
  '/network/haproxy',
  '/network/certificates',
  '/network/firewall',
  '/monitoring',
  '/security',
  '/storage',
  '/account',
  '/manual',
  '/report',
  '/settings'
];

test.describe('Smoke navigation — toutes les pages de la console', () => {
  test('chaque page se charge sans erreur JS non gérée', async ({ page }) => {
    // Seules les exceptions JS non gérées ('pageerror', typiquement un rendu
    // React qui plante) comptent comme une vraie régression. Le navigateur
    // logge aussi un console.error pour CHAQUE réponse HTTP non-2xx (429 du
    // rate-limiter sous 30 navigations rapides, 409/503/502 d'intégrations
    // non configurées en environnement de test) — du bruit attendu que
    // l'app gère déjà proprement (voir lib/apiClient.js : ces codes ne
    // déclenchent volontairement pas de toast), pas un signal de crash.
    const errors = [];
    page.on('pageerror', (err) => errors.push(`${page.url()} — ${err.message}`));

    await login(page);

    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.trim().length, `${route} : page vide`).toBeGreaterThan(0);
    }

    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('Actions d\'écriture réelles via le navigateur (CSRF de bout en bout)', () => {
  test('Réseaux internes : créer un VLAN depuis le formulaire', async ({ page }) => {
    await login(page);
    await page.goto('/network/services');
    await expect(page.getByRole('heading', { name: 'Réseaux internes' })).toBeVisible();

    const inputs = page.locator('.nsp-add-form input');
    await inputs.nth(0).fill('vlan-smoke-test'); // Nom
    await inputs.nth(1).fill('77'); // ID VLAN
    await inputs.nth(2).fill('10.10.77.0/24'); // CIDR

    await page.locator('.nsp-add-form button[type=submit]').click();
    await expect(page.getByText('vlan-smoke-test')).toBeVisible({ timeout: 10000 });
  });

  test('Mon compte : mettre à jour le profil', async ({ page }) => {
    await login(page);
    await page.goto('/account');
    const nameInput = page.locator('input').first();
    await nameInput.fill('Alexandre Lambert (smoke)');
    await page.getByRole('button', { name: 'Enregistrer le profil' }).click();
    await expect(page.getByText('Profil mis à jour')).toBeVisible({ timeout: 10000 });
  });
});
