import { pool, query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

// Sauvegarde/restauration du socle relationnel (organisations, équipes,
// projets, environnements, jobs, incidents, changements, composants,
// policies, platform requests, etc.) en JSON plutôt qu'avec pg_dump : évite
// une dépendance à un binaire externe qui pourrait être absent du système
// (cohérent avec db/migrate.js, volontairement sans dépendance externe non
// plus). TABLES_IN_ORDER doit rester à jour avec le schéma (voir
// src/db/migrations) : toute table manquante ici est silencieusement perdue
// à la restauration, et toute table dans le mauvais ordre casse une
// contrainte de clé étrangère au moment de la réinsertion.
//
// N'écrit rien dans schema_migrations : une restauration s'applique sur une
// base dont les migrations ont déjà tourné (même version de Nexus), pas sur
// une base vierge — restaurer une sauvegarde plus ancienne qu'un schéma
// incompatible n'est pas un cas supporté.
const TABLES_IN_ORDER = [
  'organizations', 'org_members', 'teams', 'team_members',
  'projects', 'project_members', 'project_resource_grants',
  'environment_blueprints', 'environments', 'environment_promotions',
  'jobs', 'incidents', 'incident_comments', 'changes', 'maintenance_windows',
  'wiki_pages', 'wiki_page_revisions',
  'policies', 'components', 'component_dependencies', 'component_bindings',
  'platform_requests'
];

export function relationalCoreConfigured() {
  return Boolean(pool);
}

export async function dumpRelationalCore() {
  if (!pool) return null;
  const tables = {};
  for (const table of TABLES_IN_ORDER) {
    const { rows } = await query(`SELECT * FROM ${table}`);
    tables[table] = rows;
  }
  return { version: 1, dumpedAt: new Date().toISOString(), tables };
}

// Remplace entièrement le contenu des tables du socle relationnel par celui
// du dump, dans une seule transaction (tout ou rien : jamais d'état à moitié
// restauré). TRUNCATE ... CASCADE plutôt qu'un DELETE table par table :
// plus sûr vis-à-vis de l'ordre des contraintes de clé étrangère.
export async function restoreRelationalCore(dump) {
  if (!pool) throw Object.assign(new Error("DATABASE_URL n'est pas configuré"), { status: 503 });
  if (!dump || dump.version !== 1 || !dump.tables) {
    throw Object.assign(new Error('Sauvegarde du socle relationnel invalide ou incompatible'), { status: 400 });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`TRUNCATE ${TABLES_IN_ORDER.join(', ')} RESTART IDENTITY CASCADE`);
    for (const table of TABLES_IN_ORDER) {
      const rows = dump.tables[table] || [];
      for (const row of rows) {
        const columns = Object.keys(row);
        if (columns.length === 0) continue;
        // Les colonnes JSONB (tags, links, payload, result...) reviennent de dumpRelationalCore()
        // déjà parsées en objets/tableaux JS par le driver pg. Réinjectées telles quelles comme
        // paramètres, pg les sérialise en littéral de tableau Postgres ("{a,b}") plutôt qu'en JSON,
        // ce que la colonne jsonb refuse : il faut les re-stringifier explicitement avant l'INSERT.
        const values = columns.map((c) => {
          const value = row[c];
          return value !== null && typeof value === 'object' && !(value instanceof Date)
            ? JSON.stringify(value)
            : value;
        });
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
          values
        );
      }
    }
    await client.query('COMMIT');
    logger.warn(`Socle relationnel restauré (${Object.values(dump.tables).reduce((n, r) => n + r.length, 0)} lignes au total).`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
