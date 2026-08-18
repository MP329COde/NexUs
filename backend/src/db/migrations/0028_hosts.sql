-- Migration de hostsStore.js (JSON) vers Postgres (ÉTAPE 27 IDP, audit des
-- anciens stores) : hôtes gérés par la console (Infrastructure → Hôtes &
-- agents), portée plateforme entière (pas encore scopée par
-- organisation/projet — comme c'était déjà le cas côté JSON). Aucun secret
-- stocké ici : l'authentification SSH utilise la clé unique de la console
-- (utils/sshKeypair.js), jamais un identifiant par hôte.
CREATE TABLE IF NOT EXISTS hosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  ssh_user TEXT NOT NULL DEFAULT 'root',
  role TEXT NOT NULL DEFAULT '',
  critical BOOLEAN NOT NULL DEFAULT false,
  last_install JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
