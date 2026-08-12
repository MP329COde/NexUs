import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

export const ASSET_CATEGORIES = ['serveur', 'stockage', 'réseau', 'poste', 'autre'];
export const ASSET_STATES = ['en_service', 'en_maintenance', 'hors_service', 'stock'];

export function listAssets() {
  return readStore('inventory');
}

export function createAsset(payload) {
  const { name, category } = payload;
  if (!name || !category) {
    throw Object.assign(new Error('Nom et catégorie requis'), { status: 400 });
  }
  const assets = listAssets();
  const asset = {
    id: uuid(),
    name,
    category: ASSET_CATEGORIES.includes(category) ? category : 'autre',
    serialNumber: payload.serialNumber || '',
    acquiredAt: payload.acquiredAt || null,
    warrantyUntil: payload.warrantyUntil || null,
    estimatedValue: Number(payload.estimatedValue) || 0,
    state: ASSET_STATES.includes(payload.state) ? payload.state : 'en_service',
    notes: payload.notes || '',
    createdAt: new Date().toISOString()
  };
  assets.push(asset);
  writeStore('inventory', assets);
  return asset;
}

export function updateAsset(id, patch) {
  const assets = listAssets();
  const idx = assets.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const next = { ...assets[idx], ...patch };
  if (patch.category && !ASSET_CATEGORIES.includes(patch.category)) next.category = assets[idx].category;
  if (patch.state && !ASSET_STATES.includes(patch.state)) next.state = assets[idx].state;
  if (patch.estimatedValue !== undefined) next.estimatedValue = Number(patch.estimatedValue) || 0;
  assets[idx] = next;
  writeStore('inventory', assets);
  return next;
}

export function deleteAsset(id) {
  const assets = listAssets();
  const next = assets.filter((a) => a.id !== id);
  if (next.length === assets.length) return false;
  writeStore('inventory', next);
  return true;
}
