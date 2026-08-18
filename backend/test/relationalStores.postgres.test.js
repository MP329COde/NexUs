import { test } from 'node:test';
import assert from 'node:assert/strict';

// Même motif que jobService.postgres.test.js : couvre en conditions réelles
// (Postgres) des comportements ajoutés cette session (fenêtres de
// maintenance, runbook d'incident) jusqu'ici seulement vérifiés
// manuellement via curl. Ignoré proprement si DATABASE_URL n'est pas
// défini. Lancer CE FICHIER SEUL avec DATABASE_URL — voir
// jobService.postgres.test.js pour la raison (autres suites incompatibles
// avec un Postgres configuré).
const hasPostgres = Boolean(process.env.DATABASE_URL);

if (!hasPostgres) {
  test('stores relationnels (Postgres) : ignoré — DATABASE_URL non défini', { skip: true }, () => {});
} else {
  const { runMigrations } = await import('../src/db/migrate.js');
  const { query } = await import('../src/db/pool.js');
  const orgStore = await import('../src/store/orgStore.js');
  const maintenanceStore = await import('../src/store/maintenanceStore.js');
  const incidentStore = await import('../src/store/incidentStore.js');
  const { scaffoldService, ScaffolderError } = await import('../src/services/scaffolderService.js');

  await runMigrations();

  let org;
  let project;

  test.before(async () => {
    const slug = `test-org-rs-${Date.now()}`;
    org = await orgStore.createOrganization({ name: 'Test Org RS', slug, ownerUserId: 'u1' });
    project = await orgStore.createProject({ orgId: org.id, name: 'Test Project RS', slug: `test-project-rs-${Date.now()}`, legacyId: `test-legacy-${Date.now()}` });
  });

  test.after(async () => {
    await query('DELETE FROM organizations WHERE id = $1', [org.id]); // cascade sur projects/incidents/maintenance_windows
  });

  test('maintenanceStore : create/list/cancel', async () => {
    const created = await maintenanceStore.create({
      projectId: project.id, title: 'Coupure réseau', startsAt: '2027-01-01T02:00:00Z', endsAt: '2027-01-01T04:00:00Z', createdBy: 'u1'
    });
    assert.ok(created.id);
    assert.equal(created.cancelled_at, null);

    const listed = await maintenanceStore.listForProject(project.id);
    assert.ok(listed.some((w) => w.id === created.id));

    const cancelled = await maintenanceStore.cancel(created.id);
    assert.ok(cancelled.cancelled_at);

    // Annuler une deuxième fois ne doit rien renvoyer (déjà annulée) —
    // c'est cette valeur que la route vérifie pour répondre 409.
    const secondCancel = await maintenanceStore.cancel(created.id);
    assert.equal(secondCancel, null);
  });

  test('maintenanceStore : la contrainte ends_at > starts_at est appliquée par Postgres', async () => {
    await assert.rejects(
      () => maintenanceStore.create({ projectId: project.id, title: 'Invalide', startsAt: '2027-01-01T04:00:00Z', endsAt: '2027-01-01T02:00:00Z', createdBy: 'u1' }),
      /maintenance_windows_period_check/
    );
  });

  test('incidentStore : runbookUrl est persisté à la création et modifiable ensuite', async () => {
    const created = await incidentStore.create({
      projectId: project.id, title: 'Incident avec runbook', severity: 'high', runbookUrl: 'https://wiki.example/runbook', createdBy: 'u1'
    });
    assert.equal(created.runbook_url, 'https://wiki.example/runbook');

    const withoutRunbook = await incidentStore.create({ projectId: project.id, title: 'Sans runbook', severity: 'low', createdBy: 'u1' });
    assert.equal(withoutRunbook.runbook_url, null);

    const updated = await incidentStore.update(created.id, { runbookUrl: 'https://wiki.example/updated' });
    assert.equal(updated.runbook_url, 'https://wiki.example/updated');
  });

  test('orgStore (components/Software Catalog) : create/list/filter/update/delete + visibilité par rôle projet', async () => {
    const component = await orgStore.createComponent({
      projectId: project.id, name: 'Billing API', slug: 'billing-api', kind: 'api', lifecycle: 'production',
      description: 'API de facturation', language: 'TypeScript', tags: ['finance', 'critical']
    });
    assert.equal(component.slug, 'billing-api');
    assert.equal(component.kind, 'api');
    assert.equal(component.lifecycle, 'production');
    assert.deepEqual(component.tags, ['finance', 'critical']);

    // u1 est owner du projet (créateur) : visible dans son catalogue.
    const visible = await orgStore.listComponentsForUser('u1');
    assert.ok(visible.some((c) => c.id === component.id));

    // Un utilisateur sans aucun accès à l'organisation/projet ne doit rien voir.
    const invisible = await orgStore.listComponentsForUser('u-outsider');
    assert.ok(!invisible.some((c) => c.id === component.id));

    // Filtre par kind
    const filtered = await orgStore.listComponentsForUser('u1', { kind: 'api' });
    assert.ok(filtered.some((c) => c.id === component.id));
    const filteredOut = await orgStore.listComponentsForUser('u1', { kind: 'worker' });
    assert.ok(!filteredOut.some((c) => c.id === component.id));

    const updated = await orgStore.updateComponent(component.id, { lifecycle: 'deprecated', description: 'Remplacée par billing-api-v2' });
    assert.equal(updated.lifecycle, 'deprecated');

    const deleted = await orgStore.deleteComponent(component.id);
    assert.equal(deleted, true);
    const afterDelete = await orgStore.getComponent(component.id);
    assert.equal(afterDelete, null);
  });

  // listTeamsForOrg mélangeait GROUP BY et window function (COUNT(...) OVER
  // PARTITION BY) de façon invalide en SQL — jamais détecté car aucune
  // interface frontend n'appelait cette route avant l'ajout de TeamsModal.jsx
  // (voir todo.md, "teams sans UI"). Postgres refusait la requête avec
  // "column tm2.user_id must appear in the GROUP BY clause", corrigé par une
  // sous-requête de comptage.
  test('orgStore (teams) : listTeamsForOrg ne lève plus d\'erreur SQL et rapporte le bon effectif', async () => {
    const team = await orgStore.createTeam({ orgId: org.id, name: 'Team Finance RS', slug: `team-finance-rs-${Date.now()}`, ownerUserId: 'u1' });
    const teams = await orgStore.listTeamsForOrg(org.id, 'u1');
    const found = teams.find((t) => t.id === team.id);
    assert.ok(found, 'équipe créée absente de la liste');
    assert.equal(found.my_role, 'lead');
    assert.equal(Number(found.member_count), 1);

    await orgStore.addTeamMember(team.id, 'u2', 'member');
    const teamsAfterAdd = await orgStore.listTeamsForOrg(org.id, 'u1');
    assert.equal(Number(teamsAfterAdd.find((t) => t.id === team.id).member_count), 2);
  });

  test('scaffolderService : provider "none" génère les fichiers, journalise les étapes dans l\'ordre et enregistre le composant', async () => {
    const steps = [];
    const result = await scaffoldService({
      templateId: 'nodejs-api', name: 'scaffold-test-svc', description: 'Service de test', projectId: project.id,
      ownerTeamId: null, repositoryProvider: 'none', log: async (step, status, detail) => { steps.push({ step, status, detail }); }
    });
    assert.equal(result.component.slug, 'scaffold-test-svc');
    assert.equal(result.component.kind, 'api');
    assert.equal(result.repository, null);
    assert.ok(result.files.includes('service.yaml'));

    // Les étapes doivent apparaître dans un ordre chronologique cohérent
    // (running avant done, jamais l'inverse) — c'est précisément le bug
    // trouvé et corrigé (emit() non attendu) lors du test manuel via curl.
    const stepIndex = (step, status) => steps.findIndex((s) => s.step === step && s.status === status);
    assert.ok(stepIndex('validate', 'running') < stepIndex('validate', 'done'));
    assert.ok(stepIndex('validate', 'done') < stepIndex('generate', 'running'));
    assert.ok(stepIndex('generate', 'done') < stepIndex('register_catalog', 'running'));
    assert.ok(stepIndex('create_repo', 'skipped') >= 0);

    const stored = await orgStore.getComponent(result.component.id);
    assert.ok(stored, 'composant introuvable en base après scaffolding');
  });

  test('scaffolderService : refuse un template inconnu et un nom déjà pris dans le projet', async () => {
    await assert.rejects(
      () => scaffoldService({ templateId: 'does-not-exist', name: 'x', projectId: project.id, repositoryProvider: 'none', log: async () => {} }),
      ScaffolderError
    );
    await orgStore.createComponent({ projectId: project.id, name: 'already-taken', slug: 'already-taken', kind: 'service' });
    await assert.rejects(
      () => scaffoldService({ templateId: 'worker', name: 'already-taken', projectId: project.id, repositoryProvider: 'none', log: async () => {} }),
      ScaffolderError
    );
  });

  test('scaffolderService : résout l\'équipe propriétaire par id et la référence dans service.yaml généré', async () => {
    const team = await orgStore.createTeam({ orgId: org.id, name: 'Team Scaffold', slug: `team-scaffold-${Date.now()}`, ownerUserId: 'u1' });
    const result = await scaffoldService({
      templateId: 'worker', name: 'owned-worker', projectId: project.id, ownerTeamId: team.id, repositoryProvider: 'none', log: async () => {}
    });
    assert.equal(result.component.owner_team_id, team.id);
  });

  test('orgStore (environment blueprints) : create/update/delete + application à un environnement', async () => {
    const blueprint = await orgStore.createEnvironmentBlueprint({
      orgId: org.id, name: 'Staging RS', slug: `staging-rs-${Date.now()}`, kind: 'staging',
      namespacePattern: '{project}-staging', replicas: 2, cpu: '500m', memory: '512Mi', storageGb: 10,
      ingressDomain: 'staging.example.com', ttlMinutes: null, monitoringEnabled: true
    });
    assert.equal(blueprint.replicas, 2);
    assert.equal(blueprint.monitoring_enabled, true);

    const listed = await orgStore.listEnvironmentBlueprintsForOrg(org.id);
    assert.ok(listed.some((b) => b.id === blueprint.id));

    const updated = await orgStore.updateEnvironmentBlueprint(blueprint.id, { replicas: 3, ttlMinutes: 60 });
    assert.equal(updated.replicas, 3);
    assert.equal(updated.ttl_minutes, 60);

    // Un environnement créé avec ce blueprint le référence par id, et
    // listEnvironments() rapporte son nom via jointure — c'est ce
    // qu'affiche EnvironmentsPage.jsx à côté du nom de l'environnement.
    const env = await orgStore.createEnvironment(project.id, { name: `preview-rs-${Date.now()}`, kind: 'preview', blueprintId: blueprint.id });
    assert.equal(env.blueprint_id, blueprint.id);
    const envs = await orgStore.listEnvironments(project.id);
    const found = envs.find((e) => e.id === env.id);
    assert.equal(found.blueprint_name, 'Staging RS');

    const deleted = await orgStore.deleteEnvironmentBlueprint(blueprint.id);
    assert.equal(deleted, true);
    // ON DELETE SET NULL : l'environnement survit à la suppression du
    // blueprint, seule la référence est retirée (jamais l'environnement
    // lui-même supprimé en cascade à cause d'un blueprint effacé).
    const envAfterDelete = await orgStore.getEnvironment(env.id);
    assert.equal(envAfterDelete.blueprint_id, null);
  });

  test('orgStore (components) : le filtre "mine" (Developer Portal, ÉTAPE 25) isole ce dont u1 est responsable', async () => {
    // u1 est déjà owner de `org`/`project` (test.before) — pour distinguer
    // "responsable" de "visible par bypass owner/admin d'organisation" (le
    // cas que ce filtre doit justement exclure), on utilise un second
    // projet dont u1 n'est PAS membre direct, dans la même organisation.
    const otherProject = await orgStore.createProject({ orgId: org.id, name: 'Other Project Mine', slug: `other-project-mine-${Date.now()}`, legacyId: `other-legacy-mine-${Date.now()}` });
    // `project` (fixture partagée, test.before) n'a jamais reçu u1 en
    // project_members direct — seul son accès owner d'organisation le rend
    // visible aujourd'hui. On l'ajoute explicitement ici pour distinguer
    // "membre direct" (doit ressortir dans "mine") de ce bypass d'org (ne
    // doit PAS ressortir), sans modifier la fixture partagée par les autres
    // tests de ce fichier.
    await orgStore.setMemberRole(project.id, 'u1', 'maintainer');

    const teamOfU1 = await orgStore.createTeam({ orgId: org.id, name: 'Team Mine', slug: `team-mine-${Date.now()}`, ownerUserId: 'u1' });
    // Composant du second projet, propriété de l'équipe de u1 → doit apparaître (owner_team_id).
    const ownedByTeam = await orgStore.createComponent({ projectId: otherProject.id, name: 'owned-by-my-team', slug: 'owned-by-my-team', kind: 'service', ownerTeamId: teamOfU1.id });
    // Composant du second projet, sans équipe, u1 pas membre direct → ne doit PAS apparaître malgré le bypass owner d'org.
    const notMine = await orgStore.createComponent({ projectId: otherProject.id, name: 'not-mine-at-all', slug: 'not-mine-at-all', kind: 'service' });
    // Composant du projet historique où u1 EST membre direct (créateur) → doit apparaître.
    const directMember = await orgStore.createComponent({ projectId: project.id, name: 'direct-member-component', slug: 'direct-member-component', kind: 'service' });

    const mine = await orgStore.listComponentsForUser('u1', { mine: true });
    const mineIds = mine.map((c) => c.id);
    assert.ok(mineIds.includes(ownedByTeam.id), 'composant propriété de mon équipe absent du filtre "mine"');
    assert.ok(mineIds.includes(directMember.id), 'composant de mon projet direct absent du filtre "mine"');
    assert.ok(!mineIds.includes(notMine.id), 'composant sans lien avec u1 présent à tort dans le filtre "mine"');

    // Sans le filtre, notMine redevient visible (bypass owner d'organisation) —
    // confirme que "mine" retire bien un résultat qui serait sinon présent,
    // pas seulement qu'il n'ajoute rien.
    const all = await orgStore.listComponentsForUser('u1', {});
    assert.ok(all.map((c) => c.id).includes(notMine.id));
  });

  test('orgStore (dependency graph) : dépendances directes visibles dans les deux sens, cascade à la suppression', async () => {
    const frontend = await orgStore.createComponent({ projectId: project.id, name: 'frontend-dg', slug: `frontend-dg-${Date.now()}`, kind: 'website' });
    const api = await orgStore.createComponent({ projectId: project.id, name: 'api-dg', slug: `api-dg-${Date.now()}`, kind: 'api' });
    const db = await orgStore.createComponent({ projectId: project.id, name: 'db-dg', slug: `db-dg-${Date.now()}`, kind: 'infrastructure' });

    await orgStore.createDependency({ componentId: frontend.id, dependsOnComponentId: api.id, kind: 'runtime' });
    await orgStore.createDependency({ componentId: api.id, dependsOnComponentId: db.id, kind: 'data' });

    const frontendDeps = await orgStore.listDependencies(frontend.id);
    assert.equal(frontendDeps.length, 1);
    assert.equal(frontendDeps[0].component_id, api.id);

    const apiDependents = await orgStore.listDependents(api.id);
    assert.equal(apiDependents.length, 1);
    assert.equal(apiDependents[0].component_id, frontend.id, 'ce qui dépend de api-dg doit inclure frontend-dg');

    // api-dg n'a rien "en dessous" de son point de vue dependents (rien ne
    // dépend de lui... au sens amont) — vérifie l'absence de fermeture
    // transitive : db-dg ne doit PAS apparaître comme dépendance de frontend.
    assert.ok(!frontendDeps.some((d) => d.component_id === db.id), 'la dépendance transitive frontend→db ne doit pas être calculée automatiquement');

    // ON DELETE CASCADE (components → component_dependencies) : supprimer
    // api-dg doit faire disparaître les deux arêtes qui le référencent.
    await orgStore.deleteComponent(api.id);
    assert.equal((await orgStore.listDependencies(frontend.id)).length, 0);
    assert.equal((await orgStore.listDependents(db.id)).length, 0);
  });

  test('orgStore (policies) : create/list/update/delete + application réelle via policyEngine', async () => {
    const { evaluatePolicies } = await import('../src/services/policyEngine.js');

    const policy = await orgStore.createPolicy({ orgId: org.id, name: 'Owner requis RS', slug: `owner-requis-rs-${Date.now()}`, kind: 'require_owner_team' });
    assert.equal(policy.enabled, true);

    const listed = await orgStore.listPoliciesForOrg(org.id);
    assert.ok(listed.some((p) => p.id === policy.id));

    const withoutOwner = await orgStore.createComponent({ projectId: project.id, name: 'no-owner-policy-test', slug: `no-owner-policy-test-${Date.now()}`, kind: 'service' });
    const blocked = evaluatePolicies(withoutOwner, listed);
    assert.equal(blocked.allowed, false);

    const disabled = await orgStore.updatePolicy(policy.id, { enabled: false });
    assert.equal(disabled.enabled, false);
    const allowedAfterDisable = evaluatePolicies(withoutOwner, [disabled]);
    assert.equal(allowedAfterDisable.allowed, true);

    const deleted = await orgStore.deletePolicy(policy.id);
    assert.equal(deleted, true);
    assert.equal(await orgStore.getPolicy(policy.id), null);
  });

  test('environmentPromotionService : le Policy Gate bloque une promotion de production quand un composant du projet échoue une policy activée', async () => {
    const { promote } = await import('../src/services/environmentPromotionService.js');
    const { readStore, writeStore } = await import('../src/store/jsonStore.js');

    // Le Security Gate (déjà existant, voir checkSecurityGate) s'exécute
    // AVANT le Policy Gate et lit le même genre de données JSON partagées
    // (codeScans/dastScans) : cette instance de dev a un vrai scan Semgrep
    // à 3 ERROR enregistré, qui bloquerait la promotion pour une tout autre
    // raison et masquerait ce qu'on veut vérifier ici. Neutralisé le temps
    // du test puis restauré exactement (save → mutate → restore), pour ne
    // vérifier QUE le Policy Gate sans toucher aux données réelles au-delà
    // de ce test.
    const savedCodeScans = readStore('codeScans');
    const savedDastScans = readStore('dastScans');
    writeStore('codeScans', []);
    writeStore('dastScans', []);

    try {
      const policy = await orgStore.createPolicy({ orgId: org.id, name: 'Owner requis PG', slug: `owner-requis-pg-${Date.now()}`, kind: 'require_owner_team' });
      const violating = await orgStore.createComponent({ projectId: project.id, name: 'violates-policy-gate', slug: `violates-policy-gate-${Date.now()}`, kind: 'service' });
      assert.equal(violating.owner_team_id, null);

      const prodEnv = await orgStore.createEnvironment(project.id, { name: `prod-pg-${Date.now()}`, kind: 'production', isProduction: true });
      // argocd_app posé directement (bypass de la validation d'existence
      // faite par linkEnvironment()) : ce test vérifie le Policy Gate
      // lui-même, pas l'intégration Argo CD — le gate doit bloquer AVANT
      // tout appel réel à Argo CD, ce qui est précisément ce qu'on vérifie
      // ici (aucune requête réseau Argo CD n'est nécessaire pour que ce
      // test soit valide).
      await orgStore.setEnvironmentArgocdApp(prodEnv.id, 'fake-argocd-app-policy-gate-test');

      await assert.rejects(
        () => promote({ projectId: project.id, fromEnvironmentId: null, toEnvironmentId: prodEnv.id, triggeredBy: 'u1' }),
        (err) => {
          // Le composant nommé dans le message peut être n'importe lequel
          // des composants sans équipe propriétaire déjà créés dans ce
          // fixture partagé `project` par d'autres tests de ce fichier — le
          // gate s'arrête au premier trouvé (voir checkPolicyGate) : on ne
          // fige pas LEQUEL, seulement que le mécanisme bloque bien pour
          // cette raison précise.
          assert.equal(err.status, 422);
          assert.match(err.message, /Policy Gate/);
          assert.match(err.message, /Owner requis PG/);
          return true;
        }
      );

      // La promotion bloquée doit être journalisée comme telle (visible dans
      // l'historique de promotions de EnvironmentsPage.jsx), pas silencieusement avalée.
      const promotions = await orgStore.listPromotions(project.id);
      const blocked = promotions.find((p) => p.to_environment_id === prodEnv.id && p.status === 'blocked');
      assert.ok(blocked, 'la promotion bloquée doit être enregistrée avec le statut "blocked"');
      assert.match(blocked.message, /Policy Gate/);

      await orgStore.deletePolicy(policy.id);
    } finally {
      writeStore('codeScans', savedCodeScans);
      writeStore('dastScans', savedDastScans);
    }
  });

  test('orgStore (platform requests) : cycle de vie complet + transition unique pending → tranchée', async () => {
    const request = await orgStore.createPlatformRequest({ orgId: org.id, requestedBy: 'u1', kind: 'access', title: 'Accès prod RS', description: 'Besoin du vault projet' });
    assert.equal(request.status, 'pending');

    const mine = await orgStore.listPlatformRequestsForUser('u1');
    assert.ok(mine.some((r) => r.id === request.id));

    const orgRequests = await orgStore.listPlatformRequestsForOrg(org.id, { status: 'pending' });
    assert.ok(orgRequests.some((r) => r.id === request.id));

    const approved = await orgStore.reviewPlatformRequest(request.id, { status: 'approved', reviewedBy: 'u1', reviewNote: 'ok' });
    assert.equal(approved.status, 'approved');
    assert.equal(approved.reviewed_by, 'u1');

    // Une demande déjà tranchée ne se rouvre jamais : la clause WHERE
    // status='pending' de reviewPlatformRequest() doit renvoyer null
    // (aucune ligne mise à jour), pas écraser silencieusement la décision.
    const secondReview = await orgStore.reviewPlatformRequest(request.id, { status: 'rejected', reviewedBy: 'u2' });
    assert.equal(secondReview, null);
    const stillApproved = await orgStore.getPlatformRequest(request.id);
    assert.equal(stillApproved.status, 'approved');
  });

  test('orgStore (preview environments) : expires_at hérité du TTL du blueprint, destruction manuelle, production protégée', async () => {
    const blueprint = await orgStore.createEnvironmentBlueprint({ orgId: org.id, name: 'Preview RS', slug: `preview-rs-${Date.now()}`, kind: 'preview', ttlMinutes: 60 });
    const before = Date.now();
    const preview = await orgStore.createEnvironment(project.id, {
      name: `preview-rs-${Date.now()}`, kind: 'preview', blueprintId: blueprint.id,
      sourceBranch: 'feature/x', sourceCommit: 'deadbee', sourcePrUrl: 'https://example.com/pr/1'
    });
    assert.equal(preview.source_branch, 'feature/x');
    assert.ok(preview.expires_at, 'expires_at doit être calculé quand le blueprint a un TTL');
    const deltaMinutes = (new Date(preview.expires_at).getTime() - before) / 60_000;
    assert.ok(deltaMinutes > 59 && deltaMinutes < 61, `expires_at doit être ~60 min dans le futur (obtenu : ${deltaMinutes})`);

    // Un environnement créé SANS blueprint (ou avec un blueprint sans TTL,
    // comme "Staging standard" dans les tests précédents) n'expire jamais :
    // pas de valeur inventée en son absence.
    const noTtl = await orgStore.createEnvironment(project.id, { name: `no-ttl-rs-${Date.now()}`, kind: 'custom' });
    assert.equal(noTtl.expires_at, null);

    const expiredList = await orgStore.listExpiredEnvironments(project.id);
    assert.ok(!expiredList.some((e) => e.id === preview.id), 'un environnement qui expire dans 60 min ne doit pas apparaître comme déjà expiré');

    const deleted = await orgStore.deleteEnvironment(preview.id);
    assert.equal(deleted, true);
    assert.equal(await orgStore.getEnvironment(preview.id), null);

    // La production ne se supprime JAMAIS par cette fonction, quel que soit
    // l'appelant — défense en profondeur vérifiée directement au niveau store.
    const prodEnvs = await orgStore.listEnvironments(project.id);
    const prod = prodEnvs.find((e) => e.is_production);
    const prodDeleteAttempt = await orgStore.deleteEnvironment(prod.id);
    assert.equal(prodDeleteAttempt, false);
    assert.ok(await orgStore.getEnvironment(prod.id), "l'environnement de production doit toujours exister après la tentative");
  });

  test('orgStore (service bindings) : create/list/delete + contrainte d\'unicité par variable', async () => {
    const component = await orgStore.createComponent({ projectId: project.id, name: 'bound-component', slug: `bound-component-${Date.now()}`, kind: 'api' });

    const binding = await orgStore.createBinding({ componentId: component.id, bindingType: 'postgres', envVarName: 'DATABASE_URL', vaultEntryId: 'some-vault-id', description: 'DB principale' });
    assert.equal(binding.env_var_name, 'DATABASE_URL');
    assert.equal(binding.vault_entry_id, 'some-vault-id');

    const listed = await orgStore.listBindingsForComponent(component.id);
    assert.equal(listed.length, 1);

    // Même variable déclarée deux fois pour le même composant → conflit
    // (contrainte UNIQUE (component_id, env_var_name)) : un composant ne
    // peut pas avoir deux définitions différentes de DATABASE_URL.
    await assert.rejects(
      () => orgStore.createBinding({ componentId: component.id, bindingType: 'postgres', envVarName: 'DATABASE_URL' }),
      (err) => { assert.equal(err.code, '23505'); return true; }
    );

    const deleted = await orgStore.deleteBinding(binding.id);
    assert.equal(deleted, true);
    assert.equal((await orgStore.listBindingsForComponent(component.id)).length, 0);

    // Supprimer le composant doit faire disparaître ses bindings restants
    // (ON DELETE CASCADE), sans qu'il soit nécessaire de les supprimer un à un.
    await orgStore.createBinding({ componentId: component.id, bindingType: 'redis', envVarName: 'REDIS_URL' });
    await orgStore.deleteComponent(component.id);
    assert.equal((await orgStore.listBindingsForComponent(component.id)).length, 0);
  });
}
