import * as serviceAccountStore from '../store/serviceAccountStore.js';

// Authentification API publique par Service Account (ÉTAPE 23/24 IDP) —
// distincte de middleware/auth.js#requireAuth (sessions humaines JWT) :
// une CI externe ne doit jamais avoir besoin d'un compte utilisateur pour
// scripter la plateforme. req.serviceAccount est posé si le token est valide
// ET non révoqué ; requireScope() vérifie ensuite le scope demandé — les
// deux sont séparés pour que d'autres routes /api/v1 puissent réutiliser
// l'authentification sans dupliquer la vérification de scope.
export async function requireServiceAccount(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '');
  const account = await serviceAccountStore.findByToken(token);
  if (!account) return res.status(401).json({ ok: false, error: 'Jeton de service invalide ou révoqué' });
  req.serviceAccount = account;
  serviceAccountStore.touchLastUsed(account.id).catch(() => {}); // best-effort, ne bloque jamais la requête
  next();
}

export function requireScope(scope) {
  return (req, res, next) => {
    if (!req.serviceAccount?.scopes?.includes(scope)) {
      return res.status(403).json({ ok: false, error: `Scope requis : "${scope}"` });
    }
    next();
  };
}
