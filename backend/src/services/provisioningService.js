import { v4 as uuid } from 'uuid';
import { runScript } from './sshExecutor.js';
import { buildServiceScript } from './serviceCatalog.js';
import * as hostsStore from '../store/hostsStore.js';

// Suivi en mémoire des jobs d'installation lancés depuis l'assistant de
// configuration initiale (écran « Installation » scindé, voir
// pages/Setup/InstallScreen.jsx). Volontairement non persisté : ces jobs ne
// concernent que la session de setup en cours, et la console garde de toute
// façon la trace définitive côté hôte via hostsStore (lastInstall).
const jobs = new Map();

// `run` injectable : les tests unitaires remplacent l'exécution SSH réelle
// par un double, sans avoir besoin d'un hôte accessible.
export async function startInstall({ toolId, address, port, sshUser }, { run = runScript } = {}) {
  if (!address || !String(address).trim()) {
    throw Object.assign(new Error('Adresse de la machine requise'), { status: 400 });
  }

  const host = await hostsStore.createHost({ name: `Setup · ${toolId}`, address, port, sshUser });
  const id = uuid();
  const job = {
    id, toolId, hostId: host.id, address,
    status: 'connecting', message: null,
    startedAt: new Date().toISOString(), finishedAt: null
  };
  jobs.set(id, job);

  let script;
  try {
    script = buildServiceScript(toolId, { address });
  } catch (err) {
    job.status = 'error';
    job.message = err.message;
    job.finishedAt = new Date().toISOString();
    return job;
  }

  job.status = 'installing';
  run(host, script)
    .then((result) => {
      job.status = result.ok ? 'success' : 'error';
      job.message = result.ok ? 'Installation réussie' : `Échec de l'installation (code ${result.exitCode})`;
      job.finishedAt = new Date().toISOString();
      hostsStore.recordInstallResult(host.id, { agentId: toolId, ok: result.ok, message: job.message });
    })
    .catch((err) => {
      job.status = 'error';
      job.message = err.message;
      job.finishedAt = new Date().toISOString();
      hostsStore.recordInstallResult(host.id, { agentId: toolId, ok: false, message: err.message });
    });

  return job;
}

export function getJobs(ids) {
  const all = [...jobs.values()];
  if (!ids || !ids.length) return all;
  return ids.map((id) => jobs.get(id)).filter(Boolean);
}

// Réservé aux tests : repart d'un registre de jobs vide entre deux scénarios.
export function _resetJobs() {
  jobs.clear();
}
