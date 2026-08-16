import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Clés d'accès (passkeys WebAuthn) enregistrées par utilisateur. La clé
// publique et l'identifiant de credential ne sont pas des secrets au sens
// du coffre-fort (rien ne permet de s'authentifier avec eux seuls sans
// l'authentificateur physique/biométrique correspondant) : stockage en
// clair comme le reste des métadonnées de compte, pas de chiffrement
// supplémentaire nécessaire.
export function listAllCredentials() {
  return readStore('webauthnCredentials') || [];
}

export function listCredentialsForUser(userId) {
  return listAllCredentials().filter((c) => c.userId === userId);
}

export function findCredentialById(credentialId) {
  return listAllCredentials().find((c) => c.credentialId === credentialId) || null;
}

export function addCredential({ userId, credentialId, publicKey, counter, deviceType, backedUp, transports, label }) {
  const all = listAllCredentials();
  const entry = {
    id: uuid(), userId, credentialId, publicKey, counter,
    deviceType, backedUp, transports: transports || [],
    label: label || 'Clé d\'accès', createdAt: new Date().toISOString(), lastUsedAt: null
  };
  all.push(entry);
  writeStore('webauthnCredentials', all);
  return entry;
}

export function updateCounter(credentialId, counter) {
  const all = listAllCredentials();
  const entry = all.find((c) => c.credentialId === credentialId);
  if (!entry) return null;
  entry.counter = counter;
  entry.lastUsedAt = new Date().toISOString();
  writeStore('webauthnCredentials', all);
  return entry;
}

export function removeCredential(userId, id) {
  const all = listAllCredentials();
  const next = all.filter((c) => !(c.id === id && c.userId === userId));
  if (next.length === all.length) return false;
  writeStore('webauthnCredentials', next);
  return true;
}
