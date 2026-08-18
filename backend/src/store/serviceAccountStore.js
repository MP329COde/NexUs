import crypto from 'node:crypto';
import { query } from '../db/pool.js';

// Scopes reconnus par l'API publique (ÉTAPE 23/24 IDP) — volontairement une
// liste fermée courte plutôt qu'une chaîne libre : chaque scope doit
// correspondre à une vérification réelle quelque part (voir
// middleware/serviceAuth.js#requireScope), jamais une case cochée sans effet.
export const SERVICE_ACCOUNT_SCOPES = ['catalog:read', 'environment:read', 'deployment:create'];

const TOKEN_PREFIX = 'nxs_sa_';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Le token brut n'est retourné qu'ICI, à la création — jamais persisté en
// clair, jamais reconstructible ensuite (voir migration 0026).
export async function createServiceAccount({ orgId, name, scopes, createdBy }) {
  const invalid = scopes.filter((s) => !SERVICE_ACCOUNT_SCOPES.includes(s));
  if (invalid.length > 0) throw Object.assign(new Error(`Scope(s) invalide(s) : ${invalid.join(', ')}`), { status: 400 });
  const rawToken = TOKEN_PREFIX + crypto.randomBytes(32).toString('hex');
  const { rows } = await query(
    `INSERT INTO service_accounts (org_id, name, token_hash, scopes, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, org_id, name, scopes, created_by, created_at, last_used_at, revoked_at`,
    [orgId, name, hashToken(rawToken), scopes, createdBy]
  );
  return { serviceAccount: rows[0], token: rawToken };
}

export async function listServiceAccountsForOrg(orgId) {
  const { rows } = await query(
    'SELECT id, org_id, name, scopes, created_by, created_at, last_used_at, revoked_at FROM service_accounts WHERE org_id = $1 ORDER BY created_at DESC',
    [orgId]
  );
  return rows;
}

export async function getServiceAccount(id) {
  const { rows } = await query('SELECT id, org_id, name, scopes, created_by, created_at, last_used_at, revoked_at FROM service_accounts WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function revokeServiceAccount(id) {
  const { rows } = await query(
    `UPDATE service_accounts SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

// Authentification par token (ÉTAPE 23 IDP) : recherche par empreinte,
// jamais par comparaison en clair. Un token révoqué ou d'un format inconnu
// ne renvoie jamais de compte — même erreur générique côté appelant, pour
// ne pas distinguer "token révoqué" de "token inexistant".
export async function findByToken(rawToken) {
  if (!rawToken || !rawToken.startsWith(TOKEN_PREFIX)) return null;
  const { rows } = await query(
    'SELECT * FROM service_accounts WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashToken(rawToken)]
  );
  return rows[0] || null;
}

export async function touchLastUsed(id) {
  await query('UPDATE service_accounts SET last_used_at = now() WHERE id = $1', [id]);
}
