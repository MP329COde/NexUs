import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

// Pool partagé pour le socle relationnel (organisations, équipes, projets,
// environnements — voir db/migrations). Le reste de la plateforme continue
// d'utiliser store/jsonStore.js (SQLite clé/valeur) pendant la migration
// progressive prévue en Phase 1b : les deux stockages coexistent
// délibérément (stratégie "strangler"), voir README section Architecture.
export const pool = env.databaseUrl
  ? new Pool({ connectionString: env.databaseUrl, max: 10 })
  : null;

export function requirePool() {
  if (!pool) {
    throw Object.assign(
      new Error("DATABASE_URL n'est pas configuré : le socle organisations/projets/environnements est indisponible"),
      { status: 503 }
    );
  }
  return pool;
}

export async function query(text, params) {
  return requirePool().query(text, params);
}
