import { query } from '../db/pool.js';

// Trace, par hôte, chaque service du catalogue (serviceCatalog.js) installé
// a posteriori — distinct de hosts.last_install qui n'enregistre qu'un seul
// évènement global (agent OU service, écrasé à chaque action). Alimente le
// bouton "Vérifier la mise à jour" / "Mettre à jour" du Lot D3 : jamais de
// version affichée sans un check réel enregistré ici (last_check_status
// reste NULL tant qu'aucun check n'a réussi ou échoué explicitement).
function toApi(row) {
  if (!row) return row;
  return {
    id: row.id, hostId: row.host_id, serviceId: row.service_id,
    installedAt: row.installed_at,
    lastCheckStatus: row.last_check_status || null,
    lastCheckAt: row.last_check_at || null,
    lastCheckDetail: row.last_check_detail || null,
    lastUpdateAt: row.last_update_at || null,
    lastUpdateOk: row.last_update_ok
  };
}

export async function listByHost(hostId) {
  const { rows } = await query('SELECT * FROM host_services WHERE host_id = $1 ORDER BY installed_at', [hostId]);
  return rows.map(toApi);
}

export async function get(hostId, serviceId) {
  const { rows } = await query('SELECT * FROM host_services WHERE host_id = $1 AND service_id = $2', [hostId, serviceId]);
  return toApi(rows[0]);
}

// Appelé après une installation réussie du service (route /hosts/:id/services/:serviceId/install).
export async function recordInstalled(hostId, serviceId) {
  const { rows } = await query(
    `INSERT INTO host_services (host_id, service_id) VALUES ($1, $2)
     ON CONFLICT (host_id, service_id) DO UPDATE SET installed_at = now()
     RETURNING *`,
    [hostId, serviceId]
  );
  return toApi(rows[0]);
}

// status ∈ 'up_to_date' | 'update_available' | 'error' | 'not_installed'.
// `error` couvre toute impossibilité de vérifier réellement (registre
// injoignable, hôte injoignable...) — ne JAMAIS mapper une erreur vers
// up_to_date/update_available (donnée inventée interdite par ce lot).
export async function recordCheck(hostId, serviceId, status, detail) {
  const { rows } = await query(
    `UPDATE host_services SET last_check_status = $3, last_check_at = now(), last_check_detail = $4
     WHERE host_id = $1 AND service_id = $2 RETURNING *`,
    [hostId, serviceId, status, detail || null]
  );
  return toApi(rows[0]);
}

export async function recordUpdate(hostId, serviceId, ok) {
  const { rows } = await query(
    `UPDATE host_services SET last_update_at = now(), last_update_ok = $3,
       last_check_status = CASE WHEN $3 THEN 'up_to_date' ELSE last_check_status END
     WHERE host_id = $1 AND service_id = $2 RETURNING *`,
    [hostId, serviceId, Boolean(ok)]
  );
  return toApi(rows[0]);
}
