// Miroir du LEVEL_RANK backend (store/groupsStore.js) : évite un aller-retour
// réseau pour chaque vérification d'affichage (masquage de menu, garde
// d'onglet) une fois que /auth/me a renvoyé la matrice de permissions.
const LEVEL_RANK = { none: 0, read: 1, write: 2, admin: 3 };

export function hasPermission(user, domain, minLevel = 'read') {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const level = user.permissions?.[domain] || 'none';
  return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
}
