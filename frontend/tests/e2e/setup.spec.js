import { test, expect } from '@playwright/test';

// La console de test démarre sans aucun utilisateur (voir playwright.config.js,
// NEXUS_DATA_DIR jetable + ADMIN_EMAIL vide). Les tests s'exécutent en série
// (fullyParallel: false) et partagent le même backend jetable. Le compte
// administrateur est désormais créé dès la fin de l'étape "Compte
// administrateur" (pas seulement à la soumission finale — voir SetupPage.jsx,
// next()) pour permettre de tester une vraie connexion de service pendant
// l'assistant : le test qui va au-delà de cette étape doit donc rester le
// DERNIER, tous les autres devant échouer la validation AVANT de la
// dépasser — une fois l'administrateur créé, /setup redirige vers /login
// pour tout le reste de l'exécution.

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

  test('parcourt les sept étapes et ouvre la console', async ({ page }) => {
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

    // Étape 3 — Connexion & identité : passée via "Configurer plus tard"
    // (étape optionnelle, sans validation), plutôt que "Continuer".
    await expect(page.getByRole('heading', { name: 'Connexion & identité' })).toBeVisible();
    await page.getByRole('button', { name: 'Configurer plus tard' }).click();

    // Étape 4 — Services Git
    await expect(page.getByRole('heading', { name: 'Services Git' })).toBeVisible();
    await page.getByRole('button', { name: 'Continuer' }).click();

    // Étape 5 — Services à connecter : le compte admin existe déjà à ce stade
    // (créé en fin d'étape 2), donc les panneaux d'intégration réels
    // (Kubernetes, GitLab, Proxmox...) sont utilisables et testables ici.
    await expect(page.getByRole('heading', { name: 'Services à connecter' })).toBeVisible();
    // Cert-Manager mentionne aussi "Kubernetes" dans son texte d'aide : on
    // cible la carte par son titre exact plutôt que par un texte substring.
    const k8sPanel = page.locator('.card').filter({ has: page.getByText('Kubernetes', { exact: true }) });
    await expect(k8sPanel).toBeVisible();
    // ".invalid" est réservé par la RFC 2606 : la résolution DNS échoue tout
    // de suite (rapide, déterministe), contrairement à une IP muette qui
    // expirerait au bout de longues secondes. Ceci vérifie qu'un VRAI appel
    // réseau est fait (échec attendu), pas un succès simulé — voir
    // kubernetesService.getStatus().
    await k8sPanel.getByLabel("URL du serveur API").fill('https://cluster.nexus-e2e.invalid:6443');
    await k8sPanel.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(k8sPanel.getByText('Configuré', { exact: true })).toBeVisible();
    await k8sPanel.getByText('Tester la connexion').click();
    await expect(k8sPanel.locator('text=/ENOTFOUND|EAI_AGAIN|getaddrinfo|injoignable|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|certificat|fetch failed/i')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Continuer' }).click();

    // Étape 6 — Outils à installer (Wazuh/Prometheus/Grafana/Gitea préselectionnés)
    await expect(page.getByRole('heading', { name: 'Outils à installer' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Wazuh/ })).toBeChecked();
    await page.getByRole('button', { name: 'Continuer' }).click();

    // Étape 7 — Prêt : récapitulatif puis ouverture
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
