import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Migrations SQL versionnées, appliquées une seule fois chacune (table
// schema_migrations), dans l'ordre alphabétique des fichiers (0001_, 0002_...).
// Volontairement sans dépendance externe (Knex/Prisma) : le projet reste léger
// et chaque migration est un simple fichier .sql lisible et rejouable.
export async function runMigrations() {
  if (!pool) {
    logger.warn('DATABASE_URL absent : socle organisations/projets/environnements désactivé (migrations Postgres ignorées).');
    return;
  }
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    const { rows: applied } = await client.query('SELECT name FROM schema_migrations');
    const appliedNames = new Set(applied.map((r) => r.name));
    for (const file of files) {
      if (appliedNames.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        logger.info(`Migration Postgres appliquée : ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ err }, `Échec de la migration Postgres ${file}`);
        throw err;
      }
    }
  } finally {
    client.release();
  }
}
