import { query } from '../db/pool.js';

// Migré de jsonStore.js vers Postgres (ÉTAPE 27 IDP, audit des anciens
// stores) — voir migration 0028. Un hôte géré ne stocke aucun secret :
// l'authentification se fait avec la clé privée unique de la console (voir
// utils/sshKeypair.js), dont la clé publique doit être copiée manuellement
// dans authorized_keys sur l'hôte. Contrairement au socle organisations
// (orgStore.js), ce store n'est jamais scopé par organisation/projet — les
// hôtes restent une ressource de plateforme, comme côté JSON avant lui.
function toApi(row) {
  if (!row) return row;
  return {
    id: row.id, name: row.name, address: row.address, port: row.port,
    sshUser: row.ssh_user, role: row.role, critical: row.critical,
    lastInstall: row.last_install || null, createdAt: row.created_at
  };
}

export async function listHosts() {
  const { rows } = await query('SELECT * FROM hosts ORDER BY created_at');
  return rows.map(toApi);
}

export async function getHost(id) {
  const { rows } = await query('SELECT * FROM hosts WHERE id = $1', [id]);
  return toApi(rows[0]);
}

export async function createHost({ name, address, port, sshUser, role, critical }) {
  const { rows } = await query(
    `INSERT INTO hosts (name, address, port, ssh_user, role, critical) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name, address, port ? Number(port) : 22, sshUser || 'root', role || '', Boolean(critical)]
  );
  return toApi(rows[0]);
}

export async function updateHost(id, payload) {
  const existing = await getHost(id);
  if (!existing) return null;
  const merged = { ...existing, ...payload };
  const { rows } = await query(
    `UPDATE hosts SET name = $2, address = $3, port = $4, ssh_user = $5, role = $6, critical = $7 WHERE id = $1 RETURNING *`,
    [id, merged.name, merged.address, payload.port ? Number(payload.port) : merged.port, merged.sshUser, merged.role, Boolean(merged.critical)]
  );
  return toApi(rows[0]);
}

export async function recordInstallResult(id, result) {
  const { rows } = await query(
    `UPDATE hosts SET last_install = $2 WHERE id = $1 RETURNING *`,
    [id, JSON.stringify({ ...result, at: new Date().toISOString() })]
  );
  return toApi(rows[0]);
}

export async function deleteHost(id) {
  const { rowCount } = await query('DELETE FROM hosts WHERE id = $1', [id]);
  return rowCount > 0;
}
