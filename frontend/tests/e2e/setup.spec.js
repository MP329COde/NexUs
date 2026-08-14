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

// Isolation inter-projets au niveau API (pas seulement l'UI) : un
// collaborateur affecté à un seul projet ne doit jamais pouvoir lire ou
// modifier les ressources d'un autre projet, même en devinant son id. Placé
// dans ce fichier (plutôt qu'un fichier séparé) pour garantir qu'il s'exécute
// après la création de l'administrateur ci-dessus, dans le même groupe serial
// et le même backend jetable — l'ordre d'exécution entre fichiers de test
// n'est pas une garantie sur laquelle s'appuyer (mode serial déjà configuré
// pour tout le fichier en haut).
test.describe('Isolation inter-projets (API)', () => {
  let adminApi;
  let aliceApi;
  let bobApi;
  let projectAliceId;
  let projectBobId;

  test.beforeAll(async ({ playwright }) => {
    adminApi = await playwright.request.newContext({ baseURL: 'http://localhost:5199' });
    const login = await adminApi.post('/api/auth/login', { data: { email: 'alex@nexus.lan', password: 'SuperSecurePass123!' } });
    expect(login.ok()).toBeTruthy();
  });

  test.afterAll(async () => {
    await adminApi?.dispose();
    await aliceApi?.dispose();
    await bobApi?.dispose();
  });

  test("l'administrateur crée deux collaborateurs et un projet chacun", async () => {
    const alice = await adminApi.post('/api/users', {
      data: { email: 'alice@nexus.lan', password: 'AlicePassword1', name: 'Alice', role: 'user' }
    });
    expect(alice.ok()).toBeTruthy();
    const { user: aliceUser } = await alice.json();

    const bob = await adminApi.post('/api/users', {
      data: { email: 'bob@nexus.lan', password: 'BobPassword123', name: 'Bob', role: 'user' }
    });
    expect(bob.ok()).toBeTruthy();
    const { user: bobUser } = await bob.json();

    const projAlice = await adminApi.post('/api/projects', { data: { name: 'Projet Alice E2E', memberIds: [aliceUser.id] } });
    expect(projAlice.ok()).toBeTruthy();
    projectAliceId = (await projAlice.json()).project.id;

    const projBob = await adminApi.post('/api/projects', { data: { name: 'Projet Bob E2E', memberIds: [bobUser.id] } });
    expect(projBob.ok()).toBeTruthy();
    projectBobId = (await projBob.json()).project.id;
  });

  test('Alice ne voit que son propre projet dans la liste', async ({ playwright }) => {
    aliceApi = await playwright.request.newContext({ baseURL: 'http://localhost:5199' });
    const login = await aliceApi.post('/api/auth/login', { data: { email: 'alice@nexus.lan', password: 'AlicePassword1' } });
    expect(login.ok()).toBeTruthy();
    const res = await aliceApi.get('/api/projects');
    const { items } = await res.json();
    const ids = items.map((p) => p.id);
    expect(ids).toContain(projectAliceId);
    expect(ids).not.toContain(projectBobId);
  });

  test('Alice ne peut pas lire le projet de Bob par son id (404)', async () => {
    const res = await aliceApi.get(`/api/projects/${projectBobId}`);
    expect(res.status()).toBe(404);
  });

  test("Alice ne peut pas lire le coffre-fort du projet de Bob (404)", async () => {
    const res = await aliceApi.get(`/api/projects/${projectBobId}/vault`);
    expect(res.status()).toBe(404);
  });

  test('Alice ne peut pas créer de tâche dans le projet de Bob (404, pas de fuite d’existence)', async () => {
    const res = await aliceApi.post(`/api/projects/${projectBobId}/tasks`, { data: { title: 'intrusion' } });
    expect(res.status()).toBe(404);
  });

  test('Alice ne peut pas supprimer le projet de Bob (404)', async () => {
    const res = await aliceApi.delete(`/api/projects/${projectBobId}`);
    expect(res.status()).toBe(404);
  });

  test('Bob, symétriquement, ne peut pas accéder au projet d’Alice', async ({ playwright }) => {
    bobApi = await playwright.request.newContext({ baseURL: 'http://localhost:5199' });
    const login = await bobApi.post('/api/auth/login', { data: { email: 'bob@nexus.lan', password: 'BobPassword123' } });
    expect(login.ok()).toBeTruthy();
    const res = await bobApi.get(`/api/projects/${projectAliceId}`);
    expect(res.status()).toBe(404);
  });

  test('Alice peut travailler normalement sur son propre projet (tâches)', async () => {
    const create = await aliceApi.post(`/api/projects/${projectAliceId}/tasks`, { data: { title: 'Ma tâche' } });
    expect(create.ok()).toBeTruthy();
    const list = await aliceApi.get(`/api/projects/${projectAliceId}/tasks`);
    const { items } = await list.json();
    expect(items.some((t) => t.title === 'Ma tâche')).toBe(true);
  });

  test('un utilisateur non authentifié ne peut lire aucun projet (401)', async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: 'http://localhost:5199' });
    const res = await anon.get('/api/projects');
    expect(res.status()).toBe(401);
    await anon.dispose();
  });

  // Espace de travail projet (voir services/projectWorkspaceService.js) :
  // agrège les dépôts liés au projet sans jamais planter ni exposer de
  // données inventées quand la forge n'est pas configurée ou le dépôt
  // inaccessible — chaque entrée porte alors son propre champ `error`.
  test('le workspace d’un projet sans dépôt lié renvoie une liste vide honnête', async () => {
    const res = await aliceApi.get(`/api/projects/${projectAliceId}/workspace`);
    expect(res.ok()).toBeTruthy();
    const { repos } = await res.json();
    expect(repos).toEqual([]);
  });

  test('le workspace isole aussi les projets : Bob ne peut pas lire celui d’Alice', async () => {
    const res = await bobApi.get(`/api/projects/${projectAliceId}/workspace`);
    expect(res.status()).toBe(404);
  });

  test('un dépôt lié mais inaccessible (forge non configurée) remonte une erreur par entrée, sans faire échouer tout le workspace', async () => {
    const withRepo = await adminApi.post('/api/projects', {
      data: { name: 'Projet avec dépôt E2E', memberIds: [], repoKeys: ['gitlab:999999'] }
    });
    expect(withRepo.ok()).toBeTruthy();
    const { project } = await withRepo.json();
    const res = await adminApi.get(`/api/projects/${project.id}/workspace`);
    expect(res.ok()).toBeTruthy();
    const { repos } = await res.json();
    expect(repos).toHaveLength(1);
    expect(repos[0].key).toBe('gitlab:999999');
    expect(repos[0].error).toBeTruthy();
  });

  // Actions d'écriture depuis l'espace de travail (relance de pipeline,
  // approbation de revue) : le rôle projet ET l'appartenance du dépôt ciblé
  // au projet doivent être vérifiées — voir routes/projects.routes.js
  // assertRepoInProject(). Cette suite tourne sans DATABASE_URL (voir
  // playwright.config.js) : les projets restent donc sur le modèle legacy
  // (memberIds plat, tout membre a un accès complet équivalent à
  // "maintainer" — voir middleware/projectAccess.js). La distinction fine
  // developer/maintainer (le rôle maintainer+ requis pour approve) n'est
  // donc pas observable ici : elle est vérifiée manuellement avec un vrai
  // Postgres (voir le message du commit associé), pas par cette suite.
  test('Alice peut relancer un pipeline sur un dépôt de son projet (échoue proprement, GitLab non configuré)', async () => {
    const withRepo = await adminApi.put(`/api/projects/${projectAliceId}`, { data: { repoKeys: ['gitlab:42'] } });
    expect(withRepo.ok()).toBeTruthy();
    const res = await aliceApi.post(`/api/projects/${projectAliceId}/workspace/pipelines/gitlab:42:1/retry`);
    // Passe la garde RBAC + portée (dépôt bien rattaché) : l'échec vient
    // uniquement de GitLab non configuré dans cet environnement de test,
    // jamais d'un refus de droits.
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/GitLab non configuré/);
  });

  test('Alice ne peut pas relancer un pipeline sur un dépôt non rattaché à son projet (403, pas de fuite inter-projet)', async () => {
    const res = await aliceApi.post(`/api/projects/${projectAliceId}/workspace/pipelines/gitlab:999888:1/retry`);
    expect(res.status()).toBe(403);
  });

  test('Alice ne peut pas approuver de revue sur un dépôt non rattaché à son projet (403, pas de fuite inter-projet)', async () => {
    const res = await aliceApi.post(`/api/projects/${projectAliceId}/workspace/reviews/gitlab:999888:1/approve`);
    expect(res.status()).toBe(403);
  });

  test("Bob ne peut déclencher aucune action d'écriture sur le projet d'Alice", async () => {
    const res = await bobApi.post(`/api/projects/${projectAliceId}/workspace/pipelines/gitlab:42:1/retry`);
    expect(res.status()).toBe(404);
  });
});
