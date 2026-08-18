import { query } from '../db/pool.js';
import { parseCpuToMillicores, parseMemoryToBytes } from './k8sQuantity.js';

// Quotas (ÉTAPE 26 IDP) : bloque proprement la création d'un environnement
// qui dépasserait une limite définie par l'organisation — jamais une limite
// implicite ou une estimation approximative, uniquement des sommes réelles
// recalculées depuis les blueprints effectivement attachés aux
// environnements existants (join environments → environment_blueprints,
// jamais un compteur qui pourrait diverger).
export async function getOrgQuota(orgId) {
  const { rows } = await query('SELECT * FROM org_quotas WHERE org_id = $1', [orgId]);
  return rows[0] || null;
}

export async function setOrgQuota(orgId, { maxEnvironments, maxCpuMillicores, maxMemoryBytes, updatedBy }) {
  const { rows } = await query(
    `INSERT INTO org_quotas (org_id, max_environments, max_cpu_millicores, max_memory_bytes, updated_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (org_id) DO UPDATE SET
       max_environments = excluded.max_environments, max_cpu_millicores = excluded.max_cpu_millicores,
       max_memory_bytes = excluded.max_memory_bytes, updated_by = excluded.updated_by, updated_at = now()
     RETURNING *`,
    [orgId, maxEnvironments ?? null, maxCpuMillicores ?? null, maxMemoryBytes ?? null, updatedBy]
  );
  return rows[0];
}

// Utilisation réelle actuelle : nombre d'environnements de l'organisation,
// et somme CPU/mémoire des blueprints réellement attachés (un environnement
// sans blueprint ne consomme aucune ressource CPU/mémoire comptée ici —
// cohérent avec le fait qu'aucun ResourceQuota Kubernetes n'est appliqué
// sans blueprint, voir environmentProvisioningService.js).
export async function computeOrgUsage(orgId) {
  const { rows } = await query(
    `SELECT b.cpu, b.memory
     FROM environments e
     JOIN projects p ON p.id = e.project_id
     LEFT JOIN environment_blueprints b ON b.id = e.blueprint_id
     WHERE p.org_id = $1`,
    [orgId]
  );
  let cpuMillicores = 0;
  let memoryBytes = 0;
  for (const row of rows) {
    if (row.cpu) cpuMillicores += parseCpuToMillicores(row.cpu);
    if (row.memory) memoryBytes += parseMemoryToBytes(row.memory);
  }
  return { environmentCount: rows.length, cpuMillicores, memoryBytes };
}

// Vérifie qu'ajouter UN environnement de plus (avec, optionnellement, le
// blueprint choisi) resterait sous le quota — appelée avant la création
// réelle (routes/projects.routes.js), jamais après coup. Silencieuse
// (autorise tout) si aucun quota n'a été défini pour l'organisation.
export async function checkQuotaBeforeCreate(orgId, blueprint) {
  const quota = await getOrgQuota(orgId);
  if (!quota) return { allowed: true };

  const usage = await computeOrgUsage(orgId);

  if (quota.max_environments != null && usage.environmentCount + 1 > quota.max_environments) {
    return { allowed: false, reason: `Quota atteint : ${usage.environmentCount}/${quota.max_environments} environnements déjà utilisés pour cette organisation.` };
  }

  const addedCpu = blueprint?.cpu ? parseCpuToMillicores(blueprint.cpu) : 0;
  if (quota.max_cpu_millicores != null && usage.cpuMillicores + addedCpu > quota.max_cpu_millicores) {
    return { allowed: false, reason: `Quota CPU atteint : ${usage.cpuMillicores}m + ${addedCpu}m dépasserait la limite de ${quota.max_cpu_millicores}m pour cette organisation.` };
  }

  const addedMemory = blueprint?.memory ? parseMemoryToBytes(blueprint.memory) : 0;
  if (quota.max_memory_bytes != null && usage.memoryBytes + addedMemory > quota.max_memory_bytes) {
    return { allowed: false, reason: `Quota mémoire atteint : la limite de ${Math.round(quota.max_memory_bytes / 1024 ** 2)}Mi pour cette organisation serait dépassée.` };
  }

  return { allowed: true };
}
