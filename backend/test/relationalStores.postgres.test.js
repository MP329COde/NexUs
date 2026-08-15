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
}
