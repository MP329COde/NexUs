import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

export const VOLUME_TYPES = ['volume', 'nas', 'zfs_pool', 'partage'];

// Suivi déclaratif des volumes de stockage (l'admin renseigne capacité/usage
// manuellement ou via un futur script de collecte) : pas de découverte
// automatique aujourd'hui, faute d'intégration NAS/ZFS branchée. Le seuil
// d'alerte est calculé côté lecture à partir de totalGB/usedGB.
export function listVolumes() {
  return readStore('volumes') || [];
}

export function createVolume(payload) {
  const { name, type } = payload;
  if (!name || !type) {
    throw Object.assign(new Error('Nom et type requis'), { status: 400 });
  }
  const volumes = listVolumes();
  const volume = {
    id: uuid(),
    name,
    type: VOLUME_TYPES.includes(type) ? type : 'volume',
    host: payload.host || '',
    totalGB: Number(payload.totalGB) || 0,
    usedGB: Number(payload.usedGB) || 0,
    notes: payload.notes || '',
    createdAt: new Date().toISOString()
  };
  volumes.push(volume);
  writeStore('volumes', volumes);
  return volume;
}

export function updateVolume(id, patch) {
  const volumes = listVolumes();
  const idx = volumes.findIndex((v) => v.id === id);
  if (idx === -1) return null;
  const next = { ...volumes[idx], ...patch };
  if (patch.totalGB !== undefined) next.totalGB = Number(patch.totalGB) || 0;
  if (patch.usedGB !== undefined) next.usedGB = Number(patch.usedGB) || 0;
  if (patch.type && !VOLUME_TYPES.includes(patch.type)) next.type = volumes[idx].type;
  volumes[idx] = next;
  writeStore('volumes', volumes);
  return next;
}

export function deleteVolume(id) {
  const volumes = listVolumes();
  const next = volumes.filter((v) => v.id !== id);
  if (next.length === volumes.length) return false;
  writeStore('volumes', next);
  return true;
}
