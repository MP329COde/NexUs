import { readStore, writeStore } from './jsonStore.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';

const SECRET_FIELDS = ['oidcClientSecret', 'ldapBindPassword'];
export const DEFAULT_SESSION_MINUTES = 720; // 12h, aligné sur le comportement historique

// Politique de connexion (durée de session, longueur minimale de mot de
// passe) + configuration SSO. Note importante : le fournisseur OIDC/LDAP est
// enregistré et testable (POST /identity/test-oidc), mais n'est PAS encore un
// second chemin de connexion actif — seul le mot de passe local authentifie
// aujourd'hui. Voir le Manuel pour le détail de cette limite volontaire.
export function getRaw() {
  const data = readStore('identity') || {};
  const decrypted = { ...data };
  for (const field of SECRET_FIELDS) {
    if (data[field]) decrypted[field] = decryptSecret(data[field]);
  }
  return decrypted;
}

export function getRedacted() {
  const data = readStore('identity') || {};
  const redacted = { ...data };
  for (const field of SECRET_FIELDS) {
    redacted[field] = undefined;
    redacted[`${field}Set`] = Boolean(data[field]);
  }
  return redacted;
}

export function save(payload) {
  const existing = readStore('identity') || {};
  const next = { ...existing, ...payload };
  for (const field of SECRET_FIELDS) {
    if (payload[field]) next[field] = encryptSecret(payload[field]);
    else next[field] = existing[field] ?? null;
  }
  writeStore('identity', next);
  return getRedacted();
}

export function getSessionMinutes() {
  const data = readStore('identity') || {};
  const minutes = Number(data.sessionMinutes);
  return Number.isInteger(minutes) && minutes >= 5 && minutes <= 10080 ? minutes : DEFAULT_SESSION_MINUTES;
}

export function getMinPasswordLength() {
  const data = readStore('identity') || {};
  const len = Number(data.minPasswordLength);
  return Number.isInteger(len) && len >= 8 && len <= 128 ? len : 8;
}

// Complexité de mot de passe (todo.md, chantier sécurité de plateforme) :
// désactivée par défaut (comportement historique inchangé, seule la longueur
// minimale s'appliquait) — chaque règle est un booléen indépendant plutôt
// qu'un niveau global, pour ne jamais activer une contrainte que
// l'administrateur n'a pas explicitement choisie.
export function getPasswordComplexity() {
  const data = readStore('identity') || {};
  return {
    requireUppercase: Boolean(data.pwRequireUppercase),
    requireDigit: Boolean(data.pwRequireDigit),
    requireSymbol: Boolean(data.pwRequireSymbol)
  };
}

// Restriction CIDR de connexion : liste vide = aucune restriction (défaut,
// comportement historique inchangé). Volontairement PAS de validation ici
// qui empêcherait d'enregistrer une valeur "risquée" — la route d'API
// (routes/identity.routes.js) est celle qui doit avertir/confirmer avant
// d'appliquer une restriction pouvant verrouiller l'administrateur
// lui-même hors de la console.
export function getLoginCidrAllowlist() {
  const data = readStore('identity') || {};
  return Array.isArray(data.loginCidrAllowlist) ? data.loginCidrAllowlist : [];
}

// Lot B3 (durcissement auth) — MFA obligatoire par rôle : liste vide = aucun
// rôle contraint (défaut, comportement historique inchangé — le MFA reste
// une option que chacun active ou non). Un rôle présent ici force
// middleware/auth.js#requireAuth à bloquer (403 mfaSetupRequired) tout accès
// aux routes protégées pour un compte de ce rôle tant que mfaEnabled=false,
// à l'exception des routes d'enrôlement listées dans
// MFA_ENROLLMENT_ALLOWED_PATHS. Ne s'applique qu'aux comptes déjà créés
// avant l'activation : un admin qui active cette contrainte sur son propre
// rôle sans avoir configuré son MFA se bloquerait lui-même à la requête
// suivante — voir l'avertissement rendu par la route PUT /identity.
export function getMfaRequiredRoles() {
  const data = readStore('identity') || {};
  return Array.isArray(data.mfaRequiredRoles) ? data.mfaRequiredRoles : [];
}

// Déconnexion sur inactivité : 0 = désactivé (défaut, comportement
// historique inchangé — seule l'expiration absolue du JWT, sessionMinutes,
// s'applique). Quand > 0, requireAuth compare `now` à sessions.lastSeenAt
// (store/sessionsStore.js) et révoque la session serveur dès que l'écart
// dépasse cette valeur — indépendant de la durée de vie du JWT lui-même.
// Choix documenté : les requêtes de polling/health (marquées côté frontend
// par l'en-tête X-Nexus-Background, voir lib/apiClient.js#markBackground)
// NE comptent PAS comme activité, pour ne jamais garder une session ouverte
// indéfiniment simplement parce qu'un onglet inactif continue de sonder un
// tableau de bord en arrière-plan.
export function getInactivityTimeoutMinutes() {
  const data = readStore('identity') || {};
  const minutes = Number(data.inactivityTimeoutMinutes);
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : 0;
}

// Point d'entrée unique combinant longueur minimale + complexité, pour que
// les quatre routes qui valident un mot de passe de compte (auth.routes.js
// changement/onboarding, users.routes.js création) appliquent exactement la
// même règle plutôt que de dupliquer la logique. Ne couvre PAS le mot de
// passe de coffre-fort projet (routes/projects.routes.js vault-password) :
// classe de secret différente, volontairement hors de cette politique de
// compte.
export function passwordPolicyError(password) {
  const minLength = getMinPasswordLength();
  if (!password || password.length < minLength) {
    return `Le mot de passe doit contenir au moins ${minLength} caractères`;
  }
  const { requireUppercase, requireDigit, requireSymbol } = getPasswordComplexity();
  if (requireUppercase && !/[A-Z]/.test(password)) return 'Le mot de passe doit contenir au moins une majuscule';
  if (requireDigit && !/[0-9]/.test(password)) return 'Le mot de passe doit contenir au moins un chiffre';
  if (requireSymbol && !/[^A-Za-z0-9]/.test(password)) return 'Le mot de passe doit contenir au moins un symbole';
  return null;
}
