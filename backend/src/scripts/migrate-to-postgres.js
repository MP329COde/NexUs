#!/usr/bin/env node
// Migration ponctuelle et idempotente : importe les utilisateurs et projets
// existants du store JSON/SQLite historique (backend/data/nexus.db) vers le
// socle relationnel Postgres (organisations, projets, membres, environnements).
// Ne supprime ni ne modifie rien dans l'ancien store — les deux cohabitent
// (voir store/orgStore.js). Peut être relancée sans effet de bord : les
// projets déjà migrés (legacy_id déjà présent) sont ignorés.
//
// Usage : DATABASE_URL=postgres://... node src/scripts/migrate-to-postgres.js

import { readStore } from '../store/jsonStore.js';
import { runMigrations } from '../db/migrate.js';
import { pool, requirePool } from '../db/pool.js';
import * as orgStore from '../store/orgStore.js';
import { logger } from '../utils/logger.js';

async function main() {
  if (!pool) {
    logger.error('DATABASE_URL non défini : rien à migrer.');
    process.exit(1);
  }
  await runMigrations();

  const users = readStore('users') || [];
  const projects = readStore('projects') || [];

  const { rows: existingOrgs } = await requirePool().query('SELECT * FROM organizations LIMIT 1');
  let org = existingOrgs[0];
  const admins = users.filter((u) => u.role === 'admin');
  if (!org) {
    if (admins.length === 0) {
      logger.warn("Aucun administrateur trouvé : impossible de créer l'organisation par défaut pour l'instant. Relancez ce script après le premier bootstrap admin.");
      return;
    }
    org = await orgStore.createOrganization({ name: 'Organisation par défaut', slug: 'default', ownerUserId: admins[0].id });
    logger.info(`Organisation par défaut créée (${org.id}).`);
  }

  // Tous les utilisateurs existants rejoignent l'organisation par défaut :
  // admins en tant qu'owner (accès complet à tous les projets, cohérent avec
  // le comportement historique "role === 'admin' voit tout"), les autres en
  // tant que member simple (le rôle projet réel reste déterminé par
  // project_members, pas par l'appartenance à l'organisation).
  for (const user of users) {
    const role = user.role === 'admin' ? 'owner' : 'member';
    await requirePool().query(
      `INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (org_id, user_id) DO UPDATE SET role = excluded.role`,
      [org.id, user.id, role]
    );
  }
  logger.info(`${users.length} utilisateur(s) rattaché(s) à l'organisation par défaut.`);

  let migratedCount = 0;
  for (const project of projects) {
    const existing = await orgStore.getProjectByLegacyId(project.id);
    if (existing) continue;
    const pgProject = await orgStore.createProject({
      orgId: org.id,
      name: project.name,
      slug: slugify(project.name, project.id),
      description: project.description,
      tags: project.tags,
      repoKeys: project.repoKeys,
      legacyId: project.id
    });
    for (const memberId of project.memberIds || []) {
      const isAdmin = users.find((u) => u.id === memberId)?.role === 'admin';
      await orgStore.setMemberRole(pgProject.id, memberId, isAdmin ? 'owner' : 'maintainer');
    }
    migratedCount++;
  }
  logger.info(`${migratedCount} projet(s) migré(s) vers le socle relationnel (${projects.length - migratedCount} déjà à jour).`);
}

function slugify(name, fallbackId) {
  const slug = String(name || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || `projet-${fallbackId.slice(0, 8)}`;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'Échec de la migration vers Postgres');
    process.exit(1);
  });
