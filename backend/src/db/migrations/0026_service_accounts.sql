-- Service Accounts (ÉTAPE 23 IDP) : identité non humaine pour la CI/CD
-- externe, jamais un compte utilisateur détourné. Le token n'est JAMAIS
-- stocké en clair — seul son empreinte SHA-256 (recherche déterministe en
-- O(1) par index, standard pour les Personal Access Tokens type GitHub :
-- contrairement à un mot de passe, le token est déjà 256 bits d'aléa
-- généré serveur, aucun sel n'apporte de protection supplémentaire contre
-- le brute-force hors-ligne). Affiché en clair une seule fois à la création
-- (voir routes/serviceAccounts.routes.js), jamais récupérable ensuite.
CREATE TABLE IF NOT EXISTS service_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_service_accounts_org ON service_accounts(org_id);
