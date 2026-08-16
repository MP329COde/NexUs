import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Demandes d'accès au terminal sécurisé — un utilisateur sans palier (ou
// souhaitant un palier supérieur) fait une demande en self-service depuis
// la page Terminal ; un admin l'approuve ou la refuse depuis Paramètres →
// Utilisateurs (voir usersStore.setTerminalTier). Remplace l'ancien
// parcours "demandez en personne à un administrateur".
export function listRequests() {
  return readStore('terminalAccessRequests') || [];
}

export function listPending() {
  return listRequests().filter((r) => r.status === 'pending');
}

// Une seule demande en attente à la fois par utilisateur — resoumettre alors
// qu'une demande est déjà pendante n'a pas de sens et pollue la file admin.
export function findPendingForUser(userId) {
  return listRequests().find((r) => r.userId === userId && r.status === 'pending') || null;
}

export function createRequest({ userId, userEmail, userName, requestedTier, reason }) {
  const requests = listRequests();
  const entry = {
    id: uuid(), userId, userEmail, userName, requestedTier, reason: reason || '',
    status: 'pending', createdAt: new Date().toISOString(), decidedAt: null, decidedBy: null
  };
  requests.unshift(entry);
  writeStore('terminalAccessRequests', requests.slice(0, 500));
  return entry;
}

export function decideRequest(id, { approve, decidedBy }) {
  const requests = listRequests();
  const entry = requests.find((r) => r.id === id);
  if (!entry) return null;
  entry.status = approve ? 'approved' : 'denied';
  entry.decidedAt = new Date().toISOString();
  entry.decidedBy = decidedBy || null;
  writeStore('terminalAccessRequests', requests);
  return entry;
}
